-- GNANOVA — business rules. Mirrors src/lib/data/demoEngine.ts so demo and live behave the same.
-- AFTER triggers and RPCs are SECURITY DEFINER (they write tables clients cannot), and
-- each RPC re-checks permissions with app.has_perm().

-- ─── Helpers ───
create or replace function app.num(j jsonb, k text) returns numeric language sql immutable as $$
  select coalesce(nullif(j ->> k, '')::numeric, 0)
$$;

create or replace function app.lines_subtotal(p_lines jsonb) returns numeric language sql immutable as $$
  select coalesce(round(sum(app.num(l, 'qty') * app.num(l, 'rate')), 2), 0) from jsonb_array_elements(coalesce(p_lines, '[]')) l
$$;

-- Line items must reference materials of the same company (jsonb cannot carry a FK).
create or replace function app.check_lines(p_company uuid, p_lines jsonb, p_label text) returns void
language plpgsql security definer set search_path = public, app as $$
declare l jsonb; i int := 0;
begin
  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]')) loop
    i := i + 1;
    if not exists (select 1 from materials where company_id = p_company and id = nullif(l ->> 'material_id', '')::uuid) then
      perform app.raise_validation(format('%s line %s: material does not exist in this company', p_label, i));
    end if;
    if app.num(l, 'qty') <= 0 then perform app.raise_validation(format('%s line %s: quantity must be greater than 0', p_label, i)); end if;
    if app.num(l, 'rate') < 0 then perform app.raise_validation(format('%s line %s: rate cannot be negative', p_label, i)); end if;
  end loop;
end $$;

create or replace function app.name_of(p_table text, p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if p_id is null then return '—'; end if;
  execute format('select coalesce(to_jsonb(t) ->> ''name'', to_jsonb(t) ->> ''number'', to_jsonb(t) ->> ''code'') from %I t where id = $1', p_table) into v using p_id;
  return coalesce(v, '—');
end $$;

-- ─── Totals (quotations, sales orders, purchase orders, invoices) & PR value ───
create or replace function app.tg_compute_totals() returns trigger language plpgsql set search_path = public, app as $$
begin
  perform app.check_lines(new.company_id, new.lines, initcap(replace(tg_table_name, '_', ' ')));
  new.subtotal := app.lines_subtotal(new.lines);
  new.tax_amount := round(new.subtotal * coalesce(new.tax_pct, 0) / 100, 2);
  new.total := new.subtotal + new.tax_amount;
  return new;
end $$;

create or replace function app.tg_quotation_margin() returns trigger language plpgsql as $$
declare cost numeric := coalesce(new.material_cost, 0) + coalesce(new.conversion_cost, 0);
begin
  new.margin_pct := case when new.subtotal > 0 and cost > 0 then round((new.subtotal - cost) / new.subtotal * 100, 2) end;
  return new;
end $$;

create or replace function app.tg_pr_value() returns trigger language plpgsql as $$
begin new.estimated_value := round(coalesce(new.qty, 0) * coalesce(new.estimated_rate, 0), 2); return new; end $$;

create trigger b_totals before insert or update on public.quotations for each row execute function app.tg_compute_totals();
create trigger c_margin before insert or update on public.quotations for each row execute function app.tg_quotation_margin();
create trigger b_totals before insert or update on public.sales_orders for each row execute function app.tg_compute_totals();
create trigger b_totals before insert or update on public.purchase_orders for each row execute function app.tg_compute_totals();
create trigger b_totals before insert or update on public.invoices for each row execute function app.tg_compute_totals();
create trigger b_value before insert or update on public.purchase_requisitions for each row execute function app.tg_pr_value();

create or replace function app.tg_check_lines_only() returns trigger language plpgsql as $$
declare col jsonb := to_jsonb(new) -> tg_argv[0];
begin perform app.check_lines(new.company_id, col, tg_argv[1]); return new; end $$;
create trigger b_lines before insert or update on public.grns for each row execute function app.tg_check_lines_only('lines', 'GRN');
create trigger b_lines before insert or update on public.shipments for each row execute function app.tg_check_lines_only('lines', 'Shipment');

-- ─── Stock ───
create or replace function app.stock_add(p_company uuid, p_material uuid, p_wh uuid, p_bin uuid, p_batch text, p_qty numeric) returns void
language sql security definer set search_path = public as $$
  insert into stock_balances (company_id, material_id, warehouse_id, bin_id, batch_no, qty)
  values (p_company, p_material, p_wh, p_bin, coalesce(p_batch, ''), round(p_qty, 3))
  on conflict (company_id, material_id, warehouse_id, coalesce(bin_id, '00000000-0000-0000-0000-000000000000'::uuid), batch_no)
  do update set qty = round(stock_balances.qty + excluded.qty, 3), updated_at = now()
$$;

-- FIFO consumption across batches. Raises if stock is insufficient (the whole statement rolls back).
create or replace function app.stock_take(p_company uuid, p_material uuid, p_wh uuid, p_bin uuid, p_batch text, p_qty numeric)
returns table (batch_no text, taken numeric)
language plpgsql security definer set search_path = public, app as $$
declare s record; left_qty numeric := p_qty; avail numeric;
begin
  select coalesce(sum(b.qty), 0) into avail from stock_balances b
  where b.company_id = p_company and b.material_id = p_material and b.warehouse_id = p_wh
    and (p_bin is null or b.bin_id = p_bin) and (coalesce(p_batch, '') = '' or b.batch_no = p_batch);
  if avail + 1e-9 < p_qty then
    perform app.raise_validation(format('Insufficient stock: requested %s, available %s%s', round(p_qty, 3), round(avail, 3),
      case when coalesce(p_batch, '') <> '' then ' in batch ' || p_batch else '' end));
  end if;
  for s in select b.id, b.batch_no, b.qty from stock_balances b
           where b.company_id = p_company and b.material_id = p_material and b.warehouse_id = p_wh and b.qty > 0
             and (p_bin is null or b.bin_id = p_bin) and (coalesce(p_batch, '') = '' or b.batch_no = p_batch)
           order by b.created_at, b.id for update loop
    exit when left_qty <= 1e-9;
    taken := least(s.qty, left_qty);
    batch_no := s.batch_no;
    update stock_balances set qty = round(qty - taken, 3), updated_at = now() where id = s.id;
    left_qty := left_qty - taken;
    return next;
  end loop;
  delete from stock_balances b where b.company_id = p_company and b.material_id = p_material and b.qty <= 1e-9;
end $$;

create or replace function app.check_low_stock(p_company uuid, p_material uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare m materials; on_hand numeric;
begin
  if not app.setting_bool(p_company, 'low_stock_alerts', true) then return; end if;
  select * into m from materials where id = p_material and company_id = p_company;
  if not found or m.reorder_level <= 0 then return; end if;
  select coalesce(sum(qty), 0) into on_hand from stock_balances where company_id = p_company and material_id = p_material;
  if on_hand >= m.reorder_level or app.recently_notified(p_company, 'low_stock', p_material) then return; end if;
  perform app.notify(p_company, 'low_stock', 'Low stock: ' || m.name,
    format('On hand %s %s is below reorder level %s %s. Suggested reorder %s %s.', round(on_hand, 2), m.uom, m.reorder_level, m.uom, m.reorder_qty, m.uom),
    case when on_hand < m.min_stock then 'critical' else 'warning' end, '/inventory/reorder', p_material);
end $$;

create or replace function app.tg_stock_movement() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare t record;
begin
  case new.movement_type
    when 'in' then perform app.stock_add(new.company_id, new.material_id, new.warehouse_id, new.bin_id, new.batch_no, new.qty);
    when 'out' then perform app.stock_take(new.company_id, new.material_id, new.warehouse_id, new.bin_id, new.batch_no, new.qty);
    when 'transfer' then
      for t in select * from app.stock_take(new.company_id, new.material_id, new.warehouse_id, new.bin_id, new.batch_no, new.qty) loop
        perform app.stock_add(new.company_id, new.material_id, new.to_warehouse_id, null, t.batch_no, t.taken);
      end loop;
    when 'adjust' then
      if new.qty >= 0 then perform app.stock_add(new.company_id, new.material_id, new.warehouse_id, new.bin_id, new.batch_no, new.qty);
      else perform app.stock_take(new.company_id, new.material_id, new.warehouse_id, new.bin_id, new.batch_no, -new.qty); end if;
  end case;
  if new.movement_type in ('out', 'transfer', 'adjust') then perform app.check_low_stock(new.company_id, new.material_id); end if;
  return null;
end $$;
create trigger c_apply after insert on public.stock_movements for each row execute function app.tg_stock_movement();

create or replace function app.tg_stock_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(sum(qty), 0) into new.system_qty from stock_balances
    where company_id = new.company_id and material_id = new.material_id and warehouse_id = new.warehouse_id
      and (coalesce(new.batch_no, '') = '' or batch_no = new.batch_no);
  end if;
  new.variance_qty := round(new.counted_qty - coalesce(new.system_qty, 0), 3);
  if tg_op = 'UPDATE' and new.status = 'rejected' and old.status = 'rejected' then new.status := 'counted'; end if;
  return new;
end $$;
create trigger b_compute before insert or update on public.stock_audits for each row execute function app.tg_stock_audit();

-- ─── AP: 3-way match (mirrors matchInvoice in src/lib/domain.ts) ───
create or replace function app.match_invoice(p_inv public.invoices) returns jsonb
language plpgsql stable security definer set search_path = public, app as $$
declare
  exc text[] := '{}';
  dup uuid;
  hard boolean := false;
  po purchase_orders;
  other record;
  l jsonb; pl jsonb;
  price_tol numeric := app.setting(p_inv.company_id, 'ap_price_tolerance_pct', 2);
  qty_tol numeric := 1 + app.setting(p_inv.company_id, 'ap_qty_tolerance_pct', 0) / 100;
  win int := app.setting(p_inv.company_id, 'duplicate_window_days', 90)::int;
  grn_count int; recv numeric; billed numeric; variance numeric;
  norm text := upper(regexp_replace(p_inv.invoice_no, '[\s/\\-]', '', 'g'));
begin
  select id, number into other from invoices
  where company_id = p_inv.company_id and supplier_id = p_inv.supplier_id and id <> p_inv.id and status <> 'rejected'
    and upper(regexp_replace(invoice_no, '[\s/\\-]', '', 'g')) = norm limit 1;
  if found then
    hard := true; dup := other.id;
    exc := exc || format('Duplicate: invoice no. %s already recorded as %s', p_inv.invoice_no, other.number);
  else
    select id, number, invoice_no into other from invoices
    where company_id = p_inv.company_id and supplier_id = p_inv.supplier_id and id <> p_inv.id and status <> 'rejected'
      and abs(total - p_inv.total) < 1 and abs(invoice_date - p_inv.invoice_date) <= win limit 1;
    if found then
      dup := other.id;
      exc := exc || format('Possible duplicate: same amount as %s (%s) within %s days', other.number, other.invoice_no, win);
    end if;
  end if;

  if p_inv.po_id is null then
    exc := exc || 'No purchase order reference'::text;
  else
    select * into po from purchase_orders where id = p_inv.po_id and company_id = p_inv.company_id;
    if po.supplier_id <> p_inv.supplier_id then exc := exc || 'Supplier on invoice differs from PO supplier'::text; end if;
    if po.status in ('draft', 'pending_approval', 'cancelled') then exc := exc || format('PO is %s', replace(po.status, '_', ' ')); end if;
    select count(*) into grn_count from grns where po_id = po.id and company_id = po.company_id and status = 'posted';
    if grn_count = 0 then exc := exc || 'GRN not received yet'::text; end if;
    for l in select * from jsonb_array_elements(p_inv.lines) loop
      select x into pl from jsonb_array_elements(po.lines) x where x ->> 'material_id' = l ->> 'material_id' limit 1;
      if pl is null then exc := exc || 'Invoice contains an item that is not on the PO'::text; continue; end if;
      if app.num(pl, 'rate') > 0 then
        variance := (app.num(l, 'rate') - app.num(pl, 'rate')) / app.num(pl, 'rate') * 100;
        if abs(variance) > price_tol then
          exc := exc || format('Price variance %s%s%% vs PO rate %s', case when variance > 0 then '+' else '' end, to_char(round(variance, 1), 'FM999990.0'), app.num(pl, 'rate'));
        end if;
      end if;
      if app.num(l, 'qty') > app.num(pl, 'qty') * qty_tol then exc := exc || format('Billed qty %s exceeds PO qty %s', app.num(l, 'qty'), app.num(pl, 'qty')); end if;
      if grn_count > 0 then
        select coalesce(sum(app.num(g, 'qty') - app.num(g, 'rejected_qty')), 0) into recv
        from grns gr, jsonb_array_elements(gr.lines) g
        where gr.po_id = po.id and gr.company_id = po.company_id and gr.status = 'posted' and g ->> 'material_id' = l ->> 'material_id';
        select coalesce(sum(app.num(b, 'qty')), 0) into billed
        from invoices i, jsonb_array_elements(i.lines) b
        where i.company_id = p_inv.company_id and i.po_id = po.id and i.id <> p_inv.id and i.status <> 'rejected' and b ->> 'material_id' = l ->> 'material_id';
        if app.num(l, 'qty') > (recv - billed) * qty_tol + 1e-9 then
          exc := exc || format('Billed qty %s exceeds accepted GRN qty %s', app.num(l, 'qty'), greatest(0, recv - billed));
        end if;
      end if;
    end loop;
  end if;
  return jsonb_build_object('match_status', case when cardinality(exc) > 0 then 'exception' else 'matched' end,
                            'exceptions', to_jsonb(exc), 'duplicate_of', dup, 'hard', hard);
end $$;

create or replace function app.tg_invoice_match() returns trigger language plpgsql security definer set search_path = public, app as $$
declare m jsonb;
begin
  if tg_op = 'INSERT' then new.paid_amount := coalesce(new.paid_amount, 0); end if;
  if tg_op = 'UPDATE' and new.status not in ('received', 'matched', 'exception') then return new; end if;
  m := app.match_invoice(new);
  if (m ->> 'hard')::boolean then perform app.raise_validation((m -> 'exceptions') ->> 0); end if;
  new.match_status := m ->> 'match_status';
  new.exceptions := m -> 'exceptions';
  new.duplicate_of := nullif(m ->> 'duplicate_of', '')::uuid;
  new.status := m ->> 'match_status';
  return new;
end $$;
create trigger c_match before insert or update of lines, po_id, grn_id, supplier_id, invoice_no, invoice_date, tax_pct on public.invoices
  for each row execute function app.tg_invoice_match();

create or replace function app.tg_payment_before() returns trigger language plpgsql security definer set search_path = public, app as $$
declare inv invoices;
begin
  select * into inv from invoices where id = new.invoice_id and company_id = new.company_id for update;
  if inv.status not in ('approved', 'partially_paid') then perform app.raise_validation('Only approved invoices can be paid'); end if;
  if new.amount > inv.total - inv.paid_amount + 0.005 then
    perform app.raise_validation(format('Amount exceeds outstanding balance of %s', round(inv.total - inv.paid_amount, 2)));
  end if;
  return new;
end $$;
create trigger b_check before insert on public.payments for each row execute function app.tg_payment_before();

create or replace function app.tg_payment_after() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  update invoices set paid_amount = round(paid_amount + new.amount, 2),
    status = case when paid_amount + new.amount + 0.005 >= total then 'paid' else 'partially_paid' end
  where id = new.invoice_id and company_id = new.company_id;
  return null;
end $$;
create trigger c_apply after insert on public.payments for each row execute function app.tg_payment_after();

-- ─── Production ───
create or replace function app.tg_production_order_init() returns trigger language plpgsql as $$
begin new.produced_qty := 0; new.rejected_qty := 0; return new; end $$;
create trigger b_init before insert on public.production_orders for each row execute function app.tg_production_order_init();

create or replace function app.tg_shift_report() returns trigger language plpgsql security definer set search_path = public, app as $$
declare
  po production_orders;
  good numeric := new.actual_qty - new.rejected_qty;
  mc machines;
  pct_target numeric;
  rej_pct numeric;
  avail numeric; perf numeric; qual numeric;
  shift_name text := app.name_of('shifts', new.shift_id);
  link text := '/production/shift_reports?id=' || new.id;
begin
  select * into po from production_orders where id = new.production_order_id and company_id = new.company_id for update;
  if found then
    update production_orders set produced_qty = round(produced_qty + good, 3), rejected_qty = round(rejected_qty + new.rejected_qty, 3),
      status = case when status = 'released' then 'in_progress' else status end
    where id = po.id;
    if po.output_warehouse_id is not null and good > 0 then
      insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, batch_no, reason, reference, movement_date, created_by)
      values (new.company_id, 'in', po.product_id, good, po.output_warehouse_id, po.number, 'production_output', new.number, new.report_date, new.created_by);
    end if;
    if new.product_id is null then update shift_reports set product_id = po.product_id where id = new.id; end if;
  end if;

  select * into mc from machines where id = new.machine_id;
  pct_target := case when new.target_qty > 0 then new.actual_qty / new.target_qty * 100 else 100 end;
  rej_pct := case when new.actual_qty > 0 then new.rejected_qty / new.actual_qty * 100 else 0 end;
  avail := (new.planned_minutes - new.downtime_minutes)::numeric / new.planned_minutes;
  perf := case when new.planned_minutes > new.downtime_minutes then least(1, new.actual_qty * mc.ideal_cycle_time_sec / 60 / (new.planned_minutes - new.downtime_minutes)) else 0 end;
  qual := case when new.actual_qty > 0 then good / new.actual_qty else 0 end;

  perform app.notify(new.company_id, 'shift_update', format('%s report · %s', shift_name, mc.name),
    format('Output %s/%s (%s%%), rejected %s, downtime %s min, OEE %s%%. By %s.', new.actual_qty, new.target_qty, round(pct_target), new.rejected_qty,
           new.downtime_minutes, round(avail * perf * qual * 100, 1), app.actor_name(new.company_id)), 'info', link, new.id);
  if pct_target < app.setting(new.company_id, 'below_target_alert_pct', 90) then
    perform app.notify(new.company_id, 'below_target', format('Below target: %s (%s)', mc.name, shift_name),
      format('%s of %s (%s%%). Downtime %s min — %s.', new.actual_qty, new.target_qty, round(pct_target), new.downtime_minutes, replace(coalesce(new.downtime_reason, 'n/a'), '_', ' ')),
      'warning', link, new.id);
  end if;
  if rej_pct > app.setting(new.company_id, 'rejection_alert_pct', 3) then
    perform app.notify(new.company_id, 'high_rejection', format('High rejection: %s %s%%', mc.name, round(rej_pct, 1)),
      format('%s of %s rejected in %s.', new.rejected_qty, new.actual_qty, shift_name), 'critical', link, new.id);
  end if;
  return null;
end $$;
create trigger c_effects after insert on public.shift_reports for each row execute function app.tg_shift_report();

-- ─── Maintenance ───
create or replace function app.tg_work_order_insert() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.wo_type = 'breakdown' then
    update machines set status = 'breakdown' where id = new.machine_id and company_id = new.company_id;
    perform app.notify(new.company_id, 'machine_breakdown', 'Breakdown: ' || app.name_of('machines', new.machine_id),
      format('%s raised by %s: %s', new.number, app.actor_name(new.company_id), new.description), 'critical', '/maintenance/work_orders?id=' || new.id, new.id);
  end if;
  return null;
end $$;
create trigger c_effects after insert on public.work_orders for each row execute function app.tg_work_order_insert();

-- ─── Team membership rules ───
create or replace function app.user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1
$$;

-- SECURITY INVOKER so app.is_system() can tell client edits from system edits (e.g. linking on sign-up).
create or replace function app.tg_member_rules() returns trigger language plpgsql set search_path = public, app as $$
declare actor_role text; sys boolean := app.is_system();
begin
  actor_role := app.member_role(coalesce(new.company_id, old.company_id));
  if tg_op in ('INSERT', 'UPDATE') then
    new.email := lower(trim(new.email));
    if not sys and new.role = 'super_admin' and coalesce(actor_role, '') <> 'super_admin'
       and (tg_op = 'INSERT' or old.role <> 'super_admin') then
      perform app.raise_forbidden('Only platform admins can grant Super Admin');
    end if;
  end if;
  if tg_op = 'INSERT' then
    if new.user_id is null then new.user_id := app.user_id_by_email(new.email); end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and not sys then
    new.email := old.email; new.user_id := old.user_id;
    if old.user_id = auth.uid() and new.role <> old.role then perform app.raise_forbidden('You cannot change your own role'); end if;
  end if;
  if old.role = 'company_admin' and (tg_op = 'DELETE' or new.role <> 'company_admin' or not new.active) then
    if tg_op = 'DELETE' and old.user_id = auth.uid() then perform app.raise_forbidden('You cannot remove yourself'); end if;
    if not exists (select 1 from company_members where company_id = old.company_id and role = 'company_admin' and active and id <> old.id) then
      perform app.raise_validation('A company must keep at least one active Company Admin');
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger b_rules before insert or update or delete on public.company_members for each row execute function app.tg_member_rules();

-- Links pending memberships when an invited email signs up.
create or replace function app.tg_link_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update company_members set user_id = new.id where user_id is null and lower(email) = lower(new.email);
  return new;
end $$;
create trigger gnanova_link_memberships after insert on auth.users for each row execute function app.tg_link_new_user();

-- ─── Status transitions ───
create or replace function app.before_transition(p_company uuid, p_table text, r jsonb, p_to text) returns void
language plpgsql security definer set search_path = public, app as $$
declare l jsonb;
begin
  if p_table = 'work_orders' and p_to = 'completed' then
    if jsonb_array_length(r -> 'parts_used') > 0 and nullif(r ->> 'parts_warehouse_id', '') is null then
      perform app.raise_validation('Select the warehouse spare parts were issued from');
    end if;
    for l in select * from jsonb_array_elements(r -> 'parts_used') loop
      insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, reason, reference, unit_cost, movement_date, created_by)
      values (p_company, 'out', (l ->> 'material_id')::uuid, app.num(l, 'qty'), (r ->> 'parts_warehouse_id')::uuid, 'maintenance_issue', r ->> 'number', nullif(app.num(l, 'rate'), 0), current_date, auth.uid());
    end loop;
  elsif p_table = 'shipments' and p_to = 'dispatched' then
    if jsonb_array_length(r -> 'lines') > 0 and nullif(r ->> 'from_warehouse_id', '') is null then
      perform app.raise_validation('Select the warehouse goods are dispatched from');
    end if;
    for l in select * from jsonb_array_elements(r -> 'lines') loop
      insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, reason, reference, movement_date, created_by)
      values (p_company, 'out', (l ->> 'material_id')::uuid, app.num(l, 'qty'), (r ->> 'from_warehouse_id')::uuid, 'sales_dispatch', r ->> 'number', current_date, auth.uid());
    end loop;
  elsif p_table = 'stock_audits' and p_to = 'approved' and app.num(r, 'variance_qty') <> 0 then
    insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, batch_no, reason, reference, movement_date, created_by)
    values (p_company, 'adjust', (r ->> 'material_id')::uuid, app.num(r, 'variance_qty'), (r ->> 'warehouse_id')::uuid, nullif(r ->> 'batch_no', ''), 'stock_audit', r ->> 'number', current_date, auth.uid());
  end if;
end $$;

create or replace function app.post_grn(p_company uuid, p_grn uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare g grns; po purchase_orders; l jsonb; pl jsonb; accepted numeric; new_lines jsonb; all_in boolean;
begin
  select * into g from grns where id = p_grn and company_id = p_company;
  select * into po from purchase_orders where id = g.po_id and company_id = p_company for update;
  if po.status not in ('approved', 'sent', 'partially_received') then
    perform app.raise_validation(format('PO %s is %s; goods cannot be received against it', po.number, po.status));
  end if;
  new_lines := po.lines;
  for l in select * from jsonb_array_elements(g.lines) loop
    if app.num(l, 'rejected_qty') > app.num(l, 'qty') then perform app.raise_validation('Rejected quantity cannot exceed received quantity'); end if;
    select x into pl from jsonb_array_elements(po.lines) x where x ->> 'material_id' = l ->> 'material_id' limit 1;
    if pl is null then perform app.raise_validation(format('%s is not on %s', app.name_of('materials', (l ->> 'material_id')::uuid), po.number)); end if;
    accepted := app.num(l, 'qty') - app.num(l, 'rejected_qty');
    if accepted > 0 then
      insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, batch_no, reason, reference, unit_cost, movement_date, created_by)
      values (p_company, 'in', (l ->> 'material_id')::uuid, accepted, g.warehouse_id, coalesce(nullif(l ->> 'batch_no', ''), g.number), 'purchase_receipt', g.number,
              coalesce(nullif(app.num(l, 'rate'), 0), app.num(pl, 'rate')), g.received_date, auth.uid());
    end if;
    select jsonb_agg(case when x ->> 'material_id' = l ->> 'material_id'
                          then x || jsonb_build_object('received_qty', round(app.num(x, 'received_qty') + accepted, 3)) else x end)
    into new_lines from jsonb_array_elements(new_lines) x;
    insert into inspections (company_id, stage, inspection_date, material_id, supplier_id, grn_id, batch_no, lot_qty, accepted_qty, rejected_qty, findings, created_by)
    values (p_company, 'incoming', g.received_date, (l ->> 'material_id')::uuid, g.supplier_id, g.id, coalesce(nullif(l ->> 'batch_no', ''), g.number),
            app.num(l, 'qty'), 0, app.num(l, 'rejected_qty'),
            case when app.num(l, 'rejected_qty') > 0 then app.num(l, 'rejected_qty') || ' rejected at receipt' end, auth.uid());
  end loop;
  select bool_and(app.num(x, 'received_qty') + 1e-9 >= app.num(x, 'qty')) into all_in from jsonb_array_elements(new_lines) x;
  perform set_config('app.in_transition', '', true);
  update purchase_orders set lines = new_lines, status = case when all_in then 'received' else 'partially_received' end where id = po.id;
  -- Re-match invoices that were waiting for this GRN.
  update invoices set grn_id = coalesce(grn_id, g.id) where company_id = p_company and po_id = po.id and status in ('received', 'matched', 'exception');
end $$;

create or replace function app.after_transition(p_company uuid, p_table text, p_id uuid, p_from text, p_to text) returns void
language plpgsql security definer set search_path = public, app as $$
declare r jsonb; v_link text := format('/%s?id=%s', p_table, p_id); so_id uuid; total_ships int; done_ships int; moving int;
begin
  execute format('select to_jsonb(t) from %I t where id = $1', p_table) into r using p_id;
  case p_table || ':' || p_to
    when 'grns:posted' then perform app.post_grn(p_company, p_id);
    when 'purchase_requisitions:submitted' then
      perform app.notify(p_company, 'purchase_requisition', format('Requisition %s submitted', r ->> 'number'),
        format('%s × %s by %s', app.name_of('materials', (r ->> 'material_id')::uuid), r ->> 'qty', app.actor_name(p_company)),
        case when r ->> 'priority' = 'urgent' then 'warning' else 'info' end, '/procurement' || v_link, p_id);
    when 'purchase_orders:pending_approval' then
      perform app.notify(p_company, 'purchase_approval', format('PO %s awaiting approval', r ->> 'number'),
        format('%s · ₹%s', app.name_of('suppliers', (r ->> 'supplier_id')::uuid), to_char(app.num(r, 'total'), 'FM99,99,99,99,990')), 'warning', '/procurement' || v_link, p_id);
    when 'purchase_orders:approved' then
      perform app.notify(p_company, 'purchase_approval', format('PO %s approved', r ->> 'number'), 'Approved by ' || app.actor_name(p_company), 'success', '/procurement' || v_link, p_id);
    when 'quotations:pending_approval' then
      perform app.notify(p_company, 'purchase_approval', format('Quotation %s awaiting approval', r ->> 'number'),
        format('₹%s for %s', to_char(app.num(r, 'total'), 'FM99,99,99,99,990'), app.name_of('customers', (r ->> 'customer_id')::uuid)), 'info', '/sales' || v_link, p_id);
    when 'quotations:sent' then
      update rfqs set status = 'quoted' where id = (r ->> 'rfq_id')::uuid and status in ('new', 'under_review');
    when 'invoices:pending_approval' then
      perform app.notify(p_company, 'invoice_approval', format('Invoice %s awaiting approval', r ->> 'invoice_no'),
        format('%s · ₹%s', app.name_of('suppliers', (r ->> 'supplier_id')::uuid), to_char(app.num(r, 'total'), 'FM99,99,99,99,990')), 'warning', '/ap' || v_link, p_id);
    when 'work_orders:in_progress' then
      update work_orders set started_at = coalesce(started_at, now()) where id = p_id;
      if r ->> 'wo_type' = 'preventive' then
        update machines set status = 'maintenance' where id = (r ->> 'machine_id')::uuid and status <> 'breakdown';
      end if;
    when 'work_orders:completed' then
      update work_orders set completed_at = now() where id = p_id;
      if not exists (select 1 from work_orders where company_id = p_company and machine_id = (r ->> 'machine_id')::uuid and id <> p_id
                     and wo_type = 'breakdown' and status in ('open', 'assigned', 'in_progress', 'on_hold')) then
        update machines set status = 'running' where id = (r ->> 'machine_id')::uuid and status in ('breakdown', 'maintenance');
      end if;
      update pm_schedules set last_done = current_date, next_due = current_date + frequency_days where id = nullif(r ->> 'pm_schedule_id', '')::uuid;
    when 'shipments:delayed' then
      perform app.notify(p_company, 'shipment_delay', format('Shipment %s delayed', r ->> 'number'),
        format('%s · %s · ETA %s', app.name_of('customers', (r ->> 'customer_id')::uuid), r ->> 'destination', r ->> 'eta'), 'warning', '/logistics' || v_link, p_id);
    else null;
  end case;

  if p_table = 'inspections' and p_to in ('passed', 'conditional', 'failed') then perform app.inspection_decided(p_company, p_id); end if;
  if p_table = 'shipments' and p_to in ('dispatched', 'delivered', 'pod_received') then
    if p_to = 'delivered' then update shipments set delivered_on = coalesce(delivered_on, current_date) where id = p_id; end if;
    so_id := nullif(r ->> 'sales_order_id', '')::uuid;
    if so_id is not null then
      select count(*), count(*) filter (where status in ('delivered', 'pod_received')), count(*) filter (where status in ('dispatched', 'in_transit', 'delayed', 'delivered', 'pod_received'))
      into total_ships, done_ships, moving from shipments where sales_order_id = so_id and status <> 'cancelled';
      update sales_orders set status = case when total_ships > 0 and done_ships = total_ships then 'delivered' when moving > 0 then 'dispatched' else status end where id = so_id;
    end if;
  end if;
end $$;

create or replace function app.inspection_decided(p_company uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public, app as $$
declare i inspections; sev text; pct numeric;
begin
  select * into i from inspections where id = p_id;
  if i.status in ('passed', 'conditional') and i.accepted_qty = 0 then i.accepted_qty := i.lot_qty - i.rejected_qty; end if;
  if i.status = 'failed' and i.rejected_qty = 0 then i.rejected_qty := i.lot_qty - i.accepted_qty; end if;
  update inspections set accepted_qty = i.accepted_qty, rejected_qty = i.rejected_qty where id = p_id;
  if i.status = 'failed' or i.rejected_qty > 0 then
    select severity into sev from defect_codes where id = i.defect_code_id;
    insert into ncrs (company_id, inspection_id, material_id, supplier_id, qty_affected, severity, disposition, description, created_by)
    values (p_company, i.id, i.material_id, i.supplier_id, coalesce(nullif(i.rejected_qty, 0), i.lot_qty),
            coalesce(sev, case when i.status = 'failed' then 'major' else 'minor' end), 'pending',
            format('Raised from %s (%s): %s', i.number, replace(i.stage, '_', '-'), coalesce(i.findings, case when i.status = 'failed' then 'inspection failed' else 'rejections recorded' end)), auth.uid());
  end if;
  pct := case when i.lot_qty > 0 then i.rejected_qty / i.lot_qty * 100 else 0 end;
  if pct > app.setting(p_company, 'rejection_alert_pct', 3) then
    perform app.notify(p_company, 'high_rejection', format('Inspection %s: %s%% rejected', i.number, round(pct, 1)),
      format('%s · batch %s · %s', app.name_of('materials', i.material_id), coalesce(i.batch_no, '—'), i.status), 'critical', '/quality/inspections?id=' || i.id, i.id);
  end if;
end $$;

create or replace function public.transition_status(p_company_id uuid, p_table text, p_id uuid, p_to text, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare
  r entity_rules; t status_transitions; rec jsonb; v_from text; v_role text := app.member_role(p_company_id);
  v_amount numeric; v_rule approval_rules;
begin
  if v_role is null then perform app.raise_forbidden('You are not a member of this company'); end if;
  select * into r from entity_rules where table_name = p_table and has_transitions;
  if not found then perform app.raise_validation('Unknown document type'); end if;
  execute format('select to_jsonb(t) from %I t where id = $1 and company_id = $2 for update', p_table) into rec using p_id, p_company_id;
  if rec is null then raise exception using errcode = 'P0002', message = 'Record not found'; end if;
  v_from := rec ->> 'status';
  select * into t from status_transitions where table_name = p_table and from_status = v_from and to_status = p_to;
  if not found then perform app.raise_validation(format('Cannot move from "%s" to "%s"', v_from, p_to)); end if;
  if not app.has_perm(p_company_id, r.module, t.action) then perform app.raise_forbidden('Your role cannot perform this action'); end if;
  if t.require_comment and coalesce(trim(p_comment), '') = '' then perform app.raise_validation('A comment is required for this action'); end if;
  if t.action = 'approve' then
    if app.setting_bool(p_company_id, 'maker_checker', true) and (rec ->> 'created_by')::uuid = auth.uid() and v_role <> 'super_admin' then
      perform app.raise_forbidden('Maker-checker: you cannot approve a document you created');
    end if;
    if r.amount_col is not null then
      v_amount := app.num(rec, r.amount_col);
      select * into v_rule from approval_rules
      where company_id = p_company_id and entity = p_table and active and min_amount <= v_amount order by min_amount desc limit 1;
      if found and v_role not in (v_rule.approver_role, 'company_admin', 'super_admin', 'ceo') then
        perform app.raise_forbidden(format('Approval rule: amounts of %s or more need approval by %s', v_rule.min_amount, replace(v_rule.approver_role, '_', ' ')));
      end if;
    end if;
  end if;

  perform app.before_transition(p_company_id, p_table, rec, p_to);
  perform set_config('app.in_transition', p_id::text, true);
  execute format('update %I set status = $1 where id = $2', p_table) using p_to, p_id;
  perform set_config('app.in_transition', '', true);
  insert into audit_log (company_id, table_name, record_id, action, actor_id, actor_name, changes, note)
  values (p_company_id, p_table, p_id, 'transition', auth.uid(), app.actor_name(p_company_id),
          jsonb_build_object('status', jsonb_build_object('from', v_from, 'to', p_to)), nullif(trim(p_comment), ''));
  perform app.after_transition(p_company_id, p_table, p_id, v_from, p_to);
  execute format('select to_jsonb(t) from %I t where id = $1', p_table) into rec using p_id;
  return rec;
end $$;

-- ─── Cross-document RPCs ───
create or replace function public.convert_quotation(p_company_id uuid, p_quotation_id uuid, p_delivery_date date default null, p_customer_po text default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare q quotations; so sales_orders;
begin
  if not app.has_perm(p_company_id, 'sales', 'create') then perform app.raise_forbidden('Your role cannot create sales orders'); end if;
  select * into q from quotations where id = p_quotation_id and company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Quotation not found'; end if;
  if q.status <> 'accepted' then perform app.raise_validation('Only customer-accepted quotations can be converted'); end if;
  insert into sales_orders (company_id, customer_id, quotation_id, order_date, delivery_date, lines, tax_pct, customer_po, created_by)
  values (p_company_id, q.customer_id, q.id, current_date, coalesce(p_delivery_date, current_date + 21), q.lines, q.tax_pct, p_customer_po, auth.uid())
  returning * into so;
  update quotations set status = 'converted' where id = q.id;
  update rfqs set status = 'won' where id = q.rfq_id;
  return to_jsonb(so);
end $$;

create or replace function public.create_po_from_requisition(p_company_id uuid, p_requisition_id uuid, p_supplier_quotation_id uuid default null,
  p_supplier_id uuid default null, p_rate numeric default null, p_warehouse_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pr purchase_requisitions; sq supplier_quotations; m materials; po purchase_orders; v_supplier uuid; v_wh uuid; v_rate numeric; v_lead int;
begin
  if not app.has_perm(p_company_id, 'procurement', 'create') then perform app.raise_forbidden('Your role cannot create purchase orders'); end if;
  select * into pr from purchase_requisitions where id = p_requisition_id and company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Requisition not found'; end if;
  if pr.status <> 'approved' then perform app.raise_validation('Requisition must be approved before raising a PO'); end if;
  if p_supplier_quotation_id is not null then
    select * into sq from supplier_quotations where id = p_supplier_quotation_id and company_id = p_company_id and requisition_id = pr.id;
    if not found then perform app.raise_validation('Supplier quotation does not belong to this requisition'); end if;
  end if;
  select * into m from materials where id = pr.material_id;
  v_supplier := coalesce(sq.supplier_id, p_supplier_id);
  if v_supplier is null then perform app.raise_validation('Choose a supplier or supplier quotation'); end if;
  v_wh := coalesce(p_warehouse_id, (select id from warehouses where company_id = p_company_id and kind = 'raw_material' order by created_at limit 1),
                   (select id from warehouses where company_id = p_company_id order by created_at limit 1));
  v_rate := coalesce(sq.rate, p_rate, pr.estimated_rate, m.standard_cost);
  v_lead := coalesce(sq.lead_time_days, m.lead_time_days, 7);
  insert into purchase_orders (company_id, supplier_id, requisition_id, po_date, expected_date, delivery_warehouse_id, lines, tax_pct, created_by)
  values (p_company_id, v_supplier, pr.id, current_date, current_date + v_lead, v_wh,
          jsonb_build_array(jsonb_build_object('material_id', pr.material_id, 'qty', pr.qty, 'rate', v_rate, 'received_qty', 0)), 18, auth.uid())
  returning * into po;
  if sq.id is not null then
    update supplier_quotations set status = case when id = sq.id then 'selected' else 'not_selected' end where requisition_id = pr.id;
  end if;
  perform set_config('app.in_transition', pr.id::text, true);
  update purchase_requisitions set status = 'ordered' where id = pr.id;
  perform set_config('app.in_transition', '', true);
  insert into audit_log (company_id, table_name, record_id, action, actor_id, actor_name, changes, note)
  values (p_company_id, 'purchase_requisitions', pr.id, 'transition', auth.uid(), app.actor_name(p_company_id), '{"status":{"from":"approved","to":"ordered"}}', 'PO ' || po.number);
  return to_jsonb(po);
end $$;

create or replace function public.create_production_orders_from_so(p_company_id uuid, p_sales_order_id uuid, p_line_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare so sales_orders; l jsonb; v_line uuid; v_fg uuid; out jsonb := '[]'; po production_orders;
begin
  if not app.has_perm(p_company_id, 'production', 'create') then perform app.raise_forbidden('Your role cannot create production orders'); end if;
  select * into so from sales_orders where id = p_sales_order_id and company_id = p_company_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Sales order not found'; end if;
  if so.status <> 'confirmed' then perform app.raise_validation('Only confirmed orders can be released to production'); end if;
  v_line := coalesce(p_line_id, (select id from production_lines where company_id = p_company_id and active order by created_at limit 1));
  if v_line is null then perform app.raise_validation('Create a production line first'); end if;
  v_fg := (select id from warehouses where company_id = p_company_id and kind = 'finished_goods' order by created_at limit 1);
  for l in select * from jsonb_array_elements(so.lines) loop
    insert into production_orders (company_id, product_id, sales_order_id, line_id, planned_qty, planned_start, planned_end, output_warehouse_id, created_by)
    values (p_company_id, (l ->> 'material_id')::uuid, so.id, v_line, app.num(l, 'qty'), current_date, greatest(so.delivery_date, current_date), v_fg, auth.uid())
    returning * into po;
    out := out || to_jsonb(po);
  end loop;
  perform set_config('app.in_transition', so.id::text, true);
  update sales_orders set status = 'in_production' where id = so.id;
  perform set_config('app.in_transition', '', true);
  insert into audit_log (company_id, table_name, record_id, action, actor_id, actor_name, changes)
  values (p_company_id, 'sales_orders', so.id, 'transition', auth.uid(), app.actor_name(p_company_id), '{"status":{"from":"confirmed","to":"in_production"}}');
  return out;
end $$;

create or replace function public.create_shipment_from_so(p_company_id uuid, p_sales_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare so sales_orders; s shipments;
begin
  if not app.has_perm(p_company_id, 'logistics', 'create') then perform app.raise_forbidden('Your role cannot create delivery orders'); end if;
  select * into so from sales_orders where id = p_sales_order_id and company_id = p_company_id;
  if not found then raise exception using errcode = 'P0002', message = 'Sales order not found'; end if;
  if so.status not in ('ready_to_dispatch', 'in_production', 'confirmed') then perform app.raise_validation('Order is ' || so.status); end if;
  insert into shipments (company_id, sales_order_id, customer_id, destination, dispatch_date, eta, from_warehouse_id, lines, created_by)
  values (p_company_id, so.id, so.customer_id, coalesce((select city from customers where id = so.customer_id), ''), current_date, current_date + 3,
          (select id from warehouses where company_id = p_company_id and kind = 'finished_goods' order by created_at limit 1),
          (select coalesce(jsonb_agg(jsonb_build_object('material_id', l ->> 'material_id', 'qty', l -> 'qty', 'rate', l -> 'rate')), '[]') from jsonb_array_elements(so.lines) l),
          auth.uid())
  returning * into s;
  return to_jsonb(s);
end $$;

-- ─── Company registration ───
create or replace function public.register_company(p_name text, p_gstin text default null, p_city text default null,
  p_brand_color text default '#1E40AF', p_factory_name text default 'Main Plant', p_admin_name text default null) returns jsonb
language plpgsql security definer set search_path = public, app, auth as $$
declare c companies; v_slug text; v_email text; v_factory uuid;
begin
  if auth.uid() is null then perform app.raise_forbidden('Sign in first'); end if;
  if length(trim(coalesce(p_name, ''))) < 3 then perform app.raise_validation('Company name must be at least 3 characters'); end if;
  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if exists (select 1 from companies where slug = v_slug) then v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6); end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into companies (name, slug, gstin, address, brand_color) values (trim(p_name), v_slug, nullif(upper(p_gstin), ''), p_city, coalesce(p_brand_color, '#1E40AF')) returning * into c;
  insert into company_members (company_id, user_id, email, full_name, role, created_by)
  values (c.id, auth.uid(), v_email, coalesce(nullif(trim(p_admin_name), ''), v_email), 'company_admin', auth.uid());
  insert into factories (company_id, code, name, city, created_by) values (c.id, 'F1', coalesce(nullif(trim(p_factory_name), ''), 'Main Plant'), p_city, auth.uid()) returning id into v_factory;
  insert into shifts (company_id, code, name, start_time, end_time, planned_minutes, created_by) values (c.id, 'G', 'General', '09:00', '17:30', 480, auth.uid());
  insert into uoms (company_id, code, name, decimals, created_by) values (c.id, 'NOS', 'Numbers', 0, auth.uid()), (c.id, 'KG', 'Kilogram', 2, auth.uid()), (c.id, 'L', 'Litre', 1, auth.uid());
  insert into warehouses (company_id, code, name, factory_id, kind, created_by) values (c.id, 'MAIN', 'Main Store', v_factory, 'general', auth.uid());
  return to_jsonb(c);
end $$;

-- ─── Scheduled jobs (n8n / pg_cron call these) ───
create or replace function app.run_jobs_for(p_company uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare pm record; reminders int := 0; y date := current_date - 1; v_out numeric; v_tgt numeric; v_rej numeric; v_tot numeric; v_n int;
begin
  for pm in select * from pm_schedules where company_id = p_company and active and next_due <= current_date + app.setting(p_company, 'pm_reminder_days', 3)::int loop
    continue when app.recently_notified(p_company, 'pm_reminder', pm.id, 20);
    perform app.notify(p_company, 'pm_reminder', case when pm.next_due < current_date then 'Overdue: ' else 'Due soon: ' end || pm.task,
      format('%s · due %s', app.name_of('machines', pm.machine_id), pm.next_due), case when pm.next_due < current_date then 'warning' else 'info' end,
      '/maintenance/pm_schedules?id=' || pm.id, pm.id);
    reminders := reminders + 1;
    if not exists (select 1 from work_orders where pm_schedule_id = pm.id and status not in ('completed', 'closed', 'cancelled')) then
      insert into work_orders (company_id, machine_id, wo_type, priority, description, assigned_to, due_date, pm_schedule_id)
      values (p_company, pm.machine_id, 'preventive', case when pm.next_due < current_date then 'high' else 'medium' end, pm.task, pm.technician_id, pm.next_due, pm.id);
    end if;
  end loop;
  select coalesce(sum(actual_qty - rejected_qty), 0), coalesce(sum(target_qty), 0), coalesce(sum(rejected_qty), 0), coalesce(sum(actual_qty), 0), count(*)
  into v_out, v_tgt, v_rej, v_tot, v_n from shift_reports where company_id = p_company and report_date = y;
  perform app.notify(p_company, 'daily_digest', 'Daily digest · ' || y,
    case when v_n = 0 then 'No shift reports were submitted yesterday.'
         else format('Good output %s vs target %s (%s%%). Rejection %s%%. %s shift reports.', v_out, v_tgt,
                     case when v_tgt > 0 then round(v_out / v_tgt * 100) else 0 end, case when v_tot > 0 then round(v_rej / v_tot * 100, 1) else 0 end, v_n) end,
    'info', '/overview');
  return jsonb_build_object('company_id', p_company, 'reminders', reminders, 'digest', true);
end $$;

create or replace function public.run_scheduled_jobs(p_company_id uuid) returns jsonb
language plpgsql security definer set search_path = public, app as $$
begin
  if not app.has_perm(p_company_id, 'settings', 'edit') then perform app.raise_forbidden('Only admins can run scheduled jobs'); end if;
  return app.run_jobs_for(p_company_id);
end $$;

-- Service role only (n8n-inbound Edge Function): all companies.
create or replace function public.run_scheduled_jobs_all() returns jsonb
language sql security definer set search_path = public, app as $$
  select coalesce(jsonb_agg(app.run_jobs_for(id)), '[]') from companies where not is_demo
$$;

create or replace function public.weekly_report_all() returns jsonb
language plpgsql security definer set search_path = public, app as $$
declare c record; n int := 0; v_out numeric; v_tgt numeric; v_rej numeric; v_tot numeric; v_down numeric; v_ap numeric;
begin
  for c in select id from companies where not is_demo loop
    select coalesce(sum(actual_qty - rejected_qty), 0), coalesce(sum(target_qty), 0), coalesce(sum(rejected_qty), 0), coalesce(sum(actual_qty), 0), coalesce(sum(downtime_minutes), 0)
    into v_out, v_tgt, v_rej, v_tot, v_down from shift_reports where company_id = c.id and report_date >= current_date - 7;
    select coalesce(sum(total - paid_amount), 0) into v_ap from invoices where company_id = c.id and status not in ('paid', 'rejected');
    perform app.notify(c.id, 'weekly_report', 'Weekly management report',
      format('7 days: good output %s vs target %s, rejection %s%%, downtime %s h. Open payables ₹%s.', v_out, v_tgt,
             case when v_tot > 0 then round(v_rej / v_tot * 100, 1) else 0 end, round(v_down / 60, 1), to_char(v_ap, 'FM99,99,99,99,990')), 'info', '/reports');
    n := n + 1;
  end loop;
  return jsonb_build_object('companies', n);
end $$;

revoke all on function public.run_scheduled_jobs_all() from public, anon, authenticated;
revoke all on function public.weekly_report_all() from public, anon, authenticated;
