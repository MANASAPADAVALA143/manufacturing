import type { ModuleId } from '@/lib/types';
import type { Action } from '@/lib/rbac';
import { ROLES } from '@/lib/rbac';
import { ymd } from '@/lib/dates';
import type { BaseRow, TableName } from './schema';

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'currency' | 'percent' | 'date' | 'datetime'
  | 'select' | 'ref' | 'boolean' | 'email' | 'phone' | 'lines' | 'color';

export interface Option { value: string; label: string }

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Option[];
  ref?: TableName;
  /** Restrict selectable referenced rows, e.g. `{ type: ['fg'] }`. */
  refWhere?: Record<string, unknown[]>;
  min?: number;
  max?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternMessage?: string;
  placeholder?: string;
  help?: string;
  default?: unknown;
  /** Hidden from the create/edit form (still shown in detail). */
  form?: boolean;
  /** Shown as a desktop table column. */
  table?: boolean;
  readOnly?: boolean;
  lineFields?: FieldDef[];
  wide?: boolean;
  /** Field can be filled by scanning a barcode/QR code. */
  scannable?: boolean;
}

export type Variant = 'green' | 'amber' | 'red' | 'blue' | 'grey';

export interface StatusDef { value: string; label: string; variant: Variant }

export interface Transition {
  to: string;
  from: string[];
  label: string;
  action: Extract<Action, 'edit' | 'approve'>;
  tone?: 'primary' | 'danger' | 'default';
  requireComment?: boolean;
}

export interface EntityDef {
  table: TableName;
  module: ModuleId;
  label: string;
  plural: string;
  numberPrefix?: string;
  titleKey: string;
  subtitle?: (r: BaseRow, refName: (t: TableName, id: unknown) => string) => string;
  fields: FieldDef[];
  statuses?: StatusDef[];
  initialStatus?: string;
  transitions?: Transition[];
  searchKeys: string[];
  filterKeys?: string[];
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** Monetary value used by approval rules. */
  amountKey?: string;
  /** Statuses in which a record may still be edited. Undefined = always. */
  editableIn?: string[];
  deletableIn?: string[];
  immutable?: boolean;
  attachments?: boolean;
  /** Derived values recomputed on every form change and again on the server. */
  compute?: (v: Record<string, unknown>) => Record<string, unknown>;
  validate?: (v: Record<string, unknown>) => { [field: string]: string | undefined };
}

// ─── helpers ───
const opt = (...vals: string[]): Option[] =>
  vals.map((v) => ({ value: v, label: v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) }));
const st = (value: string, variant: Variant, label?: string): StatusDef => ({
  value,
  variant,
  label: label ?? value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
});
const today = () => ymd();

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PHONE = /^\+?[0-9 ()-]{8,18}$/;

const materialLine = (refWhere?: Record<string, unknown[]>): FieldDef[] => [
  { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', required: true, refWhere },
  { key: 'qty', label: 'Qty', type: 'number', required: true, min: 0.001 },
  { key: 'rate', label: 'Rate', type: 'currency', required: true, min: 0 },
];

export const sumLines = (lines: unknown): number =>
  Array.isArray(lines)
    ? lines.reduce((s, l) => s + (Number(l?.qty) || 0) * (Number(l?.rate) || 0), 0)
    : 0;

const round2 = (n: number) => Math.round(n * 100) / 100;

const linesTotals = (taxKey = 'tax_pct') => (v: Record<string, unknown>) => {
  const subtotal = round2(sumLines(v.lines));
  const tax = round2((subtotal * (Number(v[taxKey]) || 0)) / 100);
  return { subtotal, tax_amount: tax, total: round2(subtotal + tax) };
};

const dateOrder = (a: string, b: string, msg: string) => (v: Record<string, unknown>) =>
  v[a] && v[b] && String(v[b]) < String(v[a]) ? { [b]: msg } : {};

// ─── Masters ───
const factories: EntityDef = {
  table: 'factories', module: 'settings', label: 'Factory', plural: 'Factories', titleKey: 'name',
  subtitle: (r) => `${r.code} · ${r.city ?? ''}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, maxLength: 12, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'city', label: 'City', type: 'text', table: true },
    { key: 'address', label: 'Address', type: 'textarea', wide: true },
    { key: 'gstin', label: 'GSTIN', type: 'text', pattern: GSTIN, patternMessage: 'Enter a valid 15-character GSTIN' },
    { key: 'active', label: 'Active', type: 'boolean', default: true, table: true },
  ],
  searchKeys: ['code', 'name', 'city'],
};

const productionLines: EntityDef = {
  table: 'production_lines', module: 'settings', label: 'Production line', plural: 'Production lines', titleKey: 'name',
  subtitle: (r, ref) => `${r.code} · ${ref('factories', r.factory_id)}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'factory_id', label: 'Factory', type: 'ref', ref: 'factories', required: true, table: true },
    { key: 'capacity_per_shift', label: 'Capacity / shift', type: 'number', min: 0, table: true },
    { key: 'active', label: 'Active', type: 'boolean', default: true },
  ],
  searchKeys: ['code', 'name'], filterKeys: ['factory_id'],
};

const warehouses: EntityDef = {
  table: 'warehouses', module: 'settings', label: 'Warehouse', plural: 'Warehouses', titleKey: 'name',
  subtitle: (r, ref) => `${r.code} · ${ref('factories', r.factory_id)}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'factory_id', label: 'Factory', type: 'ref', ref: 'factories', required: true, table: true },
    { key: 'kind', label: 'Type', type: 'select', options: opt('raw_material', 'wip', 'finished_goods', 'spares', 'general'), required: true, table: true },
    { key: 'active', label: 'Active', type: 'boolean', default: true },
  ],
  searchKeys: ['code', 'name'], filterKeys: ['factory_id', 'kind'],
};

const bins: EntityDef = {
  table: 'bins', module: 'settings', label: 'Bin / location', plural: 'Bins & locations', titleKey: 'code',
  subtitle: (r, ref) => ref('warehouses', r.warehouse_id),
  fields: [
    { key: 'code', label: 'Bin code', type: 'text', required: true, table: true, scannable: true },
    { key: 'warehouse_id', label: 'Warehouse', type: 'ref', ref: 'warehouses', required: true, table: true },
    { key: 'description', label: 'Description', type: 'text', table: true },
  ],
  searchKeys: ['code', 'description'], filterKeys: ['warehouse_id'],
};

const shifts: EntityDef = {
  table: 'shifts', module: 'settings', label: 'Shift', plural: 'Shifts', titleKey: 'name',
  subtitle: (r) => `${r.start_time}–${r.end_time}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'start_time', label: 'Start (HH:MM)', type: 'text', required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'Use 24h HH:MM', table: true },
    { key: 'end_time', label: 'End (HH:MM)', type: 'text', required: true, pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'Use 24h HH:MM', table: true },
    { key: 'planned_minutes', label: 'Planned minutes', type: 'number', required: true, min: 1, max: 1440, default: 480, table: true },
  ],
  searchKeys: ['code', 'name'],
};

const uoms: EntityDef = {
  table: 'uoms', module: 'settings', label: 'Unit of measure', plural: 'Units of measure', titleKey: 'code',
  subtitle: (r) => String(r.name ?? ''),
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, maxLength: 10, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'decimals', label: 'Decimals allowed', type: 'number', min: 0, max: 4, default: 0, table: true },
  ],
  searchKeys: ['code', 'name'],
};

const employees: EntityDef = {
  table: 'employees', module: 'settings', label: 'Employee', plural: 'Employees & operators', titleKey: 'name',
  subtitle: (r) => `${r.code} · ${String(r.skill ?? '').replace(/_/g, ' ')}`,
  fields: [
    { key: 'code', label: 'Employee code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'skill', label: 'Skill', type: 'select', options: opt('operator', 'technician', 'inspector', 'supervisor', 'storekeeper', 'driver'), required: true, table: true },
    { key: 'factory_id', label: 'Factory', type: 'ref', ref: 'factories', table: true },
    { key: 'phone', label: 'Phone', type: 'phone', pattern: PHONE, patternMessage: 'Enter a valid phone number' },
    { key: 'hourly_cost', label: 'Hourly cost', type: 'currency', min: 0 },
    { key: 'active', label: 'Active', type: 'boolean', default: true },
  ],
  searchKeys: ['code', 'name'], filterKeys: ['skill', 'factory_id'],
};

const materials: EntityDef = {
  table: 'materials', module: 'inventory', label: 'Material', plural: 'Material & product master', titleKey: 'name',
  subtitle: (r) => `${r.code} · ${String(r.type).toUpperCase()} · ${r.uom}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true, maxLength: 24 },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'type', label: 'Type', type: 'select', required: true, table: true, options: [
      { value: 'raw', label: 'Raw material' }, { value: 'wip', label: 'Work in progress' },
      { value: 'fg', label: 'Finished good' }, { value: 'spare', label: 'Spare part' },
      { value: 'consumable', label: 'Consumable' },
    ] },
    { key: 'category', label: 'Category', type: 'text' },
    { key: 'uom', label: 'UOM', type: 'text', required: true, table: true, maxLength: 10 },
    { key: 'barcode', label: 'Barcode / QR', type: 'text', scannable: true },
    { key: 'hsn_code', label: 'HSN code', type: 'text', pattern: /^\d{4,8}$/, patternMessage: '4–8 digits' },
    { key: 'min_stock', label: 'Minimum stock', type: 'number', min: 0, default: 0 },
    { key: 'reorder_level', label: 'Reorder level', type: 'number', min: 0, default: 0, table: true },
    { key: 'reorder_qty', label: 'Reorder qty', type: 'number', min: 0, default: 0 },
    { key: 'standard_cost', label: 'Standard cost', type: 'currency', min: 0, default: 0, table: true },
    { key: 'selling_price', label: 'Selling price', type: 'currency', min: 0 },
    { key: 'lead_time_days', label: 'Lead time (days)', type: 'number', min: 0, default: 7 },
    { key: 'preferred_supplier_id', label: 'Preferred supplier', type: 'ref', ref: 'suppliers' },
  ],
  searchKeys: ['code', 'name', 'barcode', 'category'], filterKeys: ['type'],
  validate: (v) =>
    Number(v.reorder_level) < Number(v.min_stock) ? { reorder_level: 'Reorder level should be ≥ minimum stock' } : {},
};

const customers: EntityDef = {
  table: 'customers', module: 'sales', label: 'Customer', plural: 'Customers', titleKey: 'name',
  subtitle: (r) => `${r.code} · ${r.city ?? ''}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'city', label: 'City', type: 'text', table: true },
    { key: 'gstin', label: 'GSTIN', type: 'text', pattern: GSTIN, patternMessage: 'Enter a valid 15-character GSTIN', table: true },
    { key: 'contact_name', label: 'Contact person', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone', type: 'phone', pattern: PHONE, patternMessage: 'Enter a valid phone number' },
    { key: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', min: 0, default: 30 },
    { key: 'credit_limit', label: 'Credit limit', type: 'currency', min: 0 },
    { key: 'address', label: 'Address', type: 'textarea', wide: true },
  ],
  searchKeys: ['code', 'name', 'city', 'gstin'],
};

const suppliers: EntityDef = {
  table: 'suppliers', module: 'procurement', label: 'Supplier', plural: 'Supplier master', titleKey: 'name',
  subtitle: (r) => `${r.code} · ${r.category ?? ''}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'category', label: 'Category', type: 'text', table: true },
    { key: 'gstin', label: 'GSTIN', type: 'text', pattern: GSTIN, patternMessage: 'Enter a valid 15-character GSTIN', table: true },
    { key: 'contact_name', label: 'Contact person', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'phone', label: 'Phone / WhatsApp', type: 'phone', pattern: PHONE, patternMessage: 'Enter a valid phone number' },
    { key: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', min: 0, default: 30 },
    { key: 'bank_account', label: 'Bank account (masked)', type: 'text', help: 'Store only the last 4 digits here.' },
    { key: 'status', label: 'Status', type: 'select', options: opt('active', 'preferred', 'on_hold', 'blocked'), default: 'active', table: true },
    { key: 'address', label: 'Address', type: 'textarea', wide: true },
  ],
  searchKeys: ['code', 'name', 'category', 'gstin'], filterKeys: ['status'],
};

const machines: EntityDef = {
  table: 'machines', module: 'maintenance', label: 'Machine', plural: 'Machine & equipment register', titleKey: 'name',
  subtitle: (r, ref) => `${r.code} · ${ref('production_lines', r.line_id) || ref('factories', r.factory_id)}`,
  statuses: [st('running', 'green'), st('idle', 'grey'), st('maintenance', 'amber', 'Under maintenance'), st('breakdown', 'red')],
  fields: [
    { key: 'code', label: 'Asset code', type: 'text', required: true, table: true, scannable: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'factory_id', label: 'Factory', type: 'ref', ref: 'factories', required: true },
    { key: 'line_id', label: 'Production line', type: 'ref', ref: 'production_lines', table: true },
    { key: 'machine_type', label: 'Type', type: 'text' },
    { key: 'criticality', label: 'Criticality', type: 'select', options: opt('high', 'medium', 'low'), default: 'medium', required: true, table: true },
    { key: 'status', label: 'Status', type: 'select', options: opt('running', 'idle', 'maintenance', 'breakdown'), default: 'running', required: true, table: true },
    { key: 'ideal_cycle_time_sec', label: 'Ideal cycle time (sec/unit)', type: 'number', min: 0.01, required: true, default: 30, help: 'Used for the OEE performance factor.' },
    { key: 'make', label: 'Make', type: 'text' },
    { key: 'model', label: 'Model', type: 'text' },
    { key: 'serial_no', label: 'Serial no.', type: 'text' },
    { key: 'install_date', label: 'Install date', type: 'date' },
  ],
  searchKeys: ['code', 'name', 'machine_type', 'serial_no'], filterKeys: ['line_id', 'status', 'criticality'],
};

const transporters: EntityDef = {
  table: 'transporters', module: 'logistics', label: 'Transporter', plural: 'Transporter master', titleKey: 'name',
  subtitle: (r) => String(r.code ?? ''),
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'gstin', label: 'GSTIN', type: 'text', pattern: GSTIN, patternMessage: 'Enter a valid 15-character GSTIN' },
    { key: 'contact_name', label: 'Contact', type: 'text', table: true },
    { key: 'phone', label: 'Phone', type: 'phone', pattern: PHONE, patternMessage: 'Enter a valid phone number', table: true },
    { key: 'rate_per_km', label: 'Rate per km', type: 'currency', min: 0 },
  ],
  searchKeys: ['code', 'name'],
};

const vehicles: EntityDef = {
  table: 'vehicles', module: 'logistics', label: 'Vehicle', plural: 'Vehicles', titleKey: 'registration_no',
  subtitle: (r, ref) => `${r.vehicle_type} · ${ref('transporters', r.transporter_id) || 'Own fleet'}`,
  fields: [
    { key: 'registration_no', label: 'Registration no.', type: 'text', required: true, table: true, pattern: /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{1,4}$/i, patternMessage: 'e.g. TS09AB1234' },
    { key: 'vehicle_type', label: 'Type', type: 'select', options: opt('truck', 'trailer', 'tempo', 'container', 'van'), required: true, table: true },
    { key: 'capacity_kg', label: 'Capacity (kg)', type: 'number', min: 0, table: true },
    { key: 'transporter_id', label: 'Transporter', type: 'ref', ref: 'transporters', table: true },
    { key: 'driver_name', label: 'Driver', type: 'text' },
    { key: 'driver_phone', label: 'Driver phone', type: 'phone', pattern: PHONE, patternMessage: 'Enter a valid phone number' },
    { key: 'status', label: 'Status', type: 'select', options: opt('available', 'on_trip', 'maintenance'), default: 'available', table: true },
  ],
  searchKeys: ['registration_no', 'driver_name'], filterKeys: ['status', 'transporter_id'],
};

const qualityParameters: EntityDef = {
  table: 'quality_parameters', module: 'quality', label: 'Quality parameter', plural: 'Quality parameters', titleKey: 'name',
  subtitle: (r, ref) => ref('materials', r.material_id),
  fields: [
    { key: 'material_id', label: 'Material / product', type: 'ref', ref: 'materials', required: true, table: true },
    { key: 'name', label: 'Parameter', type: 'text', required: true, table: true },
    { key: 'stage', label: 'Stage', type: 'select', options: opt('incoming', 'in_process', 'final'), required: true, table: true },
    { key: 'unit', label: 'Unit', type: 'text', table: true },
    { key: 'min_value', label: 'Min', type: 'number', table: true },
    { key: 'max_value', label: 'Max', type: 'number', table: true },
  ],
  searchKeys: ['name'], filterKeys: ['stage', 'material_id'],
  validate: (v) =>
    v.min_value != null && v.max_value != null && Number(v.max_value) < Number(v.min_value)
      ? { max_value: 'Max must be ≥ min' } : {},
};

const defectCodes: EntityDef = {
  table: 'defect_codes', module: 'quality', label: 'Defect code', plural: 'Defect classification', titleKey: 'name',
  subtitle: (r) => `${r.code} · ${r.severity}`,
  fields: [
    { key: 'code', label: 'Code', type: 'text', required: true, table: true },
    { key: 'name', label: 'Defect', type: 'text', required: true, table: true },
    { key: 'category', label: 'Category', type: 'select', options: opt('dimensional', 'surface', 'material', 'functional', 'packaging'), required: true, table: true },
    { key: 'severity', label: 'Severity', type: 'select', options: opt('critical', 'major', 'minor'), required: true, table: true },
  ],
  searchKeys: ['code', 'name'], filterKeys: ['category', 'severity'],
};

// ─── Sales ───
const rfqs: EntityDef = {
  table: 'rfqs', module: 'sales', label: 'RFQ', plural: 'RFQs', numberPrefix: 'RFQ', titleKey: 'number',
  subtitle: (r, ref) => `${ref('customers', r.customer_id)} · ${ref('materials', r.product_id)}`,
  statuses: [st('new', 'blue'), st('under_review', 'amber'), st('quoted', 'green'), st('won', 'green'), st('lost', 'grey'), st('cancelled', 'grey')],
  initialStatus: 'new',
  transitions: [
    { to: 'under_review', from: ['new'], label: 'Start review', action: 'edit', tone: 'primary' },
    { to: 'won', from: ['quoted'], label: 'Mark won', action: 'edit', tone: 'primary' },
    { to: 'lost', from: ['new', 'under_review', 'quoted'], label: 'Mark lost', action: 'edit', requireComment: true },
    { to: 'cancelled', from: ['new', 'under_review'], label: 'Cancel', action: 'edit', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'RFQ no.', type: 'text', form: false, table: true },
    { key: 'customer_id', label: 'Customer', type: 'ref', ref: 'customers', required: true, table: true },
    { key: 'customer_ref', label: 'Customer reference', type: 'text' },
    { key: 'received_date', label: 'Received', type: 'date', required: true, default: today, table: true },
    { key: 'product_id', label: 'Product', type: 'ref', ref: 'materials', refWhere: { type: ['fg'] }, required: true, table: true },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true, min: 1, table: true },
    { key: 'target_price', label: 'Target price / unit', type: 'currency', min: 0 },
    { key: 'required_by', label: 'Required by', type: 'date', table: true },
    { key: 'specification', label: 'Specification', type: 'textarea', wide: true },
    { key: 'source', label: 'Source', type: 'select', options: opt('email', 'portal', 'phone', 'document_upload', 'walk_in'), default: 'email' },
  ],
  searchKeys: ['number', 'customer_ref', 'specification'], filterKeys: ['status', 'customer_id'],
  defaultSort: { key: 'received_date', dir: 'desc' }, attachments: true,
  editableIn: ['new', 'under_review'], deletableIn: ['new'],
  validate: dateOrder('received_date', 'required_by', 'Required-by date cannot be before the received date'),
};

const quotations: EntityDef = {
  table: 'quotations', module: 'sales', label: 'Quotation', plural: 'Quotations', numberPrefix: 'QT', titleKey: 'number',
  subtitle: (r, ref) => ref('customers', r.customer_id),
  statuses: [
    st('draft', 'grey'), st('pending_approval', 'amber', 'Pending approval'), st('approved', 'blue'),
    st('sent', 'blue'), st('accepted', 'green'), st('rejected', 'red'), st('converted', 'green', 'Converted to SO'),
  ],
  initialStatus: 'draft',
  transitions: [
    { to: 'pending_approval', from: ['draft'], label: 'Submit for approval', action: 'edit', tone: 'primary' },
    { to: 'approved', from: ['pending_approval'], label: 'Approve', action: 'approve', tone: 'primary' },
    { to: 'draft', from: ['pending_approval'], label: 'Send back', action: 'approve', requireComment: true },
    { to: 'sent', from: ['approved'], label: 'Mark sent to customer', action: 'edit', tone: 'primary' },
    { to: 'accepted', from: ['sent'], label: 'Customer accepted', action: 'edit', tone: 'primary' },
    { to: 'rejected', from: ['sent', 'pending_approval'], label: 'Reject', action: 'edit', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'Quotation no.', type: 'text', form: false, table: true },
    { key: 'rfq_id', label: 'RFQ', type: 'ref', ref: 'rfqs' },
    { key: 'customer_id', label: 'Customer', type: 'ref', ref: 'customers', required: true, table: true },
    { key: 'quote_date', label: 'Date', type: 'date', required: true, default: today, table: true },
    { key: 'valid_until', label: 'Valid until', type: 'date', required: true },
    { key: 'lines', label: 'Items', type: 'lines', required: true, wide: true, lineFields: materialLine({ type: ['fg'] }) },
    { key: 'material_cost', label: 'Material cost (costing)', type: 'currency', min: 0, help: 'Bill-of-material cost for the whole quote.' },
    { key: 'conversion_cost', label: 'Conversion cost', type: 'currency', min: 0, help: 'Labour + machine + overhead.' },
    { key: 'tax_pct', label: 'GST %', type: 'percent', min: 0, max: 28, default: 18 },
    { key: 'subtotal', label: 'Subtotal', type: 'currency', readOnly: true },
    { key: 'tax_amount', label: 'Tax', type: 'currency', readOnly: true },
    { key: 'total', label: 'Total', type: 'currency', readOnly: true, table: true },
    { key: 'margin_pct', label: 'Margin %', type: 'percent', readOnly: true, table: true },
    { key: 'terms', label: 'Terms', type: 'textarea', wide: true },
  ],
  compute: (v) => {
    const t = linesTotals()(v);
    const cost = (Number(v.material_cost) || 0) + (Number(v.conversion_cost) || 0);
    return { ...t, margin_pct: t.subtotal > 0 && cost > 0 ? round2(((t.subtotal - cost) / t.subtotal) * 100) : null };
  },
  searchKeys: ['number'], filterKeys: ['status', 'customer_id'], amountKey: 'total',
  defaultSort: { key: 'quote_date', dir: 'desc' }, editableIn: ['draft'], deletableIn: ['draft'], attachments: true,
  validate: dateOrder('quote_date', 'valid_until', 'Validity must be after the quotation date'),
};

const salesOrders: EntityDef = {
  table: 'sales_orders', module: 'sales', label: 'Sales order', plural: 'Sales orders', numberPrefix: 'SO', titleKey: 'number',
  subtitle: (r, ref) => ref('customers', r.customer_id),
  statuses: [
    st('confirmed', 'blue'), st('in_production', 'amber', 'In production'), st('ready_to_dispatch', 'blue', 'Ready to dispatch'),
    st('dispatched', 'blue'), st('delivered', 'green'), st('closed', 'grey'), st('cancelled', 'grey'),
  ],
  initialStatus: 'confirmed',
  transitions: [
    { to: 'in_production', from: ['confirmed'], label: 'Start production', action: 'edit', tone: 'primary' },
    { to: 'ready_to_dispatch', from: ['confirmed', 'in_production'], label: 'Ready to dispatch', action: 'edit', tone: 'primary' },
    { to: 'closed', from: ['delivered'], label: 'Close', action: 'edit' },
    { to: 'cancelled', from: ['confirmed', 'in_production'], label: 'Cancel order', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'SO no.', type: 'text', form: false, table: true },
    { key: 'customer_id', label: 'Customer', type: 'ref', ref: 'customers', required: true, table: true },
    { key: 'quotation_id', label: 'Quotation', type: 'ref', ref: 'quotations' },
    { key: 'customer_po', label: 'Customer PO no.', type: 'text' },
    { key: 'order_date', label: 'Order date', type: 'date', required: true, default: today, table: true },
    { key: 'delivery_date', label: 'Delivery date', type: 'date', required: true, table: true },
    { key: 'lines', label: 'Items', type: 'lines', required: true, wide: true, lineFields: materialLine({ type: ['fg'] }) },
    { key: 'tax_pct', label: 'GST %', type: 'percent', min: 0, max: 28, default: 18 },
    { key: 'subtotal', label: 'Subtotal', type: 'currency', readOnly: true },
    { key: 'tax_amount', label: 'Tax', type: 'currency', readOnly: true },
    { key: 'total', label: 'Total', type: 'currency', readOnly: true, table: true },
    { key: 'shipping_address', label: 'Shipping address', type: 'textarea', wide: true },
  ],
  compute: linesTotals(),
  searchKeys: ['number', 'customer_po'], filterKeys: ['status', 'customer_id'], amountKey: 'total',
  defaultSort: { key: 'order_date', dir: 'desc' }, editableIn: ['confirmed'], deletableIn: [], attachments: true,
  validate: dateOrder('order_date', 'delivery_date', 'Delivery date must be on or after the order date'),
};

// ─── Procurement ───
const purchaseRequisitions: EntityDef = {
  table: 'purchase_requisitions', module: 'procurement', label: 'Purchase requisition', plural: 'Purchase requisitions & material requests',
  numberPrefix: 'PR', titleKey: 'number',
  subtitle: (r, ref) => `${ref('materials', r.material_id)} · ${r.qty}`,
  statuses: [st('draft', 'grey'), st('submitted', 'amber'), st('approved', 'blue'), st('rejected', 'red'), st('ordered', 'green', 'PO raised')],
  initialStatus: 'submitted',
  transitions: [
    { to: 'submitted', from: ['draft', 'rejected'], label: 'Submit', action: 'edit', tone: 'primary' },
    { to: 'approved', from: ['submitted'], label: 'Approve', action: 'approve', tone: 'primary' },
    { to: 'rejected', from: ['submitted'], label: 'Reject', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'PR no.', type: 'text', form: false, table: true },
    { key: 'request_type', label: 'Type', type: 'select', options: [{ value: 'purchase', label: 'Purchase requisition' }, { value: 'material_request', label: 'Material request (from stores)' }], default: 'purchase', required: true, table: true },
    { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', required: true, table: true },
    { key: 'qty', label: 'Quantity', type: 'number', required: true, min: 0.001, table: true },
    { key: 'estimated_rate', label: 'Estimated rate', type: 'currency', min: 0 },
    { key: 'required_by', label: 'Required by', type: 'date', required: true, table: true },
    { key: 'factory_id', label: 'Factory', type: 'ref', ref: 'factories' },
    { key: 'priority', label: 'Priority', type: 'select', options: opt('urgent', 'high', 'normal', 'low'), default: 'normal', table: true },
    { key: 'source', label: 'Source', type: 'select', options: opt('manual', 'reorder', 'production', 'maintenance'), default: 'manual' },
    { key: 'reason', label: 'Justification', type: 'textarea', wide: true, required: true },
    { key: 'estimated_value', label: 'Estimated value', type: 'currency', readOnly: true },
  ],
  compute: (v) => ({ estimated_value: round2((Number(v.qty) || 0) * (Number(v.estimated_rate) || 0)) }),
  searchKeys: ['number', 'reason'], filterKeys: ['status', 'priority', 'request_type'], amountKey: 'estimated_value',
  defaultSort: { key: 'created_at', dir: 'desc' }, editableIn: ['draft', 'submitted', 'rejected'], deletableIn: ['draft'],
};

const supplierQuotations: EntityDef = {
  table: 'supplier_quotations', module: 'procurement', label: 'Supplier quotation', plural: 'Supplier quotations', numberPrefix: 'SQ', titleKey: 'number',
  subtitle: (r, ref) => `${ref('suppliers', r.supplier_id)} · ${ref('materials', r.material_id)}`,
  statuses: [st('received', 'blue'), st('selected', 'green'), st('not_selected', 'grey', 'Not selected')],
  initialStatus: 'received',
  fields: [
    { key: 'number', label: 'SQ no.', type: 'text', form: false, table: true },
    { key: 'requisition_id', label: 'Requisition', type: 'ref', ref: 'purchase_requisitions', required: true, table: true },
    { key: 'supplier_id', label: 'Supplier', type: 'ref', ref: 'suppliers', required: true, table: true },
    { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', required: true },
    { key: 'rate', label: 'Quoted rate', type: 'currency', required: true, min: 0, table: true },
    { key: 'lead_time_days', label: 'Lead time (days)', type: 'number', min: 0, required: true, table: true },
    { key: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', min: 0 },
    { key: 'valid_until', label: 'Valid until', type: 'date' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
  ],
  searchKeys: ['number', 'remarks'], filterKeys: ['requisition_id', 'supplier_id', 'status'], attachments: true,
  editableIn: ['received'], deletableIn: ['received'],
};

const purchaseOrders: EntityDef = {
  table: 'purchase_orders', module: 'procurement', label: 'Purchase order', plural: 'Purchase orders', numberPrefix: 'PO', titleKey: 'number',
  subtitle: (r, ref) => ref('suppliers', r.supplier_id),
  statuses: [
    st('draft', 'grey'), st('pending_approval', 'amber', 'Pending approval'), st('approved', 'blue'), st('sent', 'blue', 'Sent to supplier'),
    st('partially_received', 'amber', 'Partially received'), st('received', 'green'), st('closed', 'grey'), st('cancelled', 'grey'),
  ],
  initialStatus: 'draft',
  transitions: [
    { to: 'pending_approval', from: ['draft'], label: 'Submit for approval', action: 'edit', tone: 'primary' },
    { to: 'approved', from: ['pending_approval'], label: 'Approve', action: 'approve', tone: 'primary' },
    { to: 'draft', from: ['pending_approval'], label: 'Send back', action: 'approve', requireComment: true },
    { to: 'sent', from: ['approved'], label: 'Mark sent to supplier', action: 'edit', tone: 'primary' },
    { to: 'closed', from: ['received', 'partially_received'], label: 'Close PO', action: 'edit', requireComment: true },
    { to: 'cancelled', from: ['draft', 'pending_approval', 'approved', 'sent'], label: 'Cancel PO', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'PO no.', type: 'text', form: false, table: true },
    { key: 'supplier_id', label: 'Supplier', type: 'ref', ref: 'suppliers', required: true, table: true },
    { key: 'requisition_id', label: 'Requisition', type: 'ref', ref: 'purchase_requisitions' },
    { key: 'po_date', label: 'PO date', type: 'date', required: true, default: today, table: true },
    { key: 'expected_date', label: 'Expected delivery', type: 'date', required: true, table: true },
    { key: 'delivery_warehouse_id', label: 'Deliver to', type: 'ref', ref: 'warehouses', required: true },
    { key: 'lines', label: 'Items', type: 'lines', required: true, wide: true, lineFields: materialLine() },
    { key: 'tax_pct', label: 'GST %', type: 'percent', min: 0, max: 28, default: 18 },
    { key: 'subtotal', label: 'Subtotal', type: 'currency', readOnly: true },
    { key: 'tax_amount', label: 'Tax', type: 'currency', readOnly: true },
    { key: 'total', label: 'Total', type: 'currency', readOnly: true, table: true },
    { key: 'payment_terms_days', label: 'Payment terms (days)', type: 'number', min: 0, default: 30 },
    { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
  ],
  compute: linesTotals(),
  searchKeys: ['number', 'notes'], filterKeys: ['status', 'supplier_id'], amountKey: 'total',
  defaultSort: { key: 'po_date', dir: 'desc' }, editableIn: ['draft'], deletableIn: ['draft'], attachments: true,
  validate: dateOrder('po_date', 'expected_date', 'Expected date must be on or after the PO date'),
};

const grns: EntityDef = {
  table: 'grns', module: 'inventory', label: 'Goods receipt note', plural: 'Goods receipt notes (GRN)', numberPrefix: 'GRN', titleKey: 'number',
  subtitle: (r, ref) => `${ref('purchase_orders', r.po_id)} · ${ref('suppliers', r.supplier_id)}`,
  statuses: [st('draft', 'grey'), st('posted', 'green'), st('cancelled', 'grey')],
  initialStatus: 'draft',
  transitions: [
    { to: 'posted', from: ['draft'], label: 'Post GRN to stock', action: 'edit', tone: 'primary' },
    { to: 'cancelled', from: ['draft'], label: 'Cancel', action: 'edit', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'GRN no.', type: 'text', form: false, table: true },
    { key: 'po_id', label: 'Purchase order', type: 'ref', ref: 'purchase_orders', required: true, table: true, refWhere: { status: ['approved', 'sent', 'partially_received'] } },
    { key: 'supplier_id', label: 'Supplier', type: 'ref', ref: 'suppliers', required: true, table: true },
    { key: 'received_date', label: 'Received on', type: 'date', required: true, default: today, table: true },
    { key: 'warehouse_id', label: 'Warehouse', type: 'ref', ref: 'warehouses', required: true },
    { key: 'supplier_challan_no', label: 'Supplier challan / DC no.', type: 'text' },
    { key: 'vehicle_no', label: 'Vehicle no.', type: 'text' },
    { key: 'lines', label: 'Received items', type: 'lines', required: true, wide: true, lineFields: [
      { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', required: true },
      { key: 'qty', label: 'Received', type: 'number', required: true, min: 0.001 },
      { key: 'rejected_qty', label: 'Rejected', type: 'number', min: 0, default: 0 },
      { key: 'rate', label: 'PO rate', type: 'currency', min: 0 },
      { key: 'batch_no', label: 'Batch / lot', type: 'text' },
    ] },
    { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
  ],
  searchKeys: ['number', 'supplier_challan_no', 'vehicle_no'], filterKeys: ['status', 'supplier_id'],
  defaultSort: { key: 'received_date', dir: 'desc' }, editableIn: ['draft'], deletableIn: ['draft'], attachments: true,
  validate: (v) => {
    const bad = Array.isArray(v.lines) && v.lines.some((l) => Number(l?.rejected_qty) > Number(l?.qty));
    return bad ? { lines: 'Rejected quantity cannot exceed received quantity' } : {};
  },
};

// ─── AP ───
const invoices: EntityDef = {
  table: 'invoices', module: 'ap', label: 'Supplier invoice', plural: 'Supplier invoices', numberPrefix: 'BILL', titleKey: 'invoice_no',
  subtitle: (r, ref) => ref('suppliers', r.supplier_id),
  statuses: [
    st('received', 'grey'), st('matched', 'green'), st('exception', 'amber'), st('pending_approval', 'blue', 'Pending approval'),
    st('approved', 'blue'), st('on_hold', 'amber', 'On hold'), st('partially_paid', 'amber', 'Partially paid'),
    st('paid', 'green'), st('rejected', 'red'),
  ],
  initialStatus: 'received',
  transitions: [
    { to: 'pending_approval', from: ['matched'], label: 'Send for approval', action: 'edit', tone: 'primary' },
    { to: 'pending_approval', from: ['exception'], label: 'Override & send for approval', action: 'edit', requireComment: true },
    { to: 'approved', from: ['pending_approval'], label: 'Approve for payment', action: 'approve', tone: 'primary' },
    { to: 'on_hold', from: ['received', 'matched', 'exception', 'pending_approval'], label: 'Hold', action: 'edit', requireComment: true },
    { to: 'exception', from: ['on_hold'], label: 'Release hold', action: 'edit' },
    { to: 'rejected', from: ['received', 'matched', 'exception', 'pending_approval', 'on_hold'], label: 'Reject invoice', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'Internal no.', type: 'text', form: false },
    { key: 'invoice_no', label: 'Supplier invoice no.', type: 'text', required: true, table: true },
    { key: 'supplier_id', label: 'Supplier', type: 'ref', ref: 'suppliers', required: true, table: true },
    { key: 'invoice_date', label: 'Invoice date', type: 'date', required: true, table: true },
    { key: 'due_date', label: 'Due date', type: 'date', required: true, table: true },
    { key: 'po_id', label: 'PO reference', type: 'ref', ref: 'purchase_orders' },
    { key: 'grn_id', label: 'GRN reference', type: 'ref', ref: 'grns' },
    { key: 'lines', label: 'Invoice lines', type: 'lines', required: true, wide: true, lineFields: materialLine() },
    { key: 'tax_pct', label: 'GST %', type: 'percent', min: 0, max: 28, default: 18 },
    { key: 'subtotal', label: 'Subtotal', type: 'currency', readOnly: true },
    { key: 'tax_amount', label: 'Tax', type: 'currency', readOnly: true },
    { key: 'total', label: 'Total', type: 'currency', readOnly: true, table: true },
    { key: 'paid_amount', label: 'Paid', type: 'currency', form: false },
    { key: 'match_status', label: 'Match', type: 'select', form: false, options: opt('unmatched', 'matched', 'exception'), table: true },
    { key: 'extraction_confidence', label: 'Extraction confidence %', type: 'percent', form: false },
  ],
  compute: linesTotals(),
  searchKeys: ['invoice_no', 'number'], filterKeys: ['status', 'supplier_id', 'match_status'], amountKey: 'total',
  defaultSort: { key: 'invoice_date', dir: 'desc' }, editableIn: ['received', 'exception', 'on_hold'], deletableIn: ['received'], attachments: true,
  validate: dateOrder('invoice_date', 'due_date', 'Due date cannot be before the invoice date'),
};

const payments: EntityDef = {
  table: 'payments', module: 'ap', label: 'Payment', plural: 'Payments', numberPrefix: 'PAY', titleKey: 'number',
  subtitle: (r, ref) => `${ref('invoices', r.invoice_id)} · ${r.mode}`,
  immutable: true,
  fields: [
    { key: 'number', label: 'Payment no.', type: 'text', form: false, table: true },
    { key: 'invoice_id', label: 'Invoice', type: 'ref', ref: 'invoices', required: true, table: true, refWhere: { status: ['approved', 'partially_paid'] } },
    { key: 'payment_date', label: 'Date', type: 'date', required: true, default: today, table: true },
    { key: 'amount', label: 'Amount', type: 'currency', required: true, min: 0.01, table: true },
    { key: 'mode', label: 'Mode', type: 'select', options: opt('neft', 'rtgs', 'imps', 'cheque', 'upi'), required: true, table: true },
    { key: 'reference_no', label: 'UTR / cheque no.', type: 'text', required: true, table: true },
  ],
  searchKeys: ['number', 'reference_no'], defaultSort: { key: 'payment_date', dir: 'desc' },
};

// ─── Production ───
const productionOrders: EntityDef = {
  table: 'production_orders', module: 'production', label: 'Production order', plural: 'Production orders', numberPrefix: 'PRD', titleKey: 'number',
  subtitle: (r, ref) => `${ref('materials', r.product_id)} · ${ref('production_lines', r.line_id)}`,
  statuses: [st('planned', 'grey'), st('released', 'blue'), st('in_progress', 'amber', 'In progress'), st('completed', 'green'), st('closed', 'grey'), st('cancelled', 'grey')],
  initialStatus: 'planned',
  transitions: [
    { to: 'released', from: ['planned'], label: 'Release to floor', action: 'edit', tone: 'primary' },
    { to: 'in_progress', from: ['released'], label: 'Start', action: 'edit', tone: 'primary' },
    { to: 'completed', from: ['in_progress'], label: 'Complete', action: 'edit', tone: 'primary' },
    { to: 'closed', from: ['completed'], label: 'Close', action: 'approve' },
    { to: 'cancelled', from: ['planned', 'released'], label: 'Cancel', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'Order no.', type: 'text', form: false, table: true },
    { key: 'product_id', label: 'Product', type: 'ref', ref: 'materials', refWhere: { type: ['fg', 'wip'] }, required: true, table: true },
    { key: 'sales_order_id', label: 'Sales order', type: 'ref', ref: 'sales_orders' },
    { key: 'line_id', label: 'Line', type: 'ref', ref: 'production_lines', required: true, table: true },
    { key: 'machine_id', label: 'Primary machine', type: 'ref', ref: 'machines' },
    { key: 'planned_qty', label: 'Planned qty', type: 'number', required: true, min: 1, table: true },
    { key: 'produced_qty', label: 'Good output', type: 'number', form: false, table: true },
    { key: 'rejected_qty', label: 'Rejected / scrap', type: 'number', form: false },
    { key: 'planned_start', label: 'Planned start', type: 'date', required: true, default: today, table: true },
    { key: 'planned_end', label: 'Planned end', type: 'date', required: true, table: true },
    { key: 'output_warehouse_id', label: 'Post output to', type: 'ref', ref: 'warehouses', help: 'Good output from shift reports is booked into this warehouse.' },
    { key: 'priority', label: 'Priority', type: 'select', options: opt('high', 'normal', 'low'), default: 'normal' },
    { key: 'notes', label: 'Notes', type: 'textarea', wide: true },
  ],
  searchKeys: ['number', 'notes'], filterKeys: ['status', 'line_id', 'product_id'],
  defaultSort: { key: 'planned_start', dir: 'desc' }, editableIn: ['planned', 'released'], deletableIn: ['planned'],
  validate: dateOrder('planned_start', 'planned_end', 'End must be on or after start'),
};

const shiftReports: EntityDef = {
  table: 'shift_reports', module: 'production', label: 'Shift report', plural: 'Shift production reports', numberPrefix: 'SR', titleKey: 'number',
  subtitle: (r, ref) => `${r.report_date} · ${ref('shifts', r.shift_id)} · ${ref('machines', r.machine_id)}`,
  statuses: [st('submitted', 'blue'), st('verified', 'green')],
  initialStatus: 'submitted',
  transitions: [{ to: 'verified', from: ['submitted'], label: 'Verify', action: 'edit', tone: 'primary' }],
  fields: [
    { key: 'number', label: 'Report no.', type: 'text', form: false, table: true },
    { key: 'report_date', label: 'Date', type: 'date', required: true, default: today, table: true },
    { key: 'shift_id', label: 'Shift', type: 'ref', ref: 'shifts', required: true, table: true },
    { key: 'line_id', label: 'Line', type: 'ref', ref: 'production_lines', required: true },
    { key: 'machine_id', label: 'Machine', type: 'ref', ref: 'machines', required: true, table: true },
    { key: 'production_order_id', label: 'Production order', type: 'ref', ref: 'production_orders', refWhere: { status: ['released', 'in_progress'] } },
    { key: 'product_id', label: 'Product', type: 'ref', ref: 'materials', refWhere: { type: ['fg', 'wip'] } },
    { key: 'operator_id', label: 'Operator', type: 'ref', ref: 'employees', refWhere: { skill: ['operator', 'supervisor'] } },
    { key: 'target_qty', label: 'Target', type: 'number', required: true, min: 0, table: true },
    { key: 'actual_qty', label: 'Actual output (incl. rejects)', type: 'number', required: true, min: 0, table: true },
    { key: 'rejected_qty', label: 'Rejected', type: 'number', required: true, min: 0, default: 0, table: true },
    { key: 'planned_minutes', label: 'Planned minutes', type: 'number', required: true, min: 1, max: 1440, default: 480 },
    { key: 'downtime_minutes', label: 'Downtime (min)', type: 'number', required: true, min: 0, default: 0, table: true },
    { key: 'downtime_reason', label: 'Downtime reason', type: 'select', options: opt('none', 'breakdown', 'changeover', 'material_shortage', 'power_failure', 'quality_issue', 'no_operator', 'planned_maintenance', 'other'), default: 'none' },
    { key: 'comments', label: 'Comments', type: 'textarea', wide: true },
  ],
  searchKeys: ['number', 'comments'], filterKeys: ['shift_id', 'line_id', 'machine_id', 'status'],
  defaultSort: { key: 'report_date', dir: 'desc' }, editableIn: ['submitted'], deletableIn: [], attachments: true,
  validate: (v) => {
    const e: Record<string, string> = {};
    if (Number(v.rejected_qty) > Number(v.actual_qty)) e.rejected_qty = 'Rejected cannot exceed actual output';
    if (Number(v.downtime_minutes) > Number(v.planned_minutes)) e.downtime_minutes = 'Downtime cannot exceed planned minutes';
    if (Number(v.downtime_minutes) > 0 && (!v.downtime_reason || v.downtime_reason === 'none')) e.downtime_reason = 'Select a downtime reason';
    return e;
  },
};

// ─── Inventory ───
const stockMovements: EntityDef = {
  table: 'stock_movements', module: 'inventory', label: 'Stock movement', plural: 'Stock movements', numberPrefix: 'MV', titleKey: 'number',
  subtitle: (r, ref) => `${String(r.movement_type).toUpperCase()} · ${ref('materials', r.material_id)} · ${r.qty}`,
  immutable: true,
  fields: [
    { key: 'number', label: 'Movement no.', type: 'text', form: false, table: true },
    { key: 'movement_type', label: 'Type', type: 'select', required: true, table: true, options: [
      { value: 'in', label: 'Stock IN' }, { value: 'out', label: 'Stock OUT / issue' },
      { value: 'transfer', label: 'Transfer' }, { value: 'adjust', label: 'Adjustment (+/−)' },
    ] },
    { key: 'movement_date', label: 'Date', type: 'date', required: true, default: today, table: true },
    { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', required: true, table: true, scannable: true },
    { key: 'warehouse_id', label: 'Warehouse', type: 'ref', ref: 'warehouses', required: true, table: true },
    { key: 'bin_id', label: 'Bin', type: 'ref', ref: 'bins' },
    { key: 'to_warehouse_id', label: 'To warehouse (transfer)', type: 'ref', ref: 'warehouses' },
    { key: 'batch_no', label: 'Batch / lot', type: 'text' },
    { key: 'qty', label: 'Quantity', type: 'number', required: true, table: true, help: 'Adjustments may be negative. All other types must be positive.' },
    { key: 'unit_cost', label: 'Unit cost', type: 'currency', min: 0 },
    { key: 'reason', label: 'Reason', type: 'select', required: true, table: true, options: opt(
      'purchase_receipt', 'production_issue', 'production_output', 'maintenance_issue', 'sales_dispatch',
      'customer_return', 'supplier_return', 'inter_warehouse', 'stock_audit', 'damage', 'opening_balance', 'other',
    ) },
    { key: 'reference', label: 'Reference doc', type: 'text' },
  ],
  searchKeys: ['number', 'reference', 'batch_no'], filterKeys: ['movement_type', 'warehouse_id', 'reason'],
  defaultSort: { key: 'created_at', dir: 'desc' }, attachments: true,
  validate: (v) => {
    const e: Record<string, string> = {};
    const q = Number(v.qty);
    if (!q) e.qty = 'Quantity cannot be zero';
    else if (v.movement_type !== 'adjust' && q < 0) e.qty = 'Quantity must be positive';
    if (v.movement_type === 'transfer') {
      if (!v.to_warehouse_id) e.to_warehouse_id = 'Select destination warehouse';
      else if (v.to_warehouse_id === v.warehouse_id) e.to_warehouse_id = 'Destination must differ from source';
    }
    return e;
  },
};

const stockBalances: EntityDef = {
  table: 'stock_balances', module: 'inventory', label: 'Stock balance', plural: 'Stock on hand', titleKey: 'material_id',
  immutable: true,
  fields: [
    { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', table: true },
    { key: 'warehouse_id', label: 'Warehouse', type: 'ref', ref: 'warehouses', table: true },
    { key: 'bin_id', label: 'Bin', type: 'ref', ref: 'bins', table: true },
    { key: 'batch_no', label: 'Batch', type: 'text', table: true },
    { key: 'qty', label: 'On hand', type: 'number', table: true },
  ],
  searchKeys: ['batch_no'], filterKeys: ['warehouse_id'],
};

const reservations: EntityDef = {
  table: 'reservations', module: 'inventory', label: 'Reservation', plural: 'Material reservations', numberPrefix: 'RES', titleKey: 'number',
  subtitle: (r, ref) => `${ref('materials', r.material_id)} · ${r.qty}`,
  statuses: [st('active', 'blue'), st('issued', 'green'), st('released', 'grey')],
  initialStatus: 'active',
  transitions: [
    { to: 'issued', from: ['active'], label: 'Mark issued', action: 'edit', tone: 'primary' },
    { to: 'released', from: ['active'], label: 'Release', action: 'edit' },
  ],
  fields: [
    { key: 'number', label: 'No.', type: 'text', form: false, table: true },
    { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', required: true, table: true },
    { key: 'warehouse_id', label: 'Warehouse', type: 'ref', ref: 'warehouses', required: true, table: true },
    { key: 'qty', label: 'Qty', type: 'number', required: true, min: 0.001, table: true },
    { key: 'production_order_id', label: 'For production order', type: 'ref', ref: 'production_orders', table: true },
    { key: 'required_date', label: 'Required on', type: 'date', required: true },
  ],
  searchKeys: ['number'], filterKeys: ['status', 'warehouse_id'], editableIn: ['active'], deletableIn: ['active'],
};

const stockAudits: EntityDef = {
  table: 'stock_audits', module: 'inventory', label: 'Stock count', plural: 'Stock audits / cycle counts', numberPrefix: 'SA', titleKey: 'number',
  subtitle: (r, ref) => `${ref('materials', r.material_id)} · ${ref('warehouses', r.warehouse_id)}`,
  statuses: [st('counted', 'amber'), st('approved', 'green', 'Approved & adjusted'), st('rejected', 'red', 'Recount required')],
  initialStatus: 'counted',
  transitions: [
    { to: 'approved', from: ['counted'], label: 'Approve & post adjustment', action: 'approve', tone: 'primary' },
    { to: 'rejected', from: ['counted'], label: 'Reject (recount)', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'Count no.', type: 'text', form: false, table: true },
    { key: 'count_date', label: 'Count date', type: 'date', required: true, default: today, table: true },
    { key: 'warehouse_id', label: 'Warehouse', type: 'ref', ref: 'warehouses', required: true, table: true },
    { key: 'material_id', label: 'Material', type: 'ref', ref: 'materials', required: true, table: true, scannable: true },
    { key: 'batch_no', label: 'Batch', type: 'text' },
    { key: 'system_qty', label: 'System qty', type: 'number', form: false, table: true },
    { key: 'counted_qty', label: 'Physical count', type: 'number', required: true, min: 0, table: true },
    { key: 'variance_qty', label: 'Variance', type: 'number', form: false, table: true },
    { key: 'remarks', label: 'Remarks', type: 'textarea', wide: true },
  ],
  searchKeys: ['number'], filterKeys: ['status', 'warehouse_id'], editableIn: ['counted', 'rejected'], deletableIn: ['counted'],
};

// ─── Quality ───
const inspections: EntityDef = {
  table: 'inspections', module: 'quality', label: 'Inspection', plural: 'Inspections', numberPrefix: 'INS', titleKey: 'number',
  subtitle: (r, ref) => `${String(r.stage).replace('_', '-')} · ${ref('materials', r.material_id)}`,
  statuses: [
    st('requested', 'grey'), st('in_progress', 'amber', 'In progress'), st('passed', 'green'),
    st('conditional', 'amber', 'Accepted with deviation'), st('failed', 'red'),
  ],
  initialStatus: 'requested',
  transitions: [
    { to: 'in_progress', from: ['requested'], label: 'Start inspection', action: 'edit', tone: 'primary' },
    { to: 'passed', from: ['in_progress', 'requested'], label: 'Approve (pass)', action: 'approve', tone: 'primary' },
    { to: 'conditional', from: ['in_progress', 'requested'], label: 'Accept with deviation', action: 'approve', requireComment: true },
    { to: 'failed', from: ['in_progress', 'requested'], label: 'Reject (fail)', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'Inspection no.', type: 'text', form: false, table: true },
    { key: 'stage', label: 'Stage', type: 'select', required: true, table: true, options: [
      { value: 'incoming', label: 'Incoming material' }, { value: 'in_process', label: 'In-process' }, { value: 'final', label: 'Finished goods' },
    ] },
    { key: 'inspection_date', label: 'Date', type: 'date', required: true, default: today, table: true },
    { key: 'material_id', label: 'Material / product', type: 'ref', ref: 'materials', required: true, table: true },
    { key: 'supplier_id', label: 'Supplier (incoming)', type: 'ref', ref: 'suppliers' },
    { key: 'grn_id', label: 'GRN', type: 'ref', ref: 'grns' },
    { key: 'production_order_id', label: 'Production order', type: 'ref', ref: 'production_orders' },
    { key: 'batch_no', label: 'Batch / lot', type: 'text', table: true },
    { key: 'lot_qty', label: 'Lot quantity', type: 'number', required: true, min: 0, table: true },
    { key: 'sample_size', label: 'Sample size', type: 'number', min: 0 },
    { key: 'accepted_qty', label: 'Accepted', type: 'number', min: 0, default: 0 },
    { key: 'rejected_qty', label: 'Rejected', type: 'number', min: 0, default: 0, table: true },
    { key: 'defect_code_id', label: 'Primary defect', type: 'ref', ref: 'defect_codes' },
    { key: 'inspector_id', label: 'Inspector', type: 'ref', ref: 'employees', refWhere: { skill: ['inspector'] } },
    { key: 'findings', label: 'Findings', type: 'textarea', wide: true },
  ],
  searchKeys: ['number', 'batch_no', 'findings'], filterKeys: ['stage', 'status', 'material_id', 'supplier_id'],
  defaultSort: { key: 'inspection_date', dir: 'desc' }, editableIn: ['requested', 'in_progress'], deletableIn: ['requested'], attachments: true,
  validate: (v) =>
    Number(v.accepted_qty) + Number(v.rejected_qty) > Number(v.lot_qty)
      ? { rejected_qty: 'Accepted + rejected cannot exceed lot quantity' } : {},
};

const ncrs: EntityDef = {
  table: 'ncrs', module: 'quality', label: 'Non-conformance report', plural: 'Non-conformance reports (NCR)', numberPrefix: 'NCR', titleKey: 'number',
  subtitle: (r, ref) => ref('materials', r.material_id),
  statuses: [st('open', 'red'), st('investigating', 'amber'), st('dispositioned', 'blue'), st('closed', 'green')],
  initialStatus: 'open',
  transitions: [
    { to: 'investigating', from: ['open'], label: 'Start investigation', action: 'edit', tone: 'primary' },
    { to: 'dispositioned', from: ['investigating'], label: 'Record disposition', action: 'edit', tone: 'primary' },
    { to: 'closed', from: ['dispositioned'], label: 'Close NCR', action: 'approve', tone: 'primary' },
  ],
  fields: [
    { key: 'number', label: 'NCR no.', type: 'text', form: false, table: true },
    { key: 'inspection_id', label: 'Inspection', type: 'ref', ref: 'inspections' },
    { key: 'material_id', label: 'Material / product', type: 'ref', ref: 'materials', required: true, table: true },
    { key: 'supplier_id', label: 'Supplier', type: 'ref', ref: 'suppliers' },
    { key: 'qty_affected', label: 'Qty affected', type: 'number', min: 0, required: true, table: true },
    { key: 'severity', label: 'Severity', type: 'select', options: opt('critical', 'major', 'minor'), required: true, table: true },
    { key: 'disposition', label: 'Disposition', type: 'select', options: opt('pending', 'rework', 'scrap', 'use_as_is', 'return_to_supplier'), default: 'pending', table: true },
    { key: 'description', label: 'Description', type: 'textarea', required: true, wide: true },
  ],
  searchKeys: ['number', 'description'], filterKeys: ['status', 'severity'], attachments: true,
  defaultSort: { key: 'created_at', dir: 'desc' }, editableIn: ['open', 'investigating'], deletableIn: ['open'],
};

const capas: EntityDef = {
  table: 'capas', module: 'quality', label: 'CAPA', plural: 'Corrective & preventive actions', numberPrefix: 'CAPA', titleKey: 'number',
  subtitle: (r, ref) => ref('ncrs', r.ncr_id),
  statuses: [st('open', 'red'), st('in_progress', 'amber', 'In progress'), st('verified', 'blue'), st('closed', 'green')],
  initialStatus: 'open',
  transitions: [
    { to: 'in_progress', from: ['open'], label: 'Start', action: 'edit', tone: 'primary' },
    { to: 'verified', from: ['in_progress'], label: 'Verify effectiveness', action: 'approve', tone: 'primary' },
    { to: 'closed', from: ['verified'], label: 'Close', action: 'approve' },
  ],
  fields: [
    { key: 'number', label: 'CAPA no.', type: 'text', form: false, table: true },
    { key: 'ncr_id', label: 'NCR', type: 'ref', ref: 'ncrs', table: true },
    { key: 'root_cause', label: 'Root cause', type: 'textarea', required: true, wide: true },
    { key: 'corrective_action', label: 'Corrective action', type: 'textarea', required: true, wide: true },
    { key: 'preventive_action', label: 'Preventive action', type: 'textarea', wide: true },
    { key: 'owner_id', label: 'Owner', type: 'ref', ref: 'employees', table: true },
    { key: 'due_date', label: 'Due', type: 'date', required: true, table: true },
  ],
  searchKeys: ['number', 'root_cause'], filterKeys: ['status'], editableIn: ['open', 'in_progress'], deletableIn: ['open'],
};

// ─── Maintenance ───
const pmSchedules: EntityDef = {
  table: 'pm_schedules', module: 'maintenance', label: 'PM schedule', plural: 'Preventive maintenance schedules', titleKey: 'task',
  subtitle: (r, ref) => `${ref('machines', r.machine_id)} · every ${r.frequency_days} days`,
  fields: [
    { key: 'machine_id', label: 'Machine', type: 'ref', ref: 'machines', required: true, table: true },
    { key: 'task', label: 'Task', type: 'text', required: true, table: true },
    { key: 'frequency_days', label: 'Frequency (days)', type: 'number', required: true, min: 1, table: true },
    { key: 'last_done', label: 'Last done', type: 'date', table: true },
    { key: 'next_due', label: 'Next due', type: 'date', required: true, table: true },
    { key: 'technician_id', label: 'Default technician', type: 'ref', ref: 'employees', refWhere: { skill: ['technician'] } },
    { key: 'estimated_hours', label: 'Estimated hours', type: 'number', min: 0 },
    { key: 'active', label: 'Active', type: 'boolean', default: true },
  ],
  searchKeys: ['task'], filterKeys: ['machine_id'], defaultSort: { key: 'next_due', dir: 'asc' },
};

const workOrders: EntityDef = {
  table: 'work_orders', module: 'maintenance', label: 'Work order', plural: 'Maintenance work orders', numberPrefix: 'WO', titleKey: 'number',
  subtitle: (r, ref) => `${ref('machines', r.machine_id)} · ${r.wo_type}`,
  statuses: [
    st('open', 'blue'), st('assigned', 'blue'), st('in_progress', 'amber', 'In progress'), st('on_hold', 'amber', 'On hold'),
    st('completed', 'green'), st('closed', 'grey'), st('cancelled', 'grey'),
  ],
  initialStatus: 'open',
  transitions: [
    { to: 'assigned', from: ['open'], label: 'Assign', action: 'edit', tone: 'primary' },
    { to: 'in_progress', from: ['open', 'assigned', 'on_hold'], label: 'Start work', action: 'edit', tone: 'primary' },
    { to: 'on_hold', from: ['in_progress'], label: 'Put on hold', action: 'edit', requireComment: true },
    { to: 'completed', from: ['in_progress'], label: 'Mark completed', action: 'edit', tone: 'primary' },
    { to: 'closed', from: ['completed'], label: 'Close (verified)', action: 'approve' },
    { to: 'cancelled', from: ['open', 'assigned'], label: 'Cancel', action: 'approve', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'WO no.', type: 'text', form: false, table: true },
    { key: 'machine_id', label: 'Machine', type: 'ref', ref: 'machines', required: true, table: true, scannable: true },
    { key: 'wo_type', label: 'Type', type: 'select', options: opt('breakdown', 'corrective', 'preventive', 'inspection'), required: true, table: true },
    { key: 'priority', label: 'Priority', type: 'select', options: opt('critical', 'high', 'medium', 'low'), default: 'medium', required: true, table: true },
    { key: 'description', label: 'Problem / task', type: 'textarea', required: true, wide: true },
    { key: 'assigned_to', label: 'Technician', type: 'ref', ref: 'employees', refWhere: { skill: ['technician'] }, table: true },
    { key: 'due_date', label: 'Due', type: 'date', table: true },
    { key: 'pm_schedule_id', label: 'PM schedule', type: 'ref', ref: 'pm_schedules', form: false },
    { key: 'downtime_minutes', label: 'Machine downtime (min)', type: 'number', min: 0 },
    { key: 'labour_hours', label: 'Labour hours', type: 'number', min: 0 },
    { key: 'labour_cost', label: 'Labour cost', type: 'currency', min: 0 },
    { key: 'parts_used', label: 'Spare parts consumed', type: 'lines', wide: true, lineFields: [
      { key: 'material_id', label: 'Part', type: 'ref', ref: 'materials', refWhere: { type: ['spare', 'consumable'] }, required: true },
      { key: 'qty', label: 'Qty', type: 'number', required: true, min: 0.001 },
      { key: 'rate', label: 'Unit cost', type: 'currency', min: 0 },
    ] },
    { key: 'parts_warehouse_id', label: 'Issue parts from', type: 'ref', ref: 'warehouses' },
    { key: 'completion_remarks', label: 'Completion remarks', type: 'textarea', wide: true },
  ],
  searchKeys: ['number', 'description'], filterKeys: ['status', 'wo_type', 'priority', 'assigned_to', 'machine_id'],
  defaultSort: { key: 'created_at', dir: 'desc' }, editableIn: ['open', 'assigned', 'in_progress', 'on_hold'], deletableIn: ['open'], attachments: true,
};

// ─── Logistics ───
const shipments: EntityDef = {
  table: 'shipments', module: 'logistics', label: 'Delivery order', plural: 'Delivery orders & shipments', numberPrefix: 'DO', titleKey: 'number',
  subtitle: (r, ref) => `${ref('customers', r.customer_id)} · ${r.destination ?? ''}`,
  statuses: [
    st('planned', 'grey'), st('loaded', 'blue'), st('dispatched', 'blue'), st('in_transit', 'blue', 'In transit'),
    st('delayed', 'red'), st('delivered', 'green'), st('pod_received', 'green', 'POD received'), st('cancelled', 'grey'),
  ],
  initialStatus: 'planned',
  transitions: [
    { to: 'loaded', from: ['planned'], label: 'Mark loaded', action: 'edit', tone: 'primary' },
    { to: 'dispatched', from: ['loaded'], label: 'Dispatch', action: 'edit', tone: 'primary' },
    { to: 'in_transit', from: ['dispatched', 'delayed'], label: 'In transit', action: 'edit' },
    { to: 'delayed', from: ['dispatched', 'in_transit'], label: 'Report delay', action: 'edit', tone: 'danger', requireComment: true },
    { to: 'delivered', from: ['dispatched', 'in_transit', 'delayed'], label: 'Mark delivered', action: 'edit', tone: 'primary' },
    { to: 'pod_received', from: ['delivered'], label: 'POD received', action: 'edit', tone: 'primary' },
    { to: 'cancelled', from: ['planned', 'loaded'], label: 'Cancel', action: 'edit', tone: 'danger', requireComment: true },
  ],
  fields: [
    { key: 'number', label: 'DO no.', type: 'text', form: false, table: true },
    { key: 'sales_order_id', label: 'Sales order', type: 'ref', ref: 'sales_orders', table: true },
    { key: 'customer_id', label: 'Customer', type: 'ref', ref: 'customers', required: true, table: true },
    { key: 'destination', label: 'Destination', type: 'text', required: true, table: true },
    { key: 'dispatch_date', label: 'Planned dispatch', type: 'date', required: true, default: today },
    { key: 'eta', label: 'ETA', type: 'date', required: true, table: true },
    { key: 'transporter_id', label: 'Transporter', type: 'ref', ref: 'transporters', table: true },
    { key: 'vehicle_id', label: 'Vehicle', type: 'ref', ref: 'vehicles' },
    { key: 'from_warehouse_id', label: 'Dispatch from', type: 'ref', ref: 'warehouses' },
    { key: 'lines', label: 'Items', type: 'lines', wide: true, lineFields: materialLine({ type: ['fg'] }) },
    { key: 'challan_no', label: 'Delivery challan no.', type: 'text' },
    { key: 'eway_bill_no', label: 'E-way bill no.', type: 'text', pattern: /^\d{12}$/, patternMessage: 'E-way bill numbers are 12 digits' },
    { key: 'lr_no', label: 'LR / docket no.', type: 'text' },
    { key: 'freight_cost', label: 'Freight cost', type: 'currency', min: 0, table: true },
    { key: 'delivered_on', label: 'Delivered on', type: 'date' },
    { key: 'receiver_name', label: 'Received by', type: 'text' },
  ],
  searchKeys: ['number', 'destination', 'challan_no', 'eway_bill_no', 'lr_no'], filterKeys: ['status', 'transporter_id', 'customer_id'],
  defaultSort: { key: 'dispatch_date', dir: 'desc' }, editableIn: ['planned', 'loaded', 'dispatched', 'in_transit', 'delayed', 'delivered'], deletableIn: ['planned'], attachments: true,
  validate: dateOrder('dispatch_date', 'eta', 'ETA must be on or after dispatch date'),
};

// ─── Configuration ───
const approvalRules: EntityDef = {
  table: 'approval_rules', module: 'settings', label: 'Approval rule', plural: 'Approval workflows', titleKey: 'entity',
  subtitle: (r) => `≥ ${r.min_amount} → ${r.approver_role}`,
  fields: [
    { key: 'entity', label: 'Document', type: 'select', required: true, table: true, options: [
      { value: 'purchase_requisitions', label: 'Purchase requisition' }, { value: 'purchase_orders', label: 'Purchase order' },
      { value: 'quotations', label: 'Quotation' }, { value: 'invoices', label: 'Supplier invoice' },
    ] },
    { key: 'min_amount', label: 'Applies from amount', type: 'currency', required: true, min: 0, table: true },
    { key: 'approver_role', label: 'Approver role', type: 'select', required: true, table: true, options: ROLES.map((r) => ({ value: r.id, label: r.label })) },
    { key: 'active', label: 'Active', type: 'boolean', default: true, table: true },
  ],
  searchKeys: ['entity'], filterKeys: ['entity'],
};

const reportSchedules: EntityDef = {
  table: 'report_schedules', module: 'reports', label: 'Report schedule', plural: 'Scheduled reports', titleKey: 'name',
  subtitle: (r) => `${r.frequency} · ${r.recipients}`,
  fields: [
    { key: 'name', label: 'Name', type: 'text', required: true, table: true },
    { key: 'report_type', label: 'Report', type: 'select', required: true, table: true, options: opt(
      'production', 'inventory', 'consumption', 'procurement', 'ap_ageing', 'quality', 'utilization', 'oee', 'maintenance', 'logistics', 'cost',
    ) },
    { key: 'frequency', label: 'Frequency', type: 'select', options: opt('daily', 'weekly', 'monthly'), required: true, table: true },
    { key: 'send_time', label: 'Send at (HH:MM)', type: 'text', pattern: /^([01]\d|2[0-3]):[0-5]\d$/, patternMessage: 'Use 24h HH:MM', default: '08:00', required: true },
    { key: 'channel', label: 'Channel', type: 'select', options: opt('email', 'whatsapp'), default: 'email', required: true, table: true },
    { key: 'recipients', label: 'Recipients', type: 'text', required: true, help: 'Comma-separated emails or WhatsApp numbers', wide: true },
    { key: 'active', label: 'Active', type: 'boolean', default: true, table: true },
  ],
  searchKeys: ['name', 'recipients'],
  validate: (v) => {
    const list = String(v.recipients ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const re = v.channel === 'whatsapp' ? /^\+?\d{10,15}$/ : /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    return list.length && list.every((x) => re.test(x)) ? {} : { recipients: v.channel === 'whatsapp' ? 'Enter WhatsApp numbers with country code' : 'Enter valid email addresses' };
  },
};

const members: EntityDef = {
  table: 'company_members', module: 'settings', label: 'User', plural: 'Users & roles', titleKey: 'full_name',
  subtitle: (r) => `${r.email} · ${String(r.role).replace(/_/g, ' ')}`,
  fields: [
    { key: 'full_name', label: 'Full name', type: 'text', required: true, table: true },
    { key: 'email', label: 'Email', type: 'email', required: true, table: true },
    { key: 'role', label: 'Role', type: 'select', required: true, table: true, options: ROLES.filter((r) => r.id !== 'super_admin').map((r) => ({ value: r.id, label: r.label })) },
    { key: 'factory_id', label: 'Home factory', type: 'ref', ref: 'factories' },
    { key: 'phone', label: 'WhatsApp number', type: 'phone', pattern: /^\+\d{10,15}$/, patternMessage: 'Use international format, e.g. +919876543210' },
    { key: 'active', label: 'Active', type: 'boolean', default: true, table: true },
  ],
  searchKeys: ['full_name', 'email'], filterKeys: ['role'],
};

export const ENTITIES: Partial<Record<TableName, EntityDef>> = Object.fromEntries(
  [
    factories, productionLines, warehouses, bins, shifts, uoms, employees, materials, customers, suppliers,
    machines, transporters, vehicles, qualityParameters, defectCodes, rfqs, quotations, salesOrders,
    purchaseRequisitions, supplierQuotations, purchaseOrders, grns, invoices, payments, productionOrders,
    shiftReports, stockMovements, stockBalances, reservations, stockAudits, inspections, ncrs, capas,
    pmSchedules, workOrders, shipments, approvalRules, reportSchedules, members,
  ].map((e) => [e.table, e]),
);

export function entity(table: TableName): EntityDef {
  const def = ENTITIES[table];
  if (!def) throw new Error(`No entity definition for ${table}`);
  return def;
}

export function statusDef(def: EntityDef, value: unknown): StatusDef | undefined {
  return def.statuses?.find((s) => s.value === value);
}

/** Field-level + entity-level validation. Same rules run in the backend before writes. */
export function validateRecord(def: EntityDef, v: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of def.fields) {
    if (f.form === false || f.readOnly) continue;
    const val = v[f.key];
    const empty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    if (f.required && empty) { errors[f.key] = `${f.label} is required`; continue; }
    if (empty) continue;
    if (['number', 'currency', 'percent'].includes(f.type)) {
      const n = Number(val);
      if (!Number.isFinite(n)) errors[f.key] = `${f.label} must be a number`;
      else if (f.min !== undefined && n < f.min) errors[f.key] = `${f.label} must be ≥ ${f.min}`;
      else if (f.max !== undefined && n > f.max) errors[f.key] = `${f.label} must be ≤ ${f.max}`;
    }
    if (typeof val === 'string') {
      if (f.maxLength && val.length > f.maxLength) errors[f.key] = `${f.label} must be at most ${f.maxLength} characters`;
      if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) errors[f.key] = 'Enter a valid email address';
      if (f.pattern && !f.pattern.test(val)) errors[f.key] = f.patternMessage ?? `${f.label} is invalid`;
    }
    if (f.type === 'lines' && Array.isArray(val) && f.lineFields) {
      val.forEach((line, i) => {
        for (const lf of f.lineFields!) {
          const lv = (line as Record<string, unknown>)?.[lf.key];
          if (lf.required && (lv === undefined || lv === null || lv === '')) errors[f.key] = `Line ${i + 1}: ${lf.label} is required`;
          else if (lf.min !== undefined && lv !== undefined && lv !== '' && Number(lv) < lf.min) errors[f.key] = `Line ${i + 1}: ${lf.label} must be ≥ ${lf.min}`;
        }
      });
    }
  }
  for (const [k, msg] of Object.entries(def.validate?.(v) ?? {})) if (msg) errors[k] = msg;
  return errors;
}
