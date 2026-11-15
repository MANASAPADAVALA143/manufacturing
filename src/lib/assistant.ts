import {
  aggregate, apPosition, delayedPOs, dispatchPerformance, exceptions, filterReports, groupAgg, machineHealth,
  maintenanceDue, OPEN_WO, stockPosition, type Dataset, type OpsFilters,
} from '@/lib/analytics';
import { addDays, ymd } from '@/lib/dates';
import { money, pct, qty } from '@/lib/format';
import type { BaseRow, CompanySettings, LineItem } from '@/lib/data/schema';

export interface Answer {
  intent: string;
  summary: string;
  bullets?: string[];
  table?: { headers: string[]; rows: (string | number)[][] };
  actions?: { label: string; link: string }[];
  sources: string[];
  period?: string;
}

const n = (x: unknown) => Number(x) || 0;

function period(q: string): { from: string; to: string; label: string } {
  const t = ymd();
  if (/yesterday/.test(q)) return { from: addDays(t, -1), to: addDays(t, -1), label: 'yesterday' };
  if (/today|now|current/.test(q)) return { from: t, to: t, label: 'today' };
  if (/month|30 ?days/.test(q)) return { from: addDays(t, -29), to: t, label: 'last 30 days' };
  if (/quarter|90 ?days/.test(q)) return { from: addDays(t, -89), to: t, label: 'last 90 days' };
  return { from: addDays(t, -6), to: t, label: 'last 7 days' };
}

const has = (q: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === 'string' ? q.includes(w) : w.test(q)));

/** Deterministic, data-grounded answers. Never invents numbers: every figure is computed from `ds`. */
export function answer(question: string, ds: Dataset, settings: CompanySettings): Answer {
  const q = question.toLowerCase().replace(/[’']/g, "'");
  const machines = new Map(ds.machines.map((m) => [m.id, m]));
  const nameOf = (rows: BaseRow[], id: unknown) => String(rows.find((r) => r.id === id)?.name ?? '—');
  const line = ds.lines.find((l) => q.includes(String(l.name).toLowerCase()) || new RegExp(`\\b${String(l.code).toLowerCase()}\\b|line ?${String(l.code).replace(/\D/g, '')}\\b`).test(q));
  const f: OpsFilters = { ...period(q), lineId: line?.id };
  const p = period(q);
  const scope = line ? ` on ${line.name}` : '';

  // 1. Production today / output
  if (has(q, 'production', 'output', 'produced', 'how many units') && !has(q, 'below', 'target', 'cost', 'order')) {
    const pp = has(q, 'week', 'month', 'yesterday', 'days') ? p : { from: ymd(), to: ymd(), label: 'today' };
    const reps = filterReports(ds, { ...f, ...pp }, pp.from, pp.to);
    if (!reps.length) return { intent: 'production', summary: `No shift reports have been submitted ${pp.label}${scope}, so production cannot be reported yet.`, sources: ['shift_reports'], actions: [{ label: 'Submit a shift report', link: '/field/shift' }], period: pp.label };
    const a = aggregate(reps, machines);
    const byLine = groupAgg(reps, (r) => String(r.line_id), machines);
    return {
      intent: 'production', period: pp.label,
      summary: `Good output ${pp.label}${scope}: ${qty(a.good, 0)} units against a target of ${qty(a.target, 0)} (${pct(a.achievement, 0)}). ${qty(a.rejected, 0)} units rejected (${pct(a.rejectionPct)}), OEE ${pct(a.oee ? a.oee.oee * 100 : null)}.`,
      table: { headers: ['Line', 'Good', 'Target', 'Achievement', 'OEE'], rows: byLine.map((g) => [nameOf(ds.lines, g.key), qty(g.good, 0), qty(g.target, 0), pct(g.achievement, 0), pct(g.oee ? g.oee.oee * 100 : null)]) },
      sources: [`shift_reports (${reps.length} reports)`, 'machines (ideal cycle time)'],
      actions: [{ label: 'Open production dashboard', link: '/production' }],
    };
  }

  // 2. Highest downtime
  if (has(q, 'downtime', 'stopped', 'idle time')) {
    const reps = filterReports(ds, f);
    const by = groupAgg(reps, (r) => String(r.machine_id), machines).sort((a, b) => b.downtime - a.downtime);
    if (!by.length) return { intent: 'downtime', summary: `No shift reports ${p.label}${scope}.`, sources: ['shift_reports'] };
    const top = by[0];
    const reasons = groupAgg(reps.filter((r) => r.machine_id === top.key), (r) => String(r.downtime_reason ?? 'other'), machines).sort((a, b) => b.downtime - a.downtime);
    return {
      intent: 'downtime', period: p.label,
      summary: `${nameOf(ds.machines, top.key)} has the highest downtime ${p.label}: ${qty(top.downtime, 0)} minutes (${pct(top.planned ? (top.downtime / top.planned) * 100 : 0)} of planned time). Main cause: ${String(reasons[0]?.key ?? 'n/a').replace(/_/g, ' ')} (${reasons[0]?.downtime ?? 0} min).`,
      table: { headers: ['Machine', 'Downtime (min)', '% of planned', 'OEE'], rows: by.slice(0, 6).map((g) => [nameOf(ds.machines, g.key), g.downtime, pct(g.planned ? (g.downtime / g.planned) * 100 : 0), pct(g.oee ? g.oee.oee * 100 : null)]) },
      sources: [`shift_reports (${reps.length})`],
      actions: [{ label: 'Downtime analysis', link: '/production/downtime' }, { label: 'Raise a work order', link: '/maintenance/work_orders' }],
    };
  }

  // 3. Run out first / stock-out
  if (has(q, 'run out', 'stockout', 'stock-out', 'stock out', 'shortage', 'low stock', 'reorder')) {
    const onlyRaw = has(q, 'raw');
    const rows = stockPosition(ds).filter((s) => s.cover !== null && (!onlyRaw || s.material.type === 'raw')).sort((a, b) => a.cover! - b.cover!);
    if (!rows.length) return { intent: 'stockout', summary: 'No material has recorded consumption in the last 30 days, so days of cover cannot be estimated.', sources: ['stock_balances', 'stock_movements'] };
    const first = rows[0];
    const lead = n(first.material.lead_time_days);
    return {
      intent: 'stockout',
      summary: `${first.material.name} will run out first: ${qty(first.onHand, 0)} ${first.material.uom} on hand at ${qty(first.consumed30 / 30, 0)} ${first.material.uom}/day ≈ ${first.cover!.toFixed(1)} days of cover, versus a ${lead}-day supplier lead time.${first.cover! < lead ? ' It will stock out before a new order can arrive.' : ''}${first.openPoQty > 0 ? ` ${qty(first.openPoQty, 0)} ${first.material.uom} are on open POs.` : ' There is no open PO.'}`,
      table: { headers: ['Material', 'On hand', 'Daily use', 'Days cover', 'Lead time', 'Open PO'], rows: rows.slice(0, 6).map((s) => [String(s.material.name), `${qty(s.onHand, 0)} ${s.material.uom}`, qty(s.consumed30 / 30, 0), s.cover!.toFixed(1), `${s.material.lead_time_days} d`, qty(s.openPoQty, 0)]) },
      sources: ['stock_balances', 'stock_movements (30-day issues)', 'materials (lead time)', 'purchase_orders'],
      actions: [{ label: 'Reorder recommendations', link: '/inventory/reorder' }],
    };
  }

  // 4. Delayed POs
  if (has(q, 'purchase order', ' po', 'pos ', "po's") && has(q, 'delay', 'late', 'overdue', 'pending')) {
    const d = delayedPOs(ds);
    if (!d.length) return { intent: 'delayed_po', summary: 'No approved purchase orders are past their expected delivery date.', sources: ['purchase_orders'] };
    return {
      intent: 'delayed_po',
      summary: `${d.length} purchase order${d.length > 1 ? 's are' : ' is'} past the expected delivery date. The most delayed is ${d[0].po.number} from ${nameOf(ds.suppliers, d[0].po.supplier_id)}, ${d[0].daysLate} days late.`,
      table: { headers: ['PO', 'Supplier', 'Expected', 'Days late', 'Status', 'Value'], rows: d.map((x) => [String(x.po.number), nameOf(ds.suppliers, x.po.supplier_id), String(x.po.expected_date), x.daysLate, String(x.po.status).replace('_', ' '), money(x.po.total, true)]) },
      sources: ['purchase_orders'], actions: [{ label: 'Open purchase orders', link: '/procurement/purchase_orders' }],
    };
  }

  // 5. Rejection %
  if (has(q, 'rejection', 'reject', 'scrap', 'defect', 'yield')) {
    const reps = filterReports(ds, f);
    const a = aggregate(reps, machines);
    const byLine = groupAgg(reps, (r) => String(r.line_id), machines).sort((x, y) => (y.rejectionPct ?? 0) - (x.rejectionPct ?? 0));
    const ins = ds.inspections.filter((i) => String(i.inspection_date) >= p.from && ['passed', 'failed', 'conditional'].includes(String(i.status)) && n(i.lot_qty) > 0);
    const avgLotRej = ins.length ? (ins.reduce((s, i) => s + n(i.rejected_qty) / n(i.lot_qty), 0) / ins.length) * 100 : null;
    return {
      intent: 'rejection', period: p.label,
      summary: `Production rejection ${p.label}${scope}: ${pct(a.rejectionPct)} (${qty(a.rejected, 0)} of ${qty(a.actual, 0)} units). Alert threshold is ${settings.rejection_alert_pct}%.${ins.length ? ` Inspections: average ${pct(avgLotRej)} rejected per lot across ${ins.length} lots.` : ''}`,
      table: { headers: ['Line', 'Rejected', 'Total', 'Rejection %'], rows: byLine.map((g) => [nameOf(ds.lines, g.key), qty(g.rejected, 0), qty(g.actual, 0), pct(g.rejectionPct)]) },
      sources: [`shift_reports (${reps.length})`, `inspections (${ins.length})`], actions: [{ label: 'Quality dashboard', link: '/quality' }],
    };
  }

  // 6. Cost per unit
  if (has(q, 'cost per unit', 'unit cost', 'manufacturing cost', 'cost of production', 'cpu')) {
    const pp = has(q, 'week', 'today', 'yesterday') ? p : { from: addDays(ymd(), -29), to: ymd(), label: 'last 30 days' };
    const reps = filterReports(ds, { ...f, ...pp }, pp.from, pp.to);
    const good = aggregate(reps, machines).good;
    const mats = new Map(ds.materials.map((m) => [m.id, m]));
    const matCost = ds.movements.filter((m) => m.reason === 'production_issue' && String(m.movement_date) >= pp.from && String(m.movement_date) <= pp.to)
      .reduce((s, m) => s + n(m.qty) * n(m.unit_cost ?? mats.get(String(m.material_id))?.standard_cost), 0);
    const wos = ds.workOrders.filter((w) => w.completed_at && String(w.completed_at).slice(0, 10) >= pp.from);
    const maint = wos.reduce((s, w) => s + n(w.labour_cost) + ((w.parts_used as LineItem[]) ?? []).reduce((a, x) => a + n(x.qty) * n(x.rate), 0), 0);
    if (!good) return { intent: 'cost', summary: `No good output recorded ${pp.label}, so cost per unit cannot be computed.`, sources: ['shift_reports'] };
    return {
      intent: 'cost', period: pp.label,
      summary: `Recorded manufacturing cost per good unit ${pp.label}: ${money((matCost + maint) / good)} (${money(matCost / good)} material + ${money(maint / good)} maintenance) over ${qty(good, 0)} good units.`,
      bullets: ['Material = production issues valued at movement cost or standard cost.', 'Maintenance = labour + spares on completed work orders.', 'Direct labour, energy and overheads are not recorded in the system, so they are excluded — add them via cost centres for full absorption costing.'],
      sources: ['stock_movements (production_issue)', 'work_orders', 'shift_reports'], actions: [{ label: 'Manufacturing cost report', link: '/reports?r=cost' }],
    };
  }

  // 7. Maintenance required
  if (has(q, 'maintenance', 'require service', 'needs service', 'pm due', 'breakdown', 'equipment', 'attention')) {
    const due = maintenanceDue(ds, 7);
    const health = ds.machines.map((m) => ({ m, ...machineHealth(ds, m) })).filter((h) => h.score < 75 || h.m.status === 'breakdown').sort((a, b) => a.score - b.score);
    const list = [...new Set([...ds.machines.filter((m) => m.status === 'breakdown').map((m) => m.id), ...due.map((d) => String(d.pm.machine_id)), ...health.map((h) => h.m.id)])];
    if (!list.length) return { intent: 'maintenance', summary: 'No machine is in breakdown, overdue for PM, or below a health score of 75.', sources: ['machines', 'pm_schedules', 'work_orders', 'shift_reports'] };
    return {
      intent: 'maintenance',
      summary: `${list.length} machine${list.length > 1 ? 's need' : ' needs'} maintenance attention: ${due.filter((d) => d.overdueDays > 0).length} overdue PM task(s), ${ds.machines.filter((m) => m.status === 'breakdown').length} in breakdown, ${health.length} with a low rule-based health score.`,
      table: { headers: ['Machine', 'Reason', 'Health'], rows: list.map((id) => {
        const m = machines.get(id)!;
        const d = due.find((x) => x.pm.machine_id === id);
        const h = machineHealth(ds, m);
        return [String(m.name), m.status === 'breakdown' ? 'Breakdown' : d ? (d.overdueDays > 0 ? `PM overdue ${d.overdueDays} d: ${d.pm.task}` : `PM due ${d.pm.next_due}`) : `${h.downtime} min downtime / 30 d`, h.score];
      }) },
      sources: ['machines', 'pm_schedules', 'work_orders', 'shift_reports'], actions: [{ label: 'Maintenance dashboard', link: '/maintenance' }],
    };
  }

  // 8. Below target
  if (has(q, 'below target', 'under target', 'behind', 'below production', 'not meeting', 'underperform')) {
    const reps = filterReports(ds, f);
    const by = groupAgg(reps, (r) => String(r.product_id ?? ''), machines).filter((g) => g.achievement !== null && g.achievement < settings.below_target_alert_pct).sort((a, b) => a.achievement! - b.achievement!);
    const lines = groupAgg(reps, (r) => String(r.line_id), machines).filter((g) => g.achievement !== null && g.achievement < settings.below_target_alert_pct);
    if (!by.length) return { intent: 'below_target', summary: `All products met at least ${settings.below_target_alert_pct}% of target ${p.label}${scope}.`, sources: [`shift_reports (${reps.length})`] };
    return {
      intent: 'below_target', period: p.label,
      summary: `${by.length} product${by.length > 1 ? 's are' : ' is'} below ${settings.below_target_alert_pct}% of target ${p.label}. Worst: ${nameOf(ds.materials, by[0].key)} at ${pct(by[0].achievement, 0)}.${lines.length ? ` Underperforming lines: ${lines.map((l) => nameOf(ds.lines, l.key)).join(', ')}.` : ''}`,
      table: { headers: ['Product', 'Good', 'Target', 'Achievement', 'Downtime (min)'], rows: by.map((g) => [nameOf(ds.materials, g.key), qty(g.good, 0), qty(g.target, 0), pct(g.achievement, 0), g.downtime]) },
      sources: [`shift_reports (${reps.length})`], actions: [{ label: 'OEE by product', link: '/production/oee' }],
    };
  }

  // AP: overdue / payables
  if (has(q, 'overdue', 'payable', 'vendor bill', 'supplier bill', 'outstanding', 'ageing', 'aging')) {
    const ap = apPosition(ds);
    return {
      intent: 'ap_overdue',
      summary: ap.overdueList.length ? `${ap.overdueList.length} supplier invoices are overdue, totalling ${money(ap.overdue)}. Total outstanding payables: ${money(ap.outstanding)}.` : `No supplier invoices are overdue. Outstanding payables: ${money(ap.outstanding)}.`,
      table: ap.overdueList.length ? { headers: ['Supplier', 'Invoice', 'Due', 'Outstanding', 'Status'], rows: ap.overdueList.map((i) => [nameOf(ds.suppliers, i.supplier_id), String(i.invoice_no), String(i.due_date), money(n(i.total) - n(i.paid_amount)), String(i.status).replace('_', ' ')]) } : undefined,
      sources: ['invoices'], actions: [{ label: 'AP ageing', link: '/ap/ageing' }],
    };
  }

  if (has(q, 'invoice', 'ap exception', 'mismatch', 'duplicate', '3-way', 'three way')) {
    const ap = apPosition(ds);
    return {
      intent: 'ap_exceptions',
      summary: ap.exceptions.length ? `${ap.exceptions.length} invoice${ap.exceptions.length > 1 ? 's have' : ' has'} match exceptions; ${ap.pendingApproval.length} await approval.` : 'No invoices are in exception.',
      table: ap.exceptions.length ? { headers: ['Invoice', 'Supplier', 'Amount', 'Issue'], rows: ap.exceptions.map((i) => [String(i.invoice_no), nameOf(ds.suppliers, i.supplier_id), money(i.total, true), ((i.exceptions as string[]) ?? []).join('; ')]) } : undefined,
      sources: ['invoices', 'purchase_orders', 'grns'], actions: [{ label: 'Open 3-way match', link: '/ap/match' }],
    };
  }

  if (has(q, 'oee', 'efficiency', 'utili')) {
    const reps = filterReports(ds, f);
    const by = groupAgg(reps, (r) => String(line ? r.machine_id : r.line_id), machines).sort((a, b) => (a.oee?.oee ?? 0) - (b.oee?.oee ?? 0));
    const a = aggregate(reps, machines);
    return {
      intent: 'oee', period: p.label,
      summary: a.oee ? `OEE ${p.label}${scope}: ${pct(a.oee.oee * 100)} (availability ${pct(a.oee.availability * 100, 0)}, performance ${pct(a.oee.performance * 100, 0)}, quality ${pct(a.oee.quality * 100, 0)}). Target ${settings.oee_target_pct}%.` : `No shift reports ${p.label}${scope}.`,
      table: { headers: [line ? 'Machine' : 'Line', 'OEE', 'Availability', 'Performance', 'Quality'], rows: by.map((g) => [nameOf(line ? ds.machines : ds.lines, g.key), pct(g.oee ? g.oee.oee * 100 : null), pct(g.oee ? g.oee.availability * 100 : null, 0), pct(g.oee ? g.oee.performance * 100 : null, 0), pct(g.oee ? g.oee.quality * 100 : null, 0)]) },
      sources: [`shift_reports (${reps.length})`, 'machines'], actions: [{ label: 'OEE analysis', link: '/production/oee' }],
    };
  }

  if (has(q, 'shipment', 'delivery', 'dispatch', 'carrier', 'transport')) {
    const d = dispatchPerformance(ds, addDays(ymd(), -29), ymd());
    return {
      intent: 'logistics',
      summary: `${d.active.length} shipments are active; ${d.late.length} delayed or past ETA. On-time delivery over 30 days: ${pct(d.onTimePct, 0)} across ${d.delivered} deliveries.`,
      table: d.late.length ? { headers: ['DO', 'Customer', 'Destination', 'ETA', 'Status'], rows: d.late.map((s) => [String(s.number), nameOf(ds.customers, s.customer_id), String(s.destination), String(s.eta), String(s.status)]) } : undefined,
      sources: ['shipments'], actions: [{ label: 'Logistics', link: '/logistics' }],
    };
  }

  if (has(q, 'work order', 'wo ', 'open job')) {
    const open = ds.workOrders.filter((w) => OPEN_WO.includes(String(w.status)));
    return {
      intent: 'work_orders', summary: `${open.length} open work orders (${open.filter((w) => w.wo_type === 'breakdown').length} breakdowns).`,
      table: { headers: ['WO', 'Machine', 'Type', 'Priority', 'Status'], rows: open.map((w) => [String(w.number), nameOf(ds.machines, w.machine_id), String(w.wo_type), String(w.priority), String(w.status).replace('_', ' ')]) },
      sources: ['work_orders'], actions: [{ label: 'Work orders', link: '/maintenance/work_orders' }],
    };
  }

  if (has(q, 'exception', 'alert', 'attention', 'summary', 'issues', 'problem', 'status')) {
    const ex = exceptions(ds, { from: addDays(ymd(), -6), to: ymd() }, settings);
    return {
      intent: 'exceptions', summary: ex.length ? `${ex.length} items need attention (${ex.filter((e) => e.severity === 'critical').length} critical).` : 'No exceptions right now.',
      table: { headers: ['Severity', 'Module', 'Item', 'Detail'], rows: ex.slice(0, 12).map((e) => [e.severity, e.module, e.title, e.detail]) },
      sources: ['inventory', 'production', 'maintenance', 'invoices', 'purchase_orders', 'shipments'], actions: [{ label: 'Exception centre', link: '/overview' }],
    };
  }

  return {
    intent: 'unknown',
    summary: 'I can only answer from your company’s recorded data, and I did not recognise that question. Try asking about production, downtime, stock-outs, delayed POs, rejection %, cost per unit, maintenance due, products below target, overdue bills, invoice exceptions, OEE, shipments or open work orders.',
    sources: [],
  };
}
