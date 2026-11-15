import type { ModuleId } from './types';

export type Role =
  | 'super_admin'
  | 'company_admin'
  | 'ceo'
  | 'plant_manager'
  | 'production_manager'
  | 'purchase_manager'
  | 'finance_manager'
  | 'store_keeper'
  | 'production_supervisor'
  | 'maintenance_technician'
  | 'quality_inspector'
  | 'warehouse_operator';

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'approve';

export const ROLES: { id: Role; label: string; description: string }[] = [
  { id: 'super_admin', label: 'Super Admin', description: 'Platform operator. Manages all tenants.' },
  { id: 'company_admin', label: 'Company Admin', description: 'Full control of one company workspace.' },
  { id: 'ceo', label: 'CEO / Owner', description: 'Views everything, approves high-value documents.' },
  { id: 'plant_manager', label: 'Plant Manager', description: 'Runs plant operations across modules.' },
  { id: 'production_manager', label: 'Production Manager', description: 'Plans and controls production.' },
  { id: 'purchase_manager', label: 'Purchase Manager', description: 'Owns procurement and suppliers.' },
  { id: 'finance_manager', label: 'Finance Manager', description: 'Owns payables and payments.' },
  { id: 'store_keeper', label: 'Store Keeper', description: 'Receives and issues material.' },
  { id: 'production_supervisor', label: 'Production Supervisor', description: 'Reports shift output.' },
  { id: 'maintenance_technician', label: 'Maintenance Technician', description: 'Executes work orders.' },
  { id: 'quality_inspector', label: 'Quality Inspector', description: 'Performs inspections.' },
  { id: 'warehouse_operator', label: 'Warehouse Operator', description: 'Moves stock and dispatches goods.' },
];

export const roleLabel = (r: Role) => ROLES.find((x) => x.id === r)?.label ?? r;

type Matrix = Partial<Record<ModuleId, Action[]>>;

const ALL: Action[] = ['view', 'create', 'edit', 'delete', 'approve'];
const RW: Action[] = ['view', 'create', 'edit'];
const RWD: Action[] = ['view', 'create', 'edit', 'delete'];
const V: Action[] = ['view'];
const MODULES: ModuleId[] = [
  'overview', 'sales', 'procurement', 'ap', 'production', 'quality', 'maintenance',
  'inventory', 'logistics', 'assistant', 'reports', 'field', 'settings',
];

const everything = (actions: Action[]): Matrix =>
  Object.fromEntries(MODULES.map((m) => [m, actions])) as Matrix;

/**
 * Default permission matrix. Mirrored in `supabase/migrations/*_rbac.sql`
 * (table `role_permissions`), which is what actually enforces access.
 */
export const DEFAULT_PERMISSIONS: Record<Role, Matrix> = {
  super_admin: everything(ALL),
  company_admin: everything(ALL),
  ceo: { ...everything(['view', 'approve']), reports: ['view', 'create', 'edit'], assistant: V, settings: V },
  plant_manager: {
    ...everything(V),
    production: ALL, quality: ALL, maintenance: ALL, inventory: ALL, logistics: ALL,
    procurement: ['view', 'create', 'edit', 'approve'], reports: RW, field: RW, settings: V,
  },
  production_manager: {
    overview: V, sales: V, procurement: ['view', 'create'], production: ALL, quality: RW,
    maintenance: RW, inventory: ['view', 'create'], logistics: V, assistant: V, reports: RW, field: RW,
  },
  purchase_manager: {
    overview: V, sales: V, procurement: ALL, ap: V, inventory: RW, quality: V, assistant: V, reports: RW,
  },
  finance_manager: {
    overview: V, sales: V, procurement: V, ap: ALL, inventory: V, logistics: V, assistant: V, reports: RW,
  },
  store_keeper: {
    overview: V, procurement: V, inventory: RW, quality: V, logistics: V, field: RW, assistant: V,
  },
  production_supervisor: {
    overview: V, production: RW, inventory: ['view', 'create'], maintenance: ['view', 'create'],
    quality: V, field: RW, assistant: V,
  },
  maintenance_technician: {
    overview: V, maintenance: ['view', 'edit'], inventory: V, field: RW, assistant: V,
  },
  quality_inspector: {
    overview: V, quality: ['view', 'create', 'edit', 'approve'], inventory: V, production: V, field: RW, assistant: V,
  },
  warehouse_operator: {
    overview: V, inventory: RWD, logistics: RW, field: RW, assistant: V,
  },
};

export function can(role: Role | null | undefined, module: ModuleId, action: Action): boolean {
  if (!role) return false;
  return DEFAULT_PERMISSIONS[role]?.[module]?.includes(action) ?? false;
}
