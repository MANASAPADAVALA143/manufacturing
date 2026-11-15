-- GNANOVA — Row Level Security. This is the multi-tenant security boundary.
-- Rule of thumb: a row is visible only if its company_id is one of the caller's
-- active memberships AND the caller's role grants the module permission.

create or replace function app.can(p_company uuid, p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_company, p_module, p_action) in (select company_id, module, action from app.my_perms())
$$;

-- Generic policies for tables owned by one module.
create or replace procedure app.apply_module_policies(p_table text, p_module text, p_master boolean default false, p_writable boolean default true)
language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  if p_master then
    execute format('create policy %I on public.%I for select to authenticated using (company_id in (select app.my_company_ids()))', p_table || '_select', p_table);
  else
    execute format('create policy %I on public.%I for select to authenticated using (app.can(company_id, %L, ''view''))', p_table || '_select', p_table, p_module);
  end if;
  if p_writable then
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can(company_id, %L, ''create''))', p_table || '_insert', p_table, p_module);
    execute format('create policy %I on public.%I for update to authenticated using (app.can(company_id, %L, ''edit'')) with check (app.can(company_id, %L, ''edit''))', p_table || '_update', p_table, p_module, p_module);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can(company_id, %L, ''delete''))', p_table || '_delete', p_table, p_module);
  end if;
end $$;

do $$
declare
  masters text[] := array['factories','production_lines','warehouses','bins','shifts','uoms','employees','materials','customers','suppliers','machines','transporters','vehicles','quality_parameters','defect_codes'];
  m record;
begin
  for m in select * from (values
    ('factories','settings'), ('production_lines','settings'), ('warehouses','settings'), ('bins','settings'), ('shifts','settings'),
    ('uoms','settings'), ('employees','settings'), ('approval_rules','settings'),
    ('materials','inventory'), ('stock_movements','inventory'), ('reservations','inventory'), ('stock_audits','inventory'), ('grns','inventory'),
    ('customers','sales'), ('rfqs','sales'), ('quotations','sales'), ('sales_orders','sales'),
    ('suppliers','procurement'), ('purchase_requisitions','procurement'), ('supplier_quotations','procurement'), ('purchase_orders','procurement'),
    ('machines','maintenance'), ('pm_schedules','maintenance'), ('work_orders','maintenance'),
    ('transporters','logistics'), ('vehicles','logistics'), ('shipments','logistics'),
    ('quality_parameters','quality'), ('defect_codes','quality'), ('inspections','quality'), ('ncrs','quality'), ('capas','quality'),
    ('invoices','ap'), ('payments','ap'),
    ('production_orders','production'), ('shift_reports','production'),
    ('report_schedules','reports'), ('report_runs','reports')
  ) as t(tbl, module) loop
    call app.apply_module_policies(m.tbl, m.module, m.tbl = any (masters));
  end loop;
end $$;

-- Payments and stock movements are append-only ledgers: no client update/delete.
drop policy payments_update on public.payments;
drop policy payments_delete on public.payments;
drop policy stock_movements_update on public.stock_movements;
drop policy stock_movements_delete on public.stock_movements;

-- Stock balances: derived from movements by triggers; read-only to clients.
call app.apply_module_policies('stock_balances', 'inventory', false, false);

-- Companies: members can read; settings editors can update.
alter table public.companies enable row level security;
create policy companies_select on public.companies for select to authenticated using (id in (select app.my_company_ids()));
create policy companies_update on public.companies for update to authenticated using (app.can(id, 'settings', 'edit')) with check (app.can(id, 'settings', 'edit'));

-- Members: you can always see your own memberships; settings viewers see the team.
alter table public.company_members enable row level security;
create policy members_select on public.company_members for select to authenticated using (user_id = auth.uid() or app.can(company_id, 'settings', 'view'));
create policy members_insert on public.company_members for insert to authenticated with check (app.can(company_id, 'settings', 'create'));
create policy members_update on public.company_members for update to authenticated using (app.can(company_id, 'settings', 'edit')) with check (app.can(company_id, 'settings', 'edit'));
create policy members_delete on public.company_members for delete to authenticated using (app.can(company_id, 'settings', 'delete'));

-- Audit log: readable by anyone who can view the audited module; written only by triggers.
create or replace function app.module_of(p_table text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select module from entity_rules where table_name = p_table), case p_table when 'notification_outbox' then 'settings' else 'settings' end)
$$;
alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated using (app.can(company_id, app.module_of(table_name), 'view'));

-- Attachments follow the permissions of the record they belong to.
alter table public.attachments enable row level security;
create policy attachments_select on public.attachments for select to authenticated using (app.can(company_id, app.module_of(entity), 'view'));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (app.can(company_id, app.module_of(entity), 'create') or app.can(company_id, app.module_of(entity), 'edit'));
create policy attachments_delete on public.attachments for delete to authenticated using (app.can(company_id, app.module_of(entity), 'delete'));

-- Notifications: only those targeted at the caller (by user or role).
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (
  company_id in (select app.my_company_ids())
  and (target_user_id = auth.uid() or (target_user_id is null and (app.member_role(company_id) = any (target_roles) or app.member_role(company_id) = 'super_admin'))));

alter table public.notification_preferences enable row level security;
create policy prefs_select on public.notification_preferences for select to authenticated using (user_id = auth.uid() and company_id in (select app.my_company_ids()));

alter table public.notification_outbox enable row level security;
create policy outbox_select on public.notification_outbox for select to authenticated using (app.can(company_id, 'settings', 'view'));

-- Grants (Supabase grants these by default; explicit for self-hosted / tests).
grant usage on schema public, app to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema app to authenticated, service_role;
revoke insert, update, delete on public.stock_balances, public.audit_log, public.notifications, public.notification_outbox,
  public.role_permissions, public.entity_rules, public.status_transitions, public.document_sequences, public.automation_events from authenticated;
grant execute on function public.claim_outbox(int), public.complete_outbox(uuid, boolean, text, text), public.run_scheduled_jobs_all(), public.weekly_report_all() to service_role;
revoke all on all tables in schema public from anon;
