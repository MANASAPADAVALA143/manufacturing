import { useMemo } from 'react';
import { addDays } from '@/lib/dates';
import { useQuery } from '@/lib/data/hooks';
import type { Dataset, OpsFilters } from '@/lib/analytics';

/** Loads everything dashboards need. Transaction tables are bounded by date where the volume grows. */
export function useDataset(f: OpsFilters, opts: { lookbackDays?: number } = {}): Dataset {
  const look = opts.lookbackDays ?? 30;
  const from = f.from < addDays(f.to, -look) ? f.from : addDays(f.to, -look);
  const L = 5000;
  const factories = useQuery('factories', { limit: L });
  const lines = useQuery('production_lines', { limit: L });
  const machines = useQuery('machines', { limit: L });
  const shifts = useQuery('shifts', { limit: L });
  const materials = useQuery('materials', { limit: L });
  const warehouses = useQuery('warehouses', { limit: L });
  const shiftReports = useQuery('shift_reports', { gte: { report_date: from }, lte: { report_date: f.to }, limit: L });
  const balances = useQuery('stock_balances', { limit: L });
  const movements = useQuery('stock_movements', { gte: { movement_date: addDays(f.to, -Math.max(look, 30)) }, limit: L });
  const purchaseOrders = useQuery('purchase_orders', { limit: L });
  const requisitions = useQuery('purchase_requisitions', { limit: L });
  const invoices = useQuery('invoices', { limit: L });
  const inspections = useQuery('inspections', { gte: { inspection_date: from }, limit: L });
  const workOrders = useQuery('work_orders', { limit: L });
  const pmSchedules = useQuery('pm_schedules', { limit: L });
  const shipments = useQuery('shipments', { limit: L });
  const productionOrders = useQuery('production_orders', { limit: L });
  const suppliers = useQuery('suppliers', { limit: L });
  const grns = useQuery('grns', { limit: L });
  const salesOrders = useQuery('sales_orders', { limit: L });
  const customers = useQuery('customers', { limit: L });
  const all = [factories, lines, machines, shifts, materials, warehouses, shiftReports, balances, movements, purchaseOrders, requisitions, invoices, inspections, workOrders, pmSchedules, shipments, productionOrders, suppliers, grns, salesOrders, customers];
  return {
    factories: factories.rows, lines: lines.rows, machines: machines.rows, shifts: shifts.rows, materials: materials.rows, warehouses: warehouses.rows,
    shiftReports: shiftReports.rows, balances: balances.rows, movements: movements.rows, purchaseOrders: purchaseOrders.rows, requisitions: requisitions.rows,
    invoices: invoices.rows, inspections: inspections.rows, workOrders: workOrders.rows, pmSchedules: pmSchedules.rows, shipments: shipments.rows,
    productionOrders: productionOrders.rows, suppliers: suppliers.rows, grns: grns.rows, salesOrders: salesOrders.rows, customers: customers.rows,
    loading: all.some((q) => q.loading && !q.rows.length),
    stale: all.some((q) => q.stale),
  };
}

export function useOps(f: OpsFilters) {
  const ds = useDataset(f);
  const machines = useMemo(() => new Map(ds.machines.map((m) => [m.id, m])), [ds.machines]);
  return { ds, machines };
}
