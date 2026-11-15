import { computeOee, ageingBucket, AGEING_BUCKETS, daysOfCover, type Oee } from '@/lib/domain';
import { addDays, daysAgo, daysBetween, ymd } from '@/lib/dates';
import type { BaseRow, LineItem } from '@/lib/data/schema';

/* Pure analytics over company data (no React, no I/O). Data loading lives in useDataset.ts. */

const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

export interface OpsFilters {
  from: string;
  to: string;
  factoryId?: string;
  lineId?: string;
  shiftId?: string;
}

export const defaultFilters = (days = 30): OpsFilters => ({ from: daysAgo(days - 1), to: ymd() });

export interface Dataset {
  factories: BaseRow[]; lines: BaseRow[]; machines: BaseRow[]; shifts: BaseRow[]; materials: BaseRow[]; warehouses: BaseRow[];
  shiftReports: BaseRow[]; balances: BaseRow[]; movements: BaseRow[]; purchaseOrders: BaseRow[]; requisitions: BaseRow[];
  invoices: BaseRow[]; inspections: BaseRow[]; workOrders: BaseRow[]; pmSchedules: BaseRow[]; shipments: BaseRow[];
  productionOrders: BaseRow[]; suppliers: BaseRow[]; grns: BaseRow[]; salesOrders: BaseRow[]; customers: BaseRow[];
  loading: boolean; stale: boolean;
}

const byId = (rows: BaseRow[]) => new Map(rows.map((r) => [r.id, r]));

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

// ─── Production ───
export interface ProdAgg {
  target: number; actual: number; good: number; rejected: number; downtime: number; planned: number;
  achievement: number | null; rejectionPct: number | null; oee: Oee | null; reports: number;
}

export function aggregate(rows: BaseRow[], machines: Map<string, BaseRow>): ProdAgg {
  let target = 0, actual = 0, rejected = 0, downtime = 0, planned = 0;
  for (const r of rows) {
    target += n(r.target_qty); actual += n(r.actual_qty); rejected += n(r.rejected_qty);
    downtime += n(r.downtime_minutes); planned += n(r.planned_minutes);
  }
  const oee = computeOee(rows.map((r) => ({
    planned_minutes: n(r.planned_minutes), downtime_minutes: n(r.downtime_minutes), actual_qty: n(r.actual_qty), rejected_qty: n(r.rejected_qty),
    ideal_cycle_time_sec: n(machines.get(String(r.machine_id))?.ideal_cycle_time_sec),
  })));
  return {
    target, actual, good: actual - rejected, rejected, downtime, planned, reports: rows.length,
    achievement: target > 0 ? ((actual - rejected) / target) * 100 : null,
    rejectionPct: actual > 0 ? (rejected / actual) * 100 : null,
    oee,
  };
}

export function filterReports(ds: Dataset, f: OpsFilters, from = f.from, to = f.to) {
  const lines = byId(ds.lines);
  return ds.shiftReports.filter((r) => {
    const d = String(r.report_date);
    if (d < from || d > to) return false;
    if (f.lineId && r.line_id !== f.lineId) return false;
    if (f.shiftId && r.shift_id !== f.shiftId) return false;
    if (f.factoryId && lines.get(String(r.line_id))?.factory_id !== f.factoryId) return false;
    return true;
  });
}

export function groupAgg(rows: BaseRow[], key: (r: BaseRow) => string, machines: Map<string, BaseRow>) {
  const groups = new Map<string, BaseRow[]>();
  for (const r of rows) {
    const k = key(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([k, rs]) => ({ key: k, ...aggregate(rs, machines) }));
}

export function machineUtilization(rows: BaseRow[]) {
  const planned = rows.reduce((s, r) => s + n(r.planned_minutes), 0);
  const down = rows.reduce((s, r) => s + n(r.downtime_minutes), 0);
  return planned > 0 ? ((planned - down) / planned) * 100 : null;
}

// ─── Inventory ───
export interface StockRow {
  material: BaseRow; onHand: number; value: number; consumed30: number; cover: number | null;
  belowReorder: boolean; belowMin: boolean; openPoQty: number;
}

export function stockPosition(ds: Dataset, f: Pick<OpsFilters, 'factoryId'> = {}): StockRow[] {
  const wh = byId(ds.warehouses);
  const inScope = (w: unknown) => !f.factoryId || wh.get(String(w))?.factory_id === f.factoryId;
  const since = daysAgo(30);
  const onHand = new Map<string, number>();
  for (const b of ds.balances) if (inScope(b.warehouse_id)) onHand.set(String(b.material_id), (onHand.get(String(b.material_id)) ?? 0) + n(b.qty));
  const consumed = new Map<string, number>();
  for (const m of ds.movements) {
    if (String(m.movement_date) < since || !inScope(m.warehouse_id)) continue;
    if (m.movement_type === 'out' && ['production_issue', 'maintenance_issue'].includes(String(m.reason))) {
      consumed.set(String(m.material_id), (consumed.get(String(m.material_id)) ?? 0) + n(m.qty));
    }
  }
  const openPo = new Map<string, number>();
  for (const po of ds.purchaseOrders) {
    if (!['pending_approval', 'approved', 'sent', 'partially_received'].includes(String(po.status))) continue;
    for (const l of (po.lines as LineItem[]) ?? []) openPo.set(l.material_id, (openPo.get(l.material_id) ?? 0) + n(l.qty) - n(l.received_qty));
  }
  return ds.materials.map((m) => {
    const q = onHand.get(m.id) ?? 0;
    const c = consumed.get(m.id) ?? 0;
    return {
      material: m, onHand: q, value: q * n(m.standard_cost), consumed30: c, cover: daysOfCover(q, c, 30),
      belowReorder: n(m.reorder_level) > 0 && q < n(m.reorder_level), belowMin: n(m.min_stock) > 0 && q < n(m.min_stock),
      openPoQty: openPo.get(m.id) ?? 0,
    };
  });
}

export function movementSeries(ds: Dataset, days: string[], f: Pick<OpsFilters, 'factoryId'> = {}) {
  const wh = byId(ds.warehouses);
  const mat = byId(ds.materials);
  const inV = new Map<string, number>(), outV = new Map<string, number>();
  for (const m of ds.movements) {
    if (f.factoryId && wh.get(String(m.warehouse_id))?.factory_id !== f.factoryId) continue;
    if (m.reason === 'opening_balance') continue;
    const v = n(m.qty) * n(m.unit_cost ?? mat.get(String(m.material_id))?.standard_cost);
    const d = String(m.movement_date);
    if (m.movement_type === 'in' || (m.movement_type === 'adjust' && n(m.qty) > 0)) inV.set(d, (inV.get(d) ?? 0) + Math.abs(v));
    else if (m.movement_type === 'out' || (m.movement_type === 'adjust' && n(m.qty) < 0)) outV.set(d, (outV.get(d) ?? 0) + Math.abs(v));
  }
  return { inValues: days.map((d) => inV.get(d) ?? 0), outValues: days.map((d) => outV.get(d) ?? 0) };
}

// ─── Procurement / AP ───
export const OPEN_PO = ['pending_approval', 'approved', 'sent', 'partially_received'];

export function delayedPOs(ds: Dataset, today = ymd()) {
  return ds.purchaseOrders.filter((p) => ['approved', 'sent', 'partially_received'].includes(String(p.status)) && String(p.expected_date) < today)
    .map((p) => ({ po: p, daysLate: daysBetween(String(p.expected_date), today) }))
    .sort((a, b) => b.daysLate - a.daysLate);
}

export function spendBySupplier(ds: Dataset, from: string, to: string) {
  const s = byId(ds.suppliers);
  const m = new Map<string, number>();
  for (const p of ds.purchaseOrders) {
    if (['draft', 'cancelled'].includes(String(p.status))) continue;
    const d = String(p.po_date);
    if (d < from || d > to) continue;
    m.set(String(p.supplier_id), (m.get(String(p.supplier_id)) ?? 0) + n(p.total));
  }
  return [...m.entries()].map(([id, v]) => ({ supplier: s.get(id), value: v })).sort((a, b) => b.value - a.value);
}

export const OPEN_AP = ['received', 'matched', 'exception', 'pending_approval', 'approved', 'on_hold', 'partially_paid'];

export function apPosition(ds: Dataset, asOf = new Date()) {
  const open = ds.invoices.filter((i) => OPEN_AP.includes(String(i.status)));
  const buckets = Object.fromEntries(AGEING_BUCKETS.map((b) => [b, 0])) as Record<(typeof AGEING_BUCKETS)[number], number>;
  let outstanding = 0, overdue = 0;
  const today = ymd(asOf);
  for (const i of open) {
    const due = n(i.total) - n(i.paid_amount);
    outstanding += due;
    buckets[ageingBucket(String(i.due_date), asOf)] += due;
    if (String(i.due_date) < today) overdue += due;
  }
  return {
    open, outstanding, overdue, buckets,
    exceptions: ds.invoices.filter((i) => i.status === 'exception'),
    pendingApproval: ds.invoices.filter((i) => i.status === 'pending_approval'),
    overdueList: open.filter((i) => String(i.due_date) < today).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
  };
}

export function supplierScorecard(ds: Dataset) {
  return ds.suppliers.map((s) => {
    const pos = ds.purchaseOrders.filter((p) => p.supplier_id === s.id);
    const grns = ds.grns.filter((g) => g.supplier_id === s.id && g.status === 'posted');
    let onTime = 0;
    for (const g of grns) {
      const po = pos.find((p) => p.id === g.po_id);
      if (po && String(g.received_date) <= String(po.expected_date)) onTime++;
    }
    const ins = ds.inspections.filter((i) => i.supplier_id === s.id && ['passed', 'failed', 'conditional'].includes(String(i.status)) && n(i.lot_qty) > 0);
    // Average of per-lot rejection rates (lots may be in different units).
    const lotRate = ins.length ? ins.reduce((a, i) => a + n(i.rejected_qty) / n(i.lot_qty), 0) / ins.length : null;
    const invs = ds.invoices.filter((i) => i.supplier_id === s.id);
    const priceExc = invs.filter((i) => ((i.exceptions as string[]) ?? []).some((e) => e.startsWith('Price variance'))).length;
    // Purchase price variance: invoice rate vs PO rate, weighted by qty.
    let ppv = 0, base = 0;
    for (const i of invs) {
      const po = pos.find((p) => p.id === i.po_id);
      if (!po) continue;
      for (const l of (i.lines as LineItem[]) ?? []) {
        const pl = (po.lines as LineItem[]).find((x) => x.material_id === l.material_id);
        if (!pl) continue;
        ppv += (n(l.rate) - n(pl.rate)) * n(l.qty);
        base += n(pl.rate) * n(l.qty);
      }
    }
    return {
      supplier: s, poCount: pos.length, deliveries: grns.length,
      onTimePct: grns.length ? (onTime / grns.length) * 100 : null,
      rejectionPct: lotRate === null ? null : lotRate * 100,
      ppvPct: base ? (ppv / base) * 100 : null, ppvValue: ppv,
      priceExceptions: priceExc, invoices: invs.length,
      spend: pos.filter((p) => !['draft', 'cancelled'].includes(String(p.status))).reduce((a, p) => a + n(p.total), 0),
    };
  });
}

// ─── Maintenance ───
export function maintenanceDue(ds: Dataset, horizonDays = 7, today = ymd()) {
  const horizon = addDays(today, horizonDays);
  return ds.pmSchedules.filter((p) => p.active !== false && String(p.next_due) <= horizon)
    .map((p) => ({ pm: p, overdueDays: daysBetween(String(p.next_due), today) }))
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

export const OPEN_WO = ['open', 'assigned', 'in_progress', 'on_hold'];

/** Rule-based health score (not predictive AI): starts at 100, penalised by downtime, breakdowns and overdue PM. */
export function machineHealth(ds: Dataset, machine: BaseRow, today = ymd()) {
  const since = addDays(today, -30);
  const reps = ds.shiftReports.filter((r) => r.machine_id === machine.id && String(r.report_date) >= since);
  const util = machineUtilization(reps);
  const downtime = reps.reduce((s, r) => s + n(r.downtime_minutes), 0);
  const breakdowns = ds.workOrders.filter((w) => w.machine_id === machine.id && w.wo_type === 'breakdown' && String(w.created_at).slice(0, 10) >= since).length;
  const overdue = ds.pmSchedules.filter((p) => p.machine_id === machine.id && p.active !== false && String(p.next_due) < today);
  const maxOverdue = Math.max(0, ...overdue.map((p) => daysBetween(String(p.next_due), today)));
  let score = 100;
  if (util !== null) score -= Math.max(0, 95 - util) * 1.2;
  score -= breakdowns * 8;
  score -= Math.min(30, maxOverdue * 2);
  if (machine.status === 'breakdown') score -= 25;
  return { score: Math.max(0, Math.round(score)), util, downtime, breakdowns, overduePm: overdue.length, maxOverdue };
}

// ─── Logistics ───
export function dispatchPerformance(ds: Dataset, from: string, to: string) {
  const done = ds.shipments.filter((s) => ['delivered', 'pod_received'].includes(String(s.status)) && s.delivered_on && String(s.delivered_on) >= from && String(s.delivered_on) <= to);
  const onTime = done.filter((s) => String(s.delivered_on) <= String(s.eta)).length;
  const today = ymd();
  const active = ds.shipments.filter((s) => ['planned', 'loaded', 'dispatched', 'in_transit', 'delayed'].includes(String(s.status)));
  const late = active.filter((s) => s.status === 'delayed' || (String(s.eta) < today && s.status !== 'planned'));
  const freight = ds.shipments.filter((s) => String(s.dispatch_date) >= from && String(s.dispatch_date) <= to && s.status !== 'cancelled').reduce((a, s) => a + n(s.freight_cost), 0);
  return { delivered: done.length, onTimePct: done.length ? (onTime / done.length) * 100 : null, active, late, freight };
}

// ─── Exceptions centre ───
export interface Exception { severity: 'critical' | 'warning' | 'info'; module: string; title: string; detail: string; link: string }

export function exceptions(ds: Dataset, f: OpsFilters, settings: { oee_target_pct: number; rejection_alert_pct: number; below_target_alert_pct: number }): Exception[] {
  const out: Exception[] = [];
  const mats = byId(ds.materials);
  const machines = byId(ds.machines);
  for (const s of stockPosition(ds, f).filter((x) => x.belowReorder)) {
    out.push({
      severity: s.belowMin || (s.cover !== null && s.cover < n(s.material.lead_time_days)) ? 'critical' : 'warning', module: 'Inventory',
      title: `${s.material.name} below reorder level`,
      detail: `${Math.round(s.onHand).toLocaleString('en-IN')} ${s.material.uom} on hand${s.cover !== null ? ` · ~${s.cover.toFixed(1)} days cover` : ''} · lead time ${s.material.lead_time_days} d${s.openPoQty > 0 ? ` · ${Math.round(s.openPoQty).toLocaleString('en-IN')} on open POs` : ' · no open PO'}`,
      link: '/inventory/reorder',
    });
  }
  for (const m of ds.machines.filter((x) => x.status === 'breakdown')) out.push({ severity: 'critical', module: 'Maintenance', title: `${m.name} is down`, detail: 'Breakdown work order open', link: '/maintenance/work_orders' });
  const today = ymd();
  const recent = filterReports(ds, f, addDays(today, -1), today);
  for (const g of groupAgg(recent, (r) => String(r.machine_id), machines)) {
    const m = machines.get(g.key);
    if (g.oee && g.oee.oee * 100 < settings.oee_target_pct) out.push({ severity: g.oee.oee * 100 < settings.oee_target_pct - 15 ? 'critical' : 'warning', module: 'Production', title: `${m?.name ?? 'Machine'} OEE ${(g.oee.oee * 100).toFixed(1)}%`, detail: `Below ${settings.oee_target_pct}% target (last 2 days) · downtime ${g.downtime} min`, link: '/production/oee' });
    if (g.rejectionPct !== null && g.rejectionPct > settings.rejection_alert_pct) out.push({ severity: 'warning', module: 'Quality', title: `${m?.name ?? 'Machine'} rejection ${g.rejectionPct.toFixed(1)}%`, detail: `${g.rejected} rejected of ${g.actual} (last 2 days)`, link: '/production/shift_reports' });
  }
  const ap = apPosition(ds);
  for (const i of ap.exceptions.slice(0, 6)) out.push({ severity: 'warning', module: 'AP', title: `Invoice ${i.invoice_no}: exception`, detail: ((i.exceptions as string[]) ?? [])[0] ?? 'Match exception', link: `/ap/invoices?id=${i.id}` });
  if (ap.overdueList.length) out.push({ severity: 'warning', module: 'AP', title: `${ap.overdueList.length} supplier invoices overdue`, detail: `₹${Math.round(ap.overdue).toLocaleString('en-IN')} past due`, link: '/ap/ageing' });
  for (const d of delayedPOs(ds).slice(0, 5)) out.push({ severity: d.daysLate > 7 ? 'critical' : 'warning', module: 'Procurement', title: `PO ${d.po.number} delayed ${d.daysLate} d`, detail: `Expected ${d.po.expected_date}`, link: `/procurement/purchase_orders?id=${d.po.id}` });
  for (const p of maintenanceDue(ds, 0).filter((x) => x.overdueDays > 0)) out.push({ severity: p.overdueDays > 7 ? 'critical' : 'warning', module: 'Maintenance', title: `PM overdue ${p.overdueDays} d: ${p.pm.task}`, detail: machines.get(String(p.pm.machine_id))?.name as string ?? '', link: `/maintenance/pm_schedules?id=${p.pm.id}` });
  for (const s of dispatchPerformance(ds, f.from, f.to).late) out.push({ severity: 'warning', module: 'Logistics', title: `Shipment ${s.number} ${s.status === 'delayed' ? 'delayed' : 'past ETA'}`, detail: `${s.destination} · ETA ${s.eta}`, link: `/logistics/shipments?id=${s.id}` });
  const pendingPR = ds.requisitions.filter((r) => r.status === 'submitted');
  if (pendingPR.length) out.push({ severity: 'info', module: 'Procurement', title: `${pendingPR.length} requisitions awaiting approval`, detail: pendingPR.map((r) => mats.get(String(r.material_id))?.name).filter(Boolean).slice(0, 3).join(', '), link: '/procurement/purchase_requisitions' });
  const pendingPO = ds.purchaseOrders.filter((p) => p.status === 'pending_approval');
  if (pendingPO.length) out.push({ severity: 'info', module: 'Procurement', title: `${pendingPO.length} POs awaiting approval`, detail: pendingPO.map((p) => p.number).join(', '), link: '/procurement/purchase_orders' });
  const order = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}