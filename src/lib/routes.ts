import type { TableName } from '@/lib/data/schema';

/** Where each table's records live in the UI. Detail opens with `?id=`. */
export const TABLE_ROUTE: Partial<Record<TableName, string>> = {
  customers: '/sales/customers', rfqs: '/sales/rfqs', quotations: '/sales/quotations', sales_orders: '/sales/sales_orders',
  purchase_requisitions: '/procurement/purchase_requisitions', supplier_quotations: '/procurement/supplier_quotations',
  purchase_orders: '/procurement/purchase_orders', suppliers: '/procurement/suppliers',
  invoices: '/ap/invoices', payments: '/ap/payments',
  production_orders: '/production/production_orders', shift_reports: '/production/shift_reports',
  inspections: '/quality/inspections', ncrs: '/quality/ncrs', capas: '/quality/capas',
  quality_parameters: '/quality/quality_parameters', defect_codes: '/quality/defect_codes',
  machines: '/maintenance/machines', pm_schedules: '/maintenance/pm_schedules', work_orders: '/maintenance/work_orders',
  materials: '/inventory/materials', stock_movements: '/inventory/stock_movements', grns: '/inventory/grns',
  reservations: '/inventory/reservations', stock_audits: '/inventory/stock_audits', stock_balances: '/inventory/stock',
  shipments: '/logistics/shipments', vehicles: '/logistics/vehicles', transporters: '/logistics/transporters',
  factories: '/settings/factories', production_lines: '/settings/production_lines', warehouses: '/settings/warehouses',
  bins: '/settings/bins', shifts: '/settings/shifts', uoms: '/settings/uoms', employees: '/settings/employees',
  company_members: '/settings/company_members', approval_rules: '/settings/approval_rules', report_schedules: '/reports/report_schedules',
};

export const routeFor = (table: TableName, id?: string) => `${TABLE_ROUTE[table] ?? '/overview'}${id ? `?id=${id}` : ''}`;
