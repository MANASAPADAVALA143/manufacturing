-- GNANOVA — business tables.
-- Composite foreign keys (company_id, x_id) → (company_id, id) guarantee that a record
-- can only reference rows of the SAME company, independently of RLS.
-- Column names match src/lib/data/entities.ts exactly.

-- ─── Plant masters ───
create table public.factories (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null, city text, address text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  active boolean not null default true,
  unique (company_id, id), unique (company_id, code)
);

alter table public.company_members add foreign key (company_id, factory_id) references public.factories (company_id, id);

create table public.production_lines (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null, factory_id uuid not null, capacity_per_shift numeric check (capacity_per_shift >= 0), active boolean not null default true,
  unique (company_id, id), unique (company_id, code),
  foreign key (company_id, factory_id) references public.factories (company_id, id)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null, factory_id uuid not null,
  kind text not null check (kind in ('raw_material','wip','finished_goods','spares','general')), active boolean not null default true,
  unique (company_id, id), unique (company_id, code),
  foreign key (company_id, factory_id) references public.factories (company_id, id)
);

create table public.bins (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, warehouse_id uuid not null, description text,
  unique (company_id, id), unique (company_id, warehouse_id, code),
  foreign key (company_id, warehouse_id) references public.warehouses (company_id, id)
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  planned_minutes int not null default 480 check (planned_minutes between 1 and 1440),
  unique (company_id, id), unique (company_id, code)
);

create table public.uoms (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null check (length(code) <= 10), name text not null, decimals int not null default 0 check (decimals between 0 and 4),
  unique (company_id, id), unique (company_id, code)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null,
  skill text not null check (skill in ('operator','technician','inspector','supervisor','storekeeper','driver')),
  factory_id uuid, phone text, hourly_cost numeric check (hourly_cost >= 0), active boolean not null default true,
  unique (company_id, id), unique (company_id, code),
  foreign key (company_id, factory_id) references public.factories (company_id, id)
);

-- ─── Commercial masters ───
create table public.suppliers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null, category text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  contact_name text, email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'), phone text,
  payment_terms_days int not null default 30 check (payment_terms_days >= 0), bank_account text,
  status text not null default 'active' check (status in ('active','preferred','on_hold','blocked')), address text,
  unique (company_id, id), unique (company_id, code)
);
create unique index suppliers_gstin_uq on public.suppliers (company_id, gstin) where gstin is not null;

create table public.customers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null, city text,
  gstin text check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  contact_name text, email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'), phone text,
  payment_terms_days int not null default 30 check (payment_terms_days >= 0), credit_limit numeric check (credit_limit >= 0), address text,
  unique (company_id, id), unique (company_id, code)
);

create table public.materials (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null check (length(code) <= 24), name text not null,
  type text not null check (type in ('raw','wip','fg','spare','consumable')), category text, uom text not null,
  barcode text, hsn_code text check (hsn_code is null or hsn_code ~ '^[0-9]{4,8}$'),
  min_stock numeric not null default 0 check (min_stock >= 0), reorder_level numeric not null default 0 check (reorder_level >= 0),
  reorder_qty numeric not null default 0 check (reorder_qty >= 0), standard_cost numeric not null default 0 check (standard_cost >= 0),
  selling_price numeric check (selling_price >= 0), lead_time_days int not null default 7 check (lead_time_days >= 0),
  preferred_supplier_id uuid,
  unique (company_id, id), unique (company_id, code),
  foreign key (company_id, preferred_supplier_id) references public.suppliers (company_id, id)
);
create unique index materials_barcode_uq on public.materials (company_id, barcode) where barcode is not null;
create index materials_name_trgm on public.materials (company_id, lower(name));

create table public.machines (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null, factory_id uuid not null, line_id uuid, machine_type text,
  criticality text not null default 'medium' check (criticality in ('high','medium','low')),
  status text not null default 'running' check (status in ('running','idle','maintenance','breakdown')),
  ideal_cycle_time_sec numeric not null default 30 check (ideal_cycle_time_sec > 0),
  make text, model text, serial_no text, install_date date,
  unique (company_id, id), unique (company_id, code),
  foreign key (company_id, factory_id) references public.factories (company_id, id),
  foreign key (company_id, line_id) references public.production_lines (company_id, id)
);

create table public.transporters (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null, gstin text, contact_name text, phone text, rate_per_km numeric check (rate_per_km >= 0),
  unique (company_id, id), unique (company_id, code)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  registration_no text not null, vehicle_type text not null check (vehicle_type in ('truck','trailer','tempo','container','van')),
  capacity_kg numeric check (capacity_kg >= 0), transporter_id uuid, driver_name text, driver_phone text,
  status text not null default 'available' check (status in ('available','on_trip','maintenance')),
  unique (company_id, id), unique (company_id, registration_no),
  foreign key (company_id, transporter_id) references public.transporters (company_id, id)
);

create table public.quality_parameters (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  material_id uuid not null, name text not null, stage text not null check (stage in ('incoming','in_process','final')),
  unit text, min_value numeric, max_value numeric, check (min_value is null or max_value is null or max_value >= min_value),
  unique (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id)
);

create table public.defect_codes (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  code text not null, name text not null,
  category text not null check (category in ('dimensional','surface','material','functional','packaging')),
  severity text not null check (severity in ('critical','major','minor')),
  unique (company_id, id), unique (company_id, code)
);

-- ─── Sales ───
create table public.rfqs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, customer_id uuid not null, customer_ref text, received_date date not null default current_date,
  product_id uuid not null, quantity numeric not null check (quantity >= 1), target_price numeric check (target_price >= 0),
  required_by date, specification text,
  source text not null default 'email' check (source in ('email','portal','phone','document_upload','walk_in')),
  status text not null default 'new' check (status in ('new','under_review','quoted','won','lost','cancelled')),
  check (required_by is null or required_by >= received_date),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, product_id) references public.materials (company_id, id)
);
create index rfqs_status_idx on public.rfqs (company_id, status, received_date desc);

create table public.quotations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, rfq_id uuid, customer_id uuid not null, quote_date date not null default current_date, valid_until date not null,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  material_cost numeric check (material_cost >= 0), conversion_cost numeric check (conversion_cost >= 0),
  tax_pct numeric not null default 18 check (tax_pct between 0 and 28),
  subtotal numeric not null default 0, tax_amount numeric not null default 0, total numeric not null default 0, margin_pct numeric, terms text,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','accepted','rejected','converted')),
  check (valid_until >= quote_date),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, rfq_id) references public.rfqs (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id)
);

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, customer_id uuid not null, quotation_id uuid, customer_po text,
  order_date date not null default current_date, delivery_date date not null,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  tax_pct numeric not null default 18 check (tax_pct between 0 and 28),
  subtotal numeric not null default 0, tax_amount numeric not null default 0, total numeric not null default 0, shipping_address text,
  status text not null default 'confirmed' check (status in ('confirmed','in_production','ready_to_dispatch','dispatched','delivered','closed','cancelled')),
  check (delivery_date >= order_date),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, quotation_id) references public.quotations (company_id, id)
);
create index sales_orders_status_idx on public.sales_orders (company_id, status, delivery_date);

-- ─── Procurement ───
create table public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, request_type text not null default 'purchase' check (request_type in ('purchase','material_request')),
  material_id uuid not null, qty numeric not null check (qty > 0), estimated_rate numeric check (estimated_rate >= 0),
  required_by date not null, factory_id uuid,
  priority text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  source text not null default 'manual' check (source in ('manual','reorder','production','maintenance')),
  reason text not null, estimated_value numeric,
  status text not null default 'submitted' check (status in ('draft','submitted','approved','rejected','ordered')),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, factory_id) references public.factories (company_id, id)
);

create table public.supplier_quotations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, requisition_id uuid not null, supplier_id uuid not null, material_id uuid not null,
  rate numeric not null check (rate >= 0), lead_time_days int not null check (lead_time_days >= 0), payment_terms_days int, valid_until date, remarks text,
  status text not null default 'received' check (status in ('received','selected','not_selected')),
  unique (company_id, id), unique (company_id, number), unique (company_id, requisition_id, supplier_id),
  foreign key (company_id, requisition_id) references public.purchase_requisitions (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, supplier_id uuid not null, requisition_id uuid, po_date date not null default current_date, expected_date date not null,
  delivery_warehouse_id uuid not null,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  tax_pct numeric not null default 18 check (tax_pct between 0 and 28),
  subtotal numeric not null default 0, tax_amount numeric not null default 0, total numeric not null default 0,
  payment_terms_days int default 30, notes text,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','partially_received','received','closed','cancelled')),
  check (expected_date >= po_date),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, requisition_id) references public.purchase_requisitions (company_id, id),
  foreign key (company_id, delivery_warehouse_id) references public.warehouses (company_id, id)
);
create index purchase_orders_status_idx on public.purchase_orders (company_id, status, expected_date);
create index purchase_orders_supplier_idx on public.purchase_orders (company_id, supplier_id);

create table public.grns (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, po_id uuid not null, supplier_id uuid not null, received_date date not null default current_date, warehouse_id uuid not null,
  supplier_challan_no text, vehicle_no text,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'), remarks text,
  status text not null default 'draft' check (status in ('draft','posted','cancelled')),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, po_id) references public.purchase_orders (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses (company_id, id)
);
create index grns_po_idx on public.grns (company_id, po_id, status);

-- ─── Accounts payable ───
create table public.invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, invoice_no text not null, supplier_id uuid not null, invoice_date date not null, due_date date not null,
  po_id uuid, grn_id uuid,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  tax_pct numeric not null default 18 check (tax_pct between 0 and 28),
  subtotal numeric not null default 0, tax_amount numeric not null default 0, total numeric not null default 0,
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  match_status text not null default 'unmatched' check (match_status in ('unmatched','matched','exception')),
  exceptions jsonb not null default '[]', duplicate_of uuid, extraction_confidence numeric,
  status text not null default 'received' check (status in ('received','matched','exception','pending_approval','approved','on_hold','partially_paid','paid','rejected')),
  check (due_date >= invoice_date), check (paid_amount <= total + 0.01),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, po_id) references public.purchase_orders (company_id, id),
  foreign key (company_id, grn_id) references public.grns (company_id, id)
);
-- Hard duplicate detection: same supplier invoice number (normalised) cannot be recorded twice.
create unique index invoices_no_uq on public.invoices (company_id, supplier_id, upper(regexp_replace(invoice_no, '[\s/\\-]', '', 'g'))) where status <> 'rejected';
create index invoices_status_idx on public.invoices (company_id, status, due_date);

create table public.payments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, invoice_id uuid not null, payment_date date not null default current_date, amount numeric not null check (amount > 0),
  mode text not null check (mode in ('neft','rtgs','imps','cheque','upi')), reference_no text not null,
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, invoice_id) references public.invoices (company_id, id)
);

-- ─── Production ───
create table public.production_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, product_id uuid not null, sales_order_id uuid, line_id uuid not null, machine_id uuid,
  planned_qty numeric not null check (planned_qty >= 1), produced_qty numeric not null default 0, rejected_qty numeric not null default 0,
  planned_start date not null default current_date, planned_end date not null, output_warehouse_id uuid,
  priority text not null default 'normal' check (priority in ('high','normal','low')), notes text,
  status text not null default 'planned' check (status in ('planned','released','in_progress','completed','closed','cancelled')),
  check (planned_end >= planned_start),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, product_id) references public.materials (company_id, id),
  foreign key (company_id, sales_order_id) references public.sales_orders (company_id, id),
  foreign key (company_id, line_id) references public.production_lines (company_id, id),
  foreign key (company_id, machine_id) references public.machines (company_id, id),
  foreign key (company_id, output_warehouse_id) references public.warehouses (company_id, id)
);
create index production_orders_status_idx on public.production_orders (company_id, status, line_id);

create table public.shift_reports (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, report_date date not null default current_date, shift_id uuid not null, line_id uuid not null, machine_id uuid not null,
  production_order_id uuid, product_id uuid, operator_id uuid,
  target_qty numeric not null check (target_qty >= 0), actual_qty numeric not null check (actual_qty >= 0),
  rejected_qty numeric not null default 0 check (rejected_qty >= 0),
  planned_minutes int not null default 480 check (planned_minutes between 1 and 1440),
  downtime_minutes int not null default 0 check (downtime_minutes >= 0),
  downtime_reason text default 'none' check (downtime_reason in ('none','breakdown','changeover','material_shortage','power_failure','quality_issue','no_operator','planned_maintenance','other')),
  comments text,
  status text not null default 'submitted' check (status in ('submitted','verified')),
  check (rejected_qty <= actual_qty), check (downtime_minutes <= planned_minutes),
  check (downtime_minutes = 0 or downtime_reason <> 'none'),
  unique (company_id, id), unique (company_id, number),
  unique (company_id, report_date, shift_id, machine_id),
  foreign key (company_id, shift_id) references public.shifts (company_id, id),
  foreign key (company_id, line_id) references public.production_lines (company_id, id),
  foreign key (company_id, machine_id) references public.machines (company_id, id),
  foreign key (company_id, production_order_id) references public.production_orders (company_id, id),
  foreign key (company_id, product_id) references public.materials (company_id, id),
  foreign key (company_id, operator_id) references public.employees (company_id, id)
);
create index shift_reports_date_idx on public.shift_reports (company_id, report_date desc, line_id);

-- ─── Inventory ───
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, movement_type text not null check (movement_type in ('in','out','transfer','adjust')),
  movement_date date not null default current_date, material_id uuid not null, warehouse_id uuid not null, bin_id uuid, to_warehouse_id uuid,
  batch_no text, qty numeric not null check (qty <> 0), unit_cost numeric check (unit_cost >= 0),
  reason text not null check (reason in ('purchase_receipt','production_issue','production_output','maintenance_issue','sales_dispatch','customer_return','supplier_return','inter_warehouse','stock_audit','damage','opening_balance','other')),
  reference text,
  check (movement_type = 'adjust' or qty > 0),
  check (movement_type <> 'transfer' or (to_warehouse_id is not null and to_warehouse_id <> warehouse_id)),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses (company_id, id),
  foreign key (company_id, to_warehouse_id) references public.warehouses (company_id, id),
  foreign key (company_id, bin_id) references public.bins (company_id, id)
);
create index stock_movements_mat_idx on public.stock_movements (company_id, material_id, movement_date desc);
create index stock_movements_date_idx on public.stock_movements (company_id, movement_date desc);

create table public.stock_balances (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  material_id uuid not null, warehouse_id uuid not null, bin_id uuid, batch_no text not null default '',
  qty numeric not null check (qty >= 0),
  unique (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses (company_id, id),
  foreign key (company_id, bin_id) references public.bins (company_id, id)
);
create unique index stock_balances_slot_uq on public.stock_balances (company_id, material_id, warehouse_id, coalesce(bin_id, '00000000-0000-0000-0000-000000000000'::uuid), batch_no);

create table public.reservations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, material_id uuid not null, warehouse_id uuid not null, qty numeric not null check (qty > 0),
  production_order_id uuid, required_date date not null,
  status text not null default 'active' check (status in ('active','issued','released')),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, warehouse_id) references public.warehouses (company_id, id),
  foreign key (company_id, production_order_id) references public.production_orders (company_id, id)
);

create table public.stock_audits (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, count_date date not null default current_date, warehouse_id uuid not null, material_id uuid not null, batch_no text,
  system_qty numeric, counted_qty numeric not null check (counted_qty >= 0), variance_qty numeric, remarks text,
  status text not null default 'counted' check (status in ('counted','approved','rejected')),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, warehouse_id) references public.warehouses (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id)
);

-- ─── Quality ───
create table public.inspections (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, stage text not null check (stage in ('incoming','in_process','final')), inspection_date date not null default current_date,
  material_id uuid not null, supplier_id uuid, grn_id uuid, production_order_id uuid, batch_no text,
  lot_qty numeric not null check (lot_qty >= 0), sample_size numeric check (sample_size >= 0),
  accepted_qty numeric not null default 0 check (accepted_qty >= 0), rejected_qty numeric not null default 0 check (rejected_qty >= 0),
  defect_code_id uuid, inspector_id uuid, findings text,
  status text not null default 'requested' check (status in ('requested','in_progress','passed','conditional','failed')),
  check (accepted_qty + rejected_qty <= lot_qty),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id),
  foreign key (company_id, grn_id) references public.grns (company_id, id),
  foreign key (company_id, production_order_id) references public.production_orders (company_id, id),
  foreign key (company_id, defect_code_id) references public.defect_codes (company_id, id),
  foreign key (company_id, inspector_id) references public.employees (company_id, id)
);
create index inspections_status_idx on public.inspections (company_id, status, inspection_date desc);

create table public.ncrs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, inspection_id uuid, material_id uuid not null, supplier_id uuid, qty_affected numeric not null check (qty_affected >= 0),
  severity text not null check (severity in ('critical','major','minor')),
  disposition text not null default 'pending' check (disposition in ('pending','rework','scrap','use_as_is','return_to_supplier')),
  description text not null,
  status text not null default 'open' check (status in ('open','investigating','dispositioned','closed')),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, inspection_id) references public.inspections (company_id, id),
  foreign key (company_id, material_id) references public.materials (company_id, id),
  foreign key (company_id, supplier_id) references public.suppliers (company_id, id)
);

create table public.capas (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, ncr_id uuid, root_cause text not null, corrective_action text not null, preventive_action text,
  owner_id uuid, due_date date not null,
  status text not null default 'open' check (status in ('open','in_progress','verified','closed')),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, ncr_id) references public.ncrs (company_id, id),
  foreign key (company_id, owner_id) references public.employees (company_id, id)
);

-- ─── Maintenance ───
create table public.pm_schedules (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  machine_id uuid not null, task text not null, frequency_days int not null check (frequency_days >= 1),
  last_done date, next_due date not null, technician_id uuid, estimated_hours numeric check (estimated_hours >= 0), active boolean not null default true,
  unique (company_id, id),
  foreign key (company_id, machine_id) references public.machines (company_id, id),
  foreign key (company_id, technician_id) references public.employees (company_id, id)
);
create index pm_due_idx on public.pm_schedules (company_id, next_due) where active;

create table public.work_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, machine_id uuid not null,
  wo_type text not null check (wo_type in ('breakdown','corrective','preventive','inspection')),
  priority text not null default 'medium' check (priority in ('critical','high','medium','low')),
  description text not null, assigned_to uuid, due_date date, pm_schedule_id uuid,
  downtime_minutes numeric check (downtime_minutes >= 0), labour_hours numeric check (labour_hours >= 0), labour_cost numeric check (labour_cost >= 0),
  parts_used jsonb not null default '[]' check (jsonb_typeof(parts_used) = 'array'), parts_warehouse_id uuid,
  completion_remarks text, started_at timestamptz, completed_at timestamptz,
  status text not null default 'open' check (status in ('open','assigned','in_progress','on_hold','completed','closed','cancelled')),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, machine_id) references public.machines (company_id, id),
  foreign key (company_id, assigned_to) references public.employees (company_id, id),
  foreign key (company_id, pm_schedule_id) references public.pm_schedules (company_id, id),
  foreign key (company_id, parts_warehouse_id) references public.warehouses (company_id, id)
);
create index work_orders_status_idx on public.work_orders (company_id, status, machine_id);

-- ─── Logistics ───
create table public.shipments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  number text, sales_order_id uuid, customer_id uuid not null, destination text not null,
  dispatch_date date not null default current_date, eta date not null,
  transporter_id uuid, vehicle_id uuid, from_warehouse_id uuid,
  lines jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  challan_no text, eway_bill_no text check (eway_bill_no is null or eway_bill_no ~ '^[0-9]{12}$'), lr_no text,
  freight_cost numeric check (freight_cost >= 0), delivered_on date, receiver_name text,
  status text not null default 'planned' check (status in ('planned','loaded','dispatched','in_transit','delayed','delivered','pod_received','cancelled')),
  check (eta >= dispatch_date),
  unique (company_id, id), unique (company_id, number),
  foreign key (company_id, sales_order_id) references public.sales_orders (company_id, id),
  foreign key (company_id, customer_id) references public.customers (company_id, id),
  foreign key (company_id, transporter_id) references public.transporters (company_id, id),
  foreign key (company_id, vehicle_id) references public.vehicles (company_id, id),
  foreign key (company_id, from_warehouse_id) references public.warehouses (company_id, id)
);
create index shipments_status_idx on public.shipments (company_id, status, eta);

-- ─── Configuration & platform ───
create table public.approval_rules (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  entity text not null check (entity in ('purchase_requisitions','purchase_orders','quotations','invoices')),
  min_amount numeric not null default 0 check (min_amount >= 0), approver_role text not null, active boolean not null default true,
  unique (company_id, id)
);

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  name text not null, report_type text not null, frequency text not null check (frequency in ('daily','weekly','monthly')),
  send_time text not null default '08:00' check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  channel text not null default 'email' check (channel in ('email','whatsapp')), recipients text not null,
  active boolean not null default true, last_run_at timestamptz,
  unique (company_id, id)
);

create table public.report_runs (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  report_type text not null, format text not null, row_count int, period_from date, period_to date, generated_by_name text,
  unique (company_id, id)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  entity text not null, record_id uuid not null, file_name text not null, mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 15728640),
  storage_path text not null unique check (storage_path like company_id::text || '/%'),
  unique (company_id, id)
);
create index attachments_record_idx on public.attachments (company_id, entity, record_id);

-- Attach standard triggers.
do $$
declare t text;
begin
  foreach t in array array[
    'factories','production_lines','warehouses','bins','shifts','uoms','employees','suppliers','customers','materials','machines',
    'transporters','vehicles','quality_parameters','defect_codes','rfqs','quotations','sales_orders','purchase_requisitions',
    'supplier_quotations','purchase_orders','grns','invoices','payments','production_orders','shift_reports','stock_movements',
    'reservations','stock_audits','inspections','ncrs','capas','pm_schedules','work_orders','shipments','approval_rules',
    'report_schedules','report_runs','attachments']
  loop
    call app.attach_standard_triggers(t);
  end loop;
end $$;
