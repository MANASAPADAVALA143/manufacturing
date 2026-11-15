-- GNANOVA Manufacturing OS — foundation: tenancy, RBAC helpers, generic triggers.
-- Every tenant table carries company_id; Row Level Security (see *_rls.sql) is the
-- security boundary. Frontend filtering is never relied on.

-- gen_random_uuid() is built into Postgres 13+; no extension needed.
create schema if not exists app;

-- ─── Tenancy ───
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) >= 3),
  slug text not null unique,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  address text,
  brand_color text not null default '#1E40AF' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url text check (logo_url is null or logo_url like 'https://%'),
  currency text not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  is_demo boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name text not null,
  role text not null check (role in ('super_admin','company_admin','ceo','plant_manager','production_manager','purchase_manager','finance_manager','store_keeper','production_supervisor','maintenance_technician','quality_inspector','warehouse_operator')),
  phone text check (phone is null or phone ~ '^\+[0-9]{10,15}$'),
  factory_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  unique (company_id, email),
  unique (company_id, id)
);
create index company_members_user_idx on public.company_members (user_id, company_id) where active;

-- Permission matrix. company_id null = platform default; a company row overrides it.
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  role text not null,
  module text not null,
  actions text[] not null,
  unique nulls not distinct (company_id, role, module)
);

-- Per-table write rules, generated from src/lib/data/entities.ts (see *_config.sql).
create table public.entity_rules (
  table_name text primary key,
  module text not null,
  number_prefix text,
  initial_status text,
  has_transitions boolean not null default false,
  editable_in text[],
  deletable_in text[],
  immutable boolean not null default false,
  amount_col text,
  protected_cols text[] not null default '{}'
);

create table public.status_transitions (
  table_name text not null references public.entity_rules(table_name) on delete cascade,
  from_status text not null,
  to_status text not null,
  action text not null check (action in ('edit','approve')),
  require_comment boolean not null default false,
  primary key (table_name, from_status, to_status)
);

create table public.document_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  prefix text not null,
  year int not null,
  last_value int not null default 0,
  primary key (company_id, prefix, year)
);

alter table public.role_permissions enable row level security;
alter table public.entity_rules enable row level security;
alter table public.status_transitions enable row level security;
alter table public.document_sequences enable row level security;
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);
create policy entity_rules_read on public.entity_rules for select to authenticated using (true);
create policy status_transitions_read on public.status_transitions for select to authenticated using (true);

-- ─── Helpers (SECURITY DEFINER so they can read membership without recursive RLS) ───
create or replace function app.my_company_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select company_id from company_members where user_id = auth.uid() and active
$$;

create or replace function app.member_role(p_company uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from company_members where company_id = p_company and user_id = auth.uid() and active limit 1
$$;

create or replace function app.my_perms() returns table (company_id uuid, module text, action text)
language sql stable security definer set search_path = public as $$
  select m.company_id, rp.module, unnest(rp.actions)
  from company_members m
  join role_permissions rp on rp.role = m.role
   and (rp.company_id = m.company_id
        or (rp.company_id is null and not exists (
              select 1 from role_permissions o where o.company_id = m.company_id and o.role = m.role and o.module = rp.module)))
  where m.user_id = auth.uid() and m.active
$$;

create or replace function app.has_perm(p_company uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app.my_perms() p where p.company_id = p_company and p.module = p_module and p.action = p_action)
$$;

create or replace function app.actor_name(p_company uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select full_name from company_members where company_id = p_company and user_id = auth.uid() limit 1), 'System')
$$;

create or replace function app.setting(p_company uuid, p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select (settings ->> p_key)::numeric from companies where id = p_company), p_default)
$$;

create or replace function app.setting_bool(p_company uuid, p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (settings ->> p_key)::boolean from companies where id = p_company), p_default)
$$;

create or replace function app.next_number(p_company uuid, p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare v int; y int := extract(year from now())::int;
begin
  insert into document_sequences (company_id, prefix, year, last_value) values (p_company, p_prefix, y, 1)
  on conflict (company_id, prefix, year) do update set last_value = document_sequences.last_value + 1
  returning last_value into v;
  return format('%s-%s-%s', p_prefix, y, lpad(v::text, 4, '0'));
end $$;

-- "System" context = statement executed inside a SECURITY DEFINER business function
-- (runs as the function owner) or by the service role (Edge Functions). Client
-- statements via PostgREST run as `authenticated`/`anon` and can never be system.
-- Must be evaluated in a SECURITY INVOKER context to see the executing role.
create or replace function app.is_system() returns boolean language sql stable as $$
  select current_user not in ('authenticated', 'anon')
$$;

create or replace function app.raise_validation(msg text) returns void language plpgsql as $$
begin raise exception using errcode = 'P0001', message = msg; end $$;

create or replace function app.raise_forbidden(msg text) returns void language plpgsql as $$
begin raise exception using errcode = 'P0003', message = msg; end $$;

-- ─── Generic BEFORE trigger: identity, server-managed fields, status & edit rules, numbering ───
-- SECURITY INVOKER on purpose: app.is_system() must see who executed the statement.
create or replace function app.tg_before_write() returns trigger
language plpgsql set search_path = public, app as $$
declare
  r entity_rules;
  sys boolean := app.is_system();
  oldj jsonb;
  patch jsonb := '{}'::jsonb;
  c text;
  has_rule boolean;
begin
  select * into r from entity_rules where table_name = tg_table_name;
  has_rule := found;

  if tg_op = 'DELETE' then
    if has_rule and not sys then
      if r.immutable then perform app.raise_forbidden(format('%s cannot be deleted', tg_table_name)); end if;
      if r.deletable_in is not null and not ((to_jsonb(old) ->> 'status') = any (r.deletable_in)) then
        perform app.raise_validation(format('Only records in status %s can be deleted', array_to_string(r.deletable_in, ', ')));
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not sys then
      new.created_by := auth.uid();
      if has_rule then
        -- Server-managed fields cannot be supplied by clients.
        foreach c in array r.protected_cols loop patch := patch || jsonb_build_object(c, null); end loop;
        if r.has_transitions and r.initial_status is not null then patch := patch || jsonb_build_object('status', r.initial_status); end if;
        if patch <> '{}'::jsonb then new := jsonb_populate_record(new, patch); end if;
      end if;
    end if;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    if has_rule and r.number_prefix is not null and (to_jsonb(new) ->> 'number') is null then
      new := jsonb_populate_record(new, jsonb_build_object('number', app.next_number(new.company_id, r.number_prefix)));
    end if;
    if has_rule and r.initial_status is not null and (to_jsonb(new) ->> 'status') is null then
      new := jsonb_populate_record(new, jsonb_build_object('status', r.initial_status));
    end if;
    return new;
  end if;

  -- UPDATE
  new.id := old.id;
  new.company_id := old.company_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  if has_rule and not sys then
    if r.immutable then perform app.raise_forbidden(format('%s cannot be edited — post a reversing entry instead', tg_table_name)); end if;
    oldj := to_jsonb(old);
    if r.editable_in is not null and not ((oldj ->> 'status') = any (r.editable_in)) then
      perform app.raise_validation(format('A record in status "%s" can no longer be edited', oldj ->> 'status'));
    end if;
    if r.has_transitions and (to_jsonb(new) ->> 'status') is distinct from (oldj ->> 'status')
       and coalesce(current_setting('app.in_transition', true), '') <> old.id::text then
      perform app.raise_validation('Status changes must use transition_status()');
    end if;
    foreach c in array r.protected_cols loop patch := patch || jsonb_build_object(c, oldj -> c); end loop;
    if patch <> '{}'::jsonb then new := jsonb_populate_record(new, patch); end if;
  end if;
  return new;
end $$;

-- ─── Generic AFTER trigger: audit trail ───
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete','transition')),
  actor_id uuid,
  actor_name text,
  changes jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);
create index audit_log_record_idx on public.audit_log (company_id, table_name, record_id, created_at desc);
create index audit_log_company_idx on public.audit_log (company_id, created_at desc);

create or replace function app.tg_audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare diff jsonb; rec record;
begin
  if tg_op = 'DELETE' then rec := old; else rec := new; end if;
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('app.in_transition', true), '') = new.id::text then return new; end if;
    select jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)) into diff
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value and n.key <> 'updated_at';
    if diff is null then return new; end if;
  end if;
  insert into audit_log (company_id, table_name, record_id, action, actor_id, actor_name, changes, note)
  values (rec.company_id, tg_table_name, rec.id, lower(tg_op), auth.uid(), app.actor_name(rec.company_id), diff,
          case when tg_op = 'DELETE' then 'Deleted ' || coalesce(to_jsonb(old) ->> 'number', to_jsonb(old) ->> 'name', to_jsonb(old) ->> 'code', old.id::text) end);
  return rec;
end $$;

-- Attaches the standard triggers to a tenant table.
create or replace procedure app.attach_standard_triggers(p_table text, p_audit boolean default true)
language plpgsql as $$
begin
  execute format('create trigger a_before_write before insert or update or delete on public.%I for each row execute function app.tg_before_write()', p_table);
  if p_audit then
    execute format('create trigger z_audit after insert or update or delete on public.%I for each row execute function app.tg_audit()', p_table);
  end if;
end $$;

call app.attach_standard_triggers('company_members');

create or replace function app.tg_touch_company() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.id := old.id; new.is_demo := old.is_demo; new.created_at := old.created_at; return new; end $$;
create trigger touch before update on public.companies for each row execute function app.tg_touch_company();
