-- GNANOVA — notifications, outbox (WhatsApp / email / webhook) and preferences.
-- Event rules call app.notify(); the notify-dispatch Edge Function drains the outbox
-- with retries and exponential backoff. Secrets never touch the database or browser.

create table public.automation_events (
  id text primary key,
  label text not null,
  roles text[] not null,
  trigger_kind text not null check (trigger_kind in ('event','schedule'))
);
alter table public.automation_events enable row level security;
create policy automation_events_read on public.automation_events for select to authenticated using (true);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  event_type text not null, title text not null, body text not null,
  severity text not null check (severity in ('info','warning','critical','success')),
  target_roles text[] not null default '{}', target_user_id uuid, link text, ref_id uuid,
  read_by uuid[] not null default '{}'
);
create index notifications_company_idx on public.notifications (company_id, created_at desc);
create index notifications_ref_idx on public.notifications (company_id, event_type, ref_id, created_at desc);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  user_id uuid not null, event_type text not null references public.automation_events(id),
  in_app boolean not null default true, email boolean not null default false, whatsapp boolean not null default false,
  unique (company_id, user_id, event_type)
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  notification_id uuid references public.notifications(id) on delete set null,
  event_type text not null, channel text not null check (channel in ('whatsapp','email','webhook')),
  recipient text not null, payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','dead','skipped')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(),
  last_error text, provider_message_id text, sent_at timestamptz
);
create index outbox_due_idx on public.notification_outbox (next_attempt_at) where status in ('pending','failed');
create index outbox_company_idx on public.notification_outbox (company_id, created_at desc);

-- Creates an in-app notification and fans out to WhatsApp / email per member preferences.
create or replace function app.notify(
  p_company uuid, p_event text, p_title text, p_body text, p_severity text,
  p_link text default null, p_ref uuid default null, p_target_user uuid default null
) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  v_id uuid;
  v_roles text[];
begin
  select roles into v_roles from automation_events where id = p_event;
  v_roles := coalesce(v_roles, array['company_admin']);
  insert into notifications (company_id, event_type, title, body, severity, target_roles, target_user_id, link, ref_id)
  values (p_company, p_event, p_title, p_body, p_severity, v_roles, p_target_user, p_link, p_ref)
  returning id into v_id;

  insert into notification_outbox (company_id, notification_id, event_type, channel, recipient, payload)
  select p_company, v_id, p_event, ch.channel, ch.recipient,
         jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link, 'severity', p_severity, 'company', (select name from companies where id = p_company))
  from company_members m
  join notification_preferences p on p.company_id = m.company_id and p.user_id = m.user_id and p.event_type = p_event
  cross join lateral (values ('whatsapp', m.phone, p.whatsapp), ('email', m.email, p.email)) as ch(channel, recipient, enabled)
  where m.company_id = p_company and m.active and m.role = any (v_roles) and ch.enabled and ch.recipient is not null
    and (p_target_user is null or m.user_id = p_target_user);

  -- Optional company-level webhook (e.g. an n8n workflow) receives every event.
  if (select settings ->> 'automation_webhook' from companies where id = p_company) = 'true' then
    insert into notification_outbox (company_id, notification_id, event_type, channel, recipient, payload)
    values (p_company, v_id, p_event, 'webhook', 'n8n', jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link, 'severity', p_severity, 'ref_id', p_ref));
  end if;
  return v_id;
end $$;

create or replace function app.recently_notified(p_company uuid, p_event text, p_ref uuid, p_hours int default 24) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from notifications where company_id = p_company and event_type = p_event and ref_id = p_ref and created_at > now() - make_interval(hours => p_hours))
$$;

-- ─── RPCs used by the app ───
-- Lets Edge Functions ask "may the CALLER do X?" without exposing anyone else's permissions.
create or replace function public.my_permission(p_company_id uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.has_perm(p_company_id, p_module, p_action)
$$;

create or replace function public.mark_notifications_read(p_company_id uuid, p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = public, app as $$
declare v_role text := app.member_role(p_company_id);
begin
  if v_role is null then perform app.raise_forbidden('Not a member of this company'); end if;
  update notifications n set read_by = array_append(n.read_by, auth.uid())
  where n.company_id = p_company_id and not (auth.uid() = any (n.read_by))
    and (p_ids is null or n.id = any (p_ids))
    and (n.target_user_id = auth.uid() or (n.target_user_id is null and (v_role = any (n.target_roles) or v_role = 'super_admin')));
end $$;

create or replace function public.set_notification_preference(p_company_id uuid, p_event_type text, p_email boolean, p_whatsapp boolean) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if app.member_role(p_company_id) is null then perform app.raise_forbidden('Not a member of this company'); end if;
  insert into notification_preferences (company_id, user_id, event_type, email, whatsapp, created_by)
  values (p_company_id, auth.uid(), p_event_type, p_email, p_whatsapp, auth.uid())
  on conflict (company_id, user_id, event_type) do update set email = excluded.email, whatsapp = excluded.whatsapp, updated_at = now();
end $$;

create or replace function public.retry_outbox(p_company_id uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_perm(p_company_id, 'settings', 'edit') then perform app.raise_forbidden('Only admins can retry messages'); end if;
  update notification_outbox set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, updated_at = now()
  where id = p_id and company_id = p_company_id and status in ('failed','dead','skipped');
  if not found then perform app.raise_validation('Message not found or not retryable'); end if;
  insert into audit_log (company_id, table_name, record_id, action, actor_id, actor_name, note)
  values (p_company_id, 'notification_outbox', p_id, 'update', auth.uid(), app.actor_name(p_company_id), 'Manual retry');
end $$;

-- Called by the notify-dispatch Edge Function (service role) to claim a batch atomically.
create or replace function public.claim_outbox(p_limit int default 50) returns setof public.notification_outbox
language sql security definer set search_path = public as $$
  update notification_outbox o set status = 'sending', attempts = o.attempts + 1, updated_at = now()
  where o.id in (
    select id from notification_outbox
    where status in ('pending','failed') and next_attempt_at <= now()
    order by next_attempt_at limit p_limit for update skip locked)
  returning o.*
$$;
revoke all on function public.claim_outbox(int) from public, anon, authenticated;

-- Records a delivery result. Backoff: 1, 4, 16, 64 minutes; dead-letter after 5 attempts (src/lib/automation.ts).
create or replace function public.complete_outbox(p_id uuid, p_ok boolean, p_error text default null, p_provider_id text default null) returns void
language sql security definer set search_path = public as $$
  update notification_outbox set
    status = case when p_ok then 'sent' when attempts >= 5 then 'dead' else 'failed' end,
    sent_at = case when p_ok then now() end,
    last_error = case when p_ok then null else left(p_error, 500) end,
    provider_message_id = coalesce(p_provider_id, provider_message_id),
    next_attempt_at = case when p_ok then next_attempt_at else now() + make_interval(mins => (power(4, greatest(attempts - 1, 0)))::int) end,
    updated_at = now()
  where id = p_id
$$;
revoke all on function public.complete_outbox(uuid, boolean, text, text) from public, anon, authenticated;
