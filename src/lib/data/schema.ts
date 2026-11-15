import type { Role } from '@/lib/rbac';

/** Every tenant-scoped table. Must match `supabase/migrations`. */
export const TABLES = [
  'factories', 'production_lines', 'warehouses', 'bins', 'shifts', 'uoms', 'employees',
  'materials', 'customers', 'suppliers', 'machines', 'transporters', 'vehicles',
  'quality_parameters', 'defect_codes',
  'rfqs', 'quotations', 'sales_orders',
  'purchase_requisitions', 'supplier_quotations', 'purchase_orders', 'grns',
  'invoices', 'payments',
  'production_orders', 'shift_reports',
  'stock_movements', 'stock_balances', 'reservations', 'stock_audits',
  'inspections', 'ncrs', 'capas',
  'pm_schedules', 'work_orders',
  'shipments',
  'approval_rules', 'notification_preferences', 'report_schedules', 'report_runs',
  'notifications', 'notification_outbox', 'attachments', 'audit_log', 'company_members',
] as const;

export type TableName = (typeof TABLES)[number];

export interface BaseRow {
  id: string;
  company_id: string;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  [key: string]: unknown;
}

export interface Company {
  id: string;
  name: string;
  slug: string;
  gstin?: string | null;
  address?: string | null;
  brand_color: string;
  logo_url?: string | null;
  currency: string;
  timezone: string;
  is_demo: boolean;
  settings: CompanySettings;
  created_at: string;
}

export interface CompanySettings {
  oee_target_pct: number;
  rejection_alert_pct: number;
  below_target_alert_pct: number;
  ap_price_tolerance_pct: number;
  ap_qty_tolerance_pct: number;
  duplicate_window_days: number;
  low_stock_alerts: boolean;
  /** Creator of a document may not approve it. */
  maker_checker: boolean;
  pm_reminder_days: number;
}

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  oee_target_pct: 85,
  rejection_alert_pct: 3,
  below_target_alert_pct: 90,
  ap_price_tolerance_pct: 2,
  ap_qty_tolerance_pct: 0,
  duplicate_window_days: 90,
  low_stock_alerts: true,
  maker_checker: true,
  pm_reminder_days: 3,
};

export interface Member extends BaseRow {
  user_id: string;
  email: string;
  full_name: string;
  role: Role;
  phone?: string | null;
  factory_id?: string | null;
  active: boolean;
}

export interface LineItem {
  material_id: string;
  qty: number;
  rate: number;
  received_qty?: number;
  accepted_qty?: number;
  rejected_qty?: number;
  batch_no?: string;
  [key: string]: unknown;
}

export type MaterialType = 'raw' | 'wip' | 'fg' | 'spare' | 'consumable';

export interface Material extends BaseRow {
  code: string;
  name: string;
  type: MaterialType;
  uom: string;
  category?: string;
  barcode?: string | null;
  min_stock: number;
  reorder_level: number;
  reorder_qty: number;
  standard_cost: number;
  selling_price?: number;
  lead_time_days: number;
  preferred_supplier_id?: string | null;
  hsn_code?: string | null;
}

export interface StockBalance extends BaseRow {
  material_id: string;
  warehouse_id: string;
  bin_id?: string | null;
  batch_no: string;
  qty: number;
}

export interface StockMovement extends BaseRow {
  number: string;
  movement_type: 'in' | 'out' | 'transfer' | 'adjust';
  material_id: string;
  qty: number;
  warehouse_id: string;
  bin_id?: string | null;
  to_warehouse_id?: string | null;
  batch_no?: string | null;
  reason: string;
  reference?: string | null;
  unit_cost?: number | null;
  movement_date: string;
}

export interface Machine extends BaseRow {
  code: string;
  name: string;
  factory_id: string;
  line_id?: string | null;
  machine_type?: string;
  criticality: 'high' | 'medium' | 'low';
  status: 'running' | 'idle' | 'breakdown' | 'maintenance';
  ideal_cycle_time_sec: number;
  make?: string;
  model?: string;
  serial_no?: string;
  install_date?: string;
}

export interface ShiftReport extends BaseRow {
  number: string;
  report_date: string;
  shift_id: string;
  line_id: string;
  machine_id: string;
  production_order_id?: string | null;
  product_id?: string | null;
  operator_id?: string | null;
  target_qty: number;
  actual_qty: number;
  rejected_qty: number;
  planned_minutes: number;
  downtime_minutes: number;
  downtime_reason?: string | null;
  comments?: string | null;
}

export interface WorkOrder extends BaseRow {
  number: string;
  machine_id: string;
  wo_type: 'preventive' | 'corrective' | 'breakdown' | 'inspection';
  priority: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  assigned_to?: string | null;
  due_date?: string | null;
  status: string;
  parts_used?: LineItem[];
  labour_hours?: number;
  labour_cost?: number;
  downtime_minutes?: number;
  completion_remarks?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface Invoice extends BaseRow {
  number: string;
  invoice_no: string;
  supplier_id: string;
  invoice_date: string;
  due_date: string;
  po_id?: string | null;
  grn_id?: string | null;
  lines: LineItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  match_status: 'unmatched' | 'matched' | 'exception';
  exceptions: string[];
  duplicate_of?: string | null;
  status: string;
  extraction_confidence?: number | null;
}

export interface Attachment extends BaseRow {
  entity: TableName;
  record_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  /** Demo backend only: inline data URL. Supabase stores the file in Storage. */
  data_url?: string;
}

export interface AuditEntry extends BaseRow {
  table_name: string;
  record_id: string;
  action: 'insert' | 'update' | 'delete' | 'transition';
  actor_id?: string | null;
  actor_name?: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  note?: string | null;
}

export interface AppNotification extends BaseRow {
  event_type: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  target_roles: Role[];
  target_user_id?: string | null;
  link?: string | null;
  ref_id?: string | null;
  read_by: string[];
}

export interface OutboxMessage extends BaseRow {
  event_type: string;
  channel: 'whatsapp' | 'email' | 'webhook';
  recipient: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'sent' | 'failed' | 'dead' | 'skipped';
  attempts: number;
  next_attempt_at: string;
  last_error?: string | null;
  provider_message_id?: string | null;
}
