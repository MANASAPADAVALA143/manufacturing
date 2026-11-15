import { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, Boxes, CalendarClock, Download, Factory, FileText, Gauge, Printer, Receipt, ShieldCheck, Truck, Wallet, Wrench, Zap } from 'lucide-react';
import { Badge, Button, EmptyState, InfoBox, Panel, Spinner } from '@/components/ui';
import EntityManager from '@/components/data/EntityManager';
import { QuickCreate } from '@/components/data/QuickCreate';
import { useApp } from '@/lib/app';
import { useActions, useQuery } from '@/lib/data/hooks';
import type { BaseRow, LineItem } from '@/lib/data/schema';
import { aggregate, apPosition, defaultFilters, filterReports, groupAgg, machineUtilization, stockPosition, supplierScorecard, type Dataset, type OpsFilters } from '@/lib/analytics';
import { useDataset } from '@/lib/useDataset';
import { ageingBucket } from '@/lib/domain';
import { daysBetween, ymd } from '@/lib/dates';
import { dateTime, money, pct, qty } from '@/lib/format';
import { exportCsv, printReport, type ExportColumn } from '@/lib/export';
import { setParam, useRoute } from '@/lib/router';
import { useToast } from '@/components/Toast';
import { ModuleTabs, OpsFilterBar, useModuleTab } from './shared';

type Row = Record<string, string | number | null>;
interface Built { columns: string[]; rows: Row[]; summary: [string, string][]; note?: string }
interface ReportDef { id: string; title: string; desc: string; icon: typeof FileText; build: (ds: Dataset, f: OpsFilters) => Built }

const nm = (rows: BaseRow[], id: unknown) => String(rows.find((r) => r.id === id)?.name ?? '—');

const REPORTS: ReportDef[] = [
  { id: 'production', title: 'Production report', desc: 'Output, target, rejections and downtime by date, line and shift', icon: Factory, build: (ds, f) => {
    const m = new Map(ds.machines.map((x) => [x.id, x]));
    const reps = filterReports(ds, f);
    const g = groupAgg(reps, (r) => `${r.report_date}|${r.line_id}|${r.shift_id}`, m).sort((a, b) => a.key.localeCompare(b.key));
    const t = aggregate(reps, m);
    return { columns: ['Date', 'Line', 'Shift', 'Target', 'Actual', 'Good', 'Rejected', 'Downtime min', 'Achievement %'], rows: g.map((x) => { const [d, l, s] = x.key.split('|'); return { Date: d, Line: nm(ds.lines, l), Shift: nm(ds.shifts, s), Target: x.target, Actual: x.actual, Good: x.good, Rejected: x.rejected, 'Downtime min': x.downtime, 'Achievement %': x.achievement === null ? null : +x.achievement.toFixed(1) }; }),
      summary: [['Good output', qty(t.good, 0)], ['Target', qty(t.target, 0)], ['Achievement', pct(t.achievement)], ['Rejection', pct(t.rejectionPct)]] };
  } },
  { id: 'inventory', title: 'Inventory report', desc: 'Stock on hand, value, cover and reorder status per material', icon: Boxes, build: (ds, f) => {
    const s = stockPosition(ds, f);
    return { columns: ['Code', 'Material', 'Type', 'On hand', 'UOM', 'Value', 'Days cover', 'Reorder level', 'Status'], rows: s.map((x) => ({ Code: String(x.material.code), Material: String(x.material.name), Type: String(x.material.type), 'On hand': Math.round(x.onHand * 100) / 100, UOM: String(x.material.uom), Value: Math.round(x.value), 'Days cover': x.cover === null ? null : +x.cover.toFixed(1), 'Reorder level': Number(x.material.reorder_level), Status: x.belowMin ? 'Below minimum' : x.belowReorder ? 'Below reorder' : 'OK' })),
      summary: [['Inventory value', money(s.reduce((a, x) => a + x.value, 0))], ['Below reorder', String(s.filter((x) => x.belowReorder).length)]] };
  } },
  { id: 'consumption', title: 'Material consumption', desc: 'Issues to production and maintenance by material', icon: Zap, build: (ds, f) => {
    const mat = new Map(ds.materials.map((m) => [m.id, m]));
    const agg = new Map<string, { prod: number; maint: number }>();
    for (const mv of ds.movements.filter((x) => x.movement_type === 'out' && String(x.movement_date) >= f.from && String(x.movement_date) <= f.to)) {
      const e = agg.get(String(mv.material_id)) ?? { prod: 0, maint: 0 };
      if (mv.reason === 'production_issue') e.prod += Number(mv.qty); else if (mv.reason === 'maintenance_issue') e.maint += Number(mv.qty); else continue;
      agg.set(String(mv.material_id), e);
    }
    const rows = [...agg.entries()].map(([id, e]) => { const m = mat.get(id); return { Material: String(m?.name), UOM: String(m?.uom), 'Production issue': e.prod, 'Maintenance issue': e.maint, 'Value': Math.round((e.prod + e.maint) * Number(m?.standard_cost ?? 0)) }; });
    return { columns: ['Material', 'UOM', 'Production issue', 'Maintenance issue', 'Value'], rows, summary: [['Total value consumed', money(rows.reduce((a, r) => a + Number(r.Value), 0))]], note: 'Movements are limited to the dataset window (last 30–90 days).' };
  } },
  { id: 'procurement', title: 'Procurement report', desc: 'Purchase orders, receipts, spend and supplier performance', icon: Truck, build: (ds, f) => {
    const pos = ds.purchaseOrders.filter((p) => String(p.po_date) >= f.from && String(p.po_date) <= f.to);
    const rows = pos.map((p) => { const ordered = ((p.lines as LineItem[]) ?? []).reduce((a, l) => a + Number(l.qty), 0); const rec = ((p.lines as LineItem[]) ?? []).reduce((a, l) => a + Number(l.received_qty ?? 0), 0); return { PO: String(p.number), Date: String(p.po_date), Supplier: nm(ds.suppliers, p.supplier_id), Status: String(p.status), Value: Number(p.total), 'Ordered qty': ordered, 'Received qty': rec, Expected: String(p.expected_date) }; });
    const sc = supplierScorecard(ds);
    return { columns: ['PO', 'Date', 'Supplier', 'Status', 'Value', 'Ordered qty', 'Received qty', 'Expected'], rows, summary: [['PO value', money(rows.reduce((a, r) => a + Number(r.Value), 0))], ['POs', String(rows.length)], ['Avg on-time', pct(avg(sc.map((s) => s.onTimePct)), 0)]] };
  } },
  { id: 'ap_ageing', title: 'AP ageing', desc: 'Outstanding supplier invoices by ageing bucket', icon: Receipt, build: (ds) => {
    const ap = apPosition(ds);
    const rows = ap.open.map((i) => ({ Supplier: nm(ds.suppliers, i.supplier_id), Invoice: String(i.invoice_no), 'Invoice date': String(i.invoice_date), Due: String(i.due_date), Outstanding: Math.round((Number(i.total) - Number(i.paid_amount ?? 0)) * 100) / 100, Bucket: ageingBucket(String(i.due_date)), Status: String(i.status) }));
    return { columns: ['Supplier', 'Invoice', 'Invoice date', 'Due', 'Outstanding', 'Bucket', 'Status'], rows, summary: Object.entries(ap.buckets).map(([k, v]) => [k, money(v)] as [string, string]) };
  } },
  { id: 'quality', title: 'Quality report', desc: 'Inspections, rejections and NCRs', icon: ShieldCheck, build: (ds, f) => {
    const ins = ds.inspections.filter((i) => String(i.inspection_date) >= f.from && String(i.inspection_date) <= f.to);
    const decided = ins.filter((i) => ['passed', 'failed', 'conditional'].includes(String(i.status)) && Number(i.lot_qty) > 0);
    const avgRej = decided.length ? (decided.reduce((a, i) => a + Number(i.rejected_qty ?? 0) / Number(i.lot_qty), 0) / decided.length) * 100 : null;
    return { columns: ['Inspection', 'Date', 'Stage', 'Material', 'Supplier', 'Batch', 'Lot', 'Rejected', 'Rejection %', 'Result'], rows: ins.map((i) => ({ Inspection: String(i.number), Date: String(i.inspection_date), Stage: String(i.stage), Material: nm(ds.materials, i.material_id), Supplier: i.supplier_id ? nm(ds.suppliers, i.supplier_id) : '', Batch: String(i.batch_no ?? ''), Lot: Number(i.lot_qty), Rejected: Number(i.rejected_qty ?? 0), 'Rejection %': Number(i.lot_qty) ? +((Number(i.rejected_qty ?? 0) / Number(i.lot_qty)) * 100).toFixed(2) : null, Result: String(i.status) })),
      summary: [['Inspections', String(ins.length)], ['Lots accepted first time', pct(decided.length ? (decided.filter((i) => i.status !== 'failed' && !Number(i.rejected_qty)).length / decided.length) * 100 : null, 0)], ['Avg rejection per lot', pct(avgRej)]] };
  } },
  { id: 'utilization', title: 'Machine utilization', desc: 'Planned vs run time per machine', icon: Gauge, build: (ds, f) => {
    const reps = filterReports(ds, f);
    const rows = ds.machines.map((m) => { const rs = reps.filter((r) => r.machine_id === m.id); const planned = rs.reduce((a, r) => a + Number(r.planned_minutes), 0); const down = rs.reduce((a, r) => a + Number(r.downtime_minutes), 0); return { Machine: String(m.name), Line: nm(ds.lines, m.line_id), 'Planned hrs': +(planned / 60).toFixed(1), 'Downtime hrs': +(down / 60).toFixed(1), 'Run hrs': +((planned - down) / 60).toFixed(1), 'Utilization %': planned ? +(((planned - down) / planned) * 100).toFixed(1) : null }; }).filter((r) => r['Planned hrs']);
    return { columns: ['Machine', 'Line', 'Planned hrs', 'Downtime hrs', 'Run hrs', 'Utilization %'], rows, summary: [['Overall utilization', pct(machineUtilization(reps))]] };
  } },
  { id: 'oee', title: 'OEE report', desc: 'Availability, performance, quality and OEE by machine', icon: BarChart3, build: (ds, f) => {
    const m = new Map(ds.machines.map((x) => [x.id, x]));
    const reps = filterReports(ds, f);
    const g = groupAgg(reps, (r) => String(r.machine_id), m);
    const t = aggregate(reps, m);
    return { columns: ['Machine', 'Availability %', 'Performance %', 'Quality %', 'OEE %'], rows: g.map((x) => ({ Machine: nm(ds.machines, x.key), 'Availability %': x.oee ? +(x.oee.availability * 100).toFixed(1) : null, 'Performance %': x.oee ? +(x.oee.performance * 100).toFixed(1) : null, 'Quality %': x.oee ? +(x.oee.quality * 100).toFixed(1) : null, 'OEE %': x.oee ? +(x.oee.oee * 100).toFixed(1) : null })),
      summary: [['Plant OEE', pct(t.oee ? t.oee.oee * 100 : null)]] };
  } },
  { id: 'maintenance', title: 'Maintenance report', desc: 'Work orders, downtime and cost', icon: Wrench, build: (ds, f) => {
    const wos = ds.workOrders.filter((w) => String(w.created_at).slice(0, 10) >= f.from && String(w.created_at).slice(0, 10) <= f.to);
    const rows = wos.map((w) => { const parts = ((w.parts_used as LineItem[]) ?? []).reduce((a, p) => a + Number(p.qty) * Number(p.rate ?? 0), 0); return { WO: String(w.number), Machine: nm(ds.machines, w.machine_id), Type: String(w.wo_type), Priority: String(w.priority), Status: String(w.status), 'Downtime min': Number(w.downtime_minutes ?? 0), 'Parts cost': Math.round(parts), 'Labour cost': Number(w.labour_cost ?? 0) }; });
    return { columns: ['WO', 'Machine', 'Type', 'Priority', 'Status', 'Downtime min', 'Parts cost', 'Labour cost'], rows, summary: [['Work orders', String(rows.length)], ['Total cost', money(rows.reduce((a, r) => a + Number(r['Parts cost']) + Number(r['Labour cost']), 0))]] };
  } },
  { id: 'logistics', title: 'Logistics report', desc: 'Shipments, on-time delivery and freight', icon: Truck, build: (ds, f) => {
    const sh = ds.shipments.filter((s) => String(s.dispatch_date) >= f.from && String(s.dispatch_date) <= f.to);
    const rows = sh.map((s) => ({ DO: String(s.number), Customer: nm(ds.customers, s.customer_id), Destination: String(s.destination), Dispatched: String(s.dispatch_date), ETA: String(s.eta), Delivered: String(s.delivered_on ?? ''), 'On time': s.delivered_on ? (String(s.delivered_on) <= String(s.eta) ? 'Yes' : 'No') : '', Freight: Number(s.freight_cost ?? 0), 'E-way bill': String(s.eway_bill_no ?? ''), Status: String(s.status) }));
    const done = rows.filter((r) => r['On time']);
    return { columns: ['DO', 'Customer', 'Destination', 'Dispatched', 'ETA', 'Delivered', 'On time', 'Freight', 'E-way bill', 'Status'], rows, summary: [['On-time', pct(done.length ? (done.filter((r) => r['On time'] === 'Yes').length / done.length) * 100 : null, 0)], ['Freight', money(rows.reduce((a, r) => a + Number(r.Freight), 0))]] };
  } },
  { id: 'cost', title: 'Manufacturing cost report', desc: 'Recorded material + maintenance cost per good unit, by day', icon: Wallet, build: (ds, f) => {
    const mats = new Map(ds.materials.map((m) => [m.id, m]));
    const mach = new Map(ds.machines.map((x) => [x.id, x]));
    const days = new Map<string, { mat: number; maint: number; good: number }>();
    const get = (d: string) => days.get(d) ?? { mat: 0, maint: 0, good: 0 };
    for (const mv of ds.movements.filter((x) => x.reason === 'production_issue' && String(x.movement_date) >= f.from && String(x.movement_date) <= f.to)) {
      const e = get(String(mv.movement_date)); e.mat += Number(mv.qty) * Number(mv.unit_cost ?? mats.get(String(mv.material_id))?.standard_cost ?? 0); days.set(String(mv.movement_date), e);
    }
    for (const w of ds.workOrders.filter((x) => x.completed_at && String(x.completed_at).slice(0, 10) >= f.from)) {
      const d = String(w.completed_at).slice(0, 10); const e = get(d);
      e.maint += Number(w.labour_cost ?? 0) + ((w.parts_used as LineItem[]) ?? []).reduce((a, p) => a + Number(p.qty) * Number(p.rate ?? 0), 0); days.set(d, e);
    }
    for (const g of groupAgg(filterReports(ds, f), (r) => String(r.report_date), mach)) { const e = get(g.key); e.good += g.good; days.set(g.key, e); }
    const rows = [...days.entries()].sort().map(([d, e]) => ({ Date: d, 'Material cost': Math.round(e.mat), 'Maintenance cost': Math.round(e.maint), 'Good units': e.good, 'Cost / unit': e.good ? +((e.mat + e.maint) / e.good).toFixed(2) : null }));
    const tot = rows.reduce((a, r) => ({ c: a.c + Number(r['Material cost']) + Number(r['Maintenance cost']), g: a.g + Number(r['Good units']) }), { c: 0, g: 0 });
    return { columns: ['Date', 'Material cost', 'Maintenance cost', 'Good units', 'Cost / unit'], rows, summary: [['Cost per good unit', tot.g ? money(tot.c / tot.g) : '—']], note: 'Direct labour, energy and overheads are not captured and are excluded.' };
  } },
];

function avg(xs: (number | null)[]) { const v = xs.filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

const TABS = [{ id: 'catalog', label: 'Reports' }, { id: 'report_schedules', label: 'Scheduled reports' }, { id: 'history', label: 'Report history' }];

export default function Reports({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab, TABS);
  const { mode } = useApp();
  const route = useRoute();
  const rid = route.params.get('r');
  const report = REPORTS.find((r) => r.id === rid);
  return (
    <div className="space-y-5">
      <ModuleTabs module="reports" tabs={TABS} current={current} />
      {current === 'catalog' && (report ? <ReportView def={report} /> : <Catalog />)}
      {current === 'report_schedules' && (
        <div className="space-y-3">
          <InfoBox variant="amber">Schedules are stored here and executed by the automation backend (n8n cron → <code>report-dispatch</code> Edge Function), which renders the report and sends it by email or WhatsApp. {mode === 'demo' ? 'In demo mode no backend is connected, so scheduled reports are not sent.' : 'Check Settings → Automation for delivery status.'}</InfoBox>
          <EntityManager table="report_schedules" />
        </div>
      )}
      {current === 'history' && <History />}
    </div>
  );
}

function Catalog() {
  const runs = useQuery('report_runs', { orderBy: { key: 'created_at', dir: 'desc' }, limit: 200 });
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border shadow-card sm:grid-cols-2 xl:grid-cols-3">
      {REPORTS.map((r) => {
        const last = runs.rows.find((x) => x.report_type === r.title);
        return (
          <div key={r.id} className="flex flex-col bg-base-panel p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-base-border bg-base-subtle"><r.icon className="h-5 w-5 text-accent-blue" /></div>
              <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold leading-snug">{r.title}</h3><p className="mt-1 text-xs text-ink-muted">{r.desc}</p></div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted"><CalendarClock className="h-3.5 w-3.5" />Last exported: <span className="font-mono text-ink-primary">{last ? dateTime(last.created_at) : 'never'}</span></p>
            <div className="mt-4"><Button className="w-full" onClick={() => setParam('r', r.id)}>Open report</Button></div>
          </div>
        );
      })}
    </div>
  );
}

function ReportView({ def }: { def: ReportDef }) {
  const { company, can } = useApp();
  const { showToast } = useToast();
  const act = useActions();
  const [f, setF] = useState<OpsFilters>(defaultFilters(30));
  const look = Math.max(30, daysBetween(f.from, ymd()) + 1);
  const ds = useDataset(f, { lookbackDays: look });
  const built = useMemo(() => (ds.loading ? null : def.build(ds, f)), [ds, f, def]);
  const cols: ExportColumn<Row>[] = (built?.columns ?? []).map((c) => ({ label: c, value: (r) => r[c] }));
  const log = (format: string) => void act.insert('report_runs', { report_type: def.title, format, row_count: built?.rows.length ?? 0, period_from: f.from, period_to: f.to }, 'Report export logged', true).catch(() => undefined);
  const fname = `${company?.slug}-${def.id}-${f.from}-to-${f.to}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button tone="ghost" icon={ArrowLeft} onClick={() => setParam('r', null)}>All reports</Button>
        <h2 className="mr-auto text-lg font-semibold">{def.title}</h2>
        <Button tone="secondary" icon={Download} disabled={!built?.rows.length} onClick={() => { exportCsv(fname, built!.rows, cols); log('csv'); }}>Excel (CSV)</Button>
        <Button tone="secondary" icon={Printer} disabled={!built?.rows.length} onClick={() => {
          const ok = printReport({ title: def.title, subtitle: `${f.from} to ${f.to}`, company: company?.name ?? '', rows: built!.rows, cols, summary: built!.summary });
          if (ok) log('pdf'); else showToast('Allow pop-ups to print / save as PDF', 'warning');
        }}>PDF / print</Button>
        {can('reports', 'create') && <QuickCreate table="report_schedules" icon={CalendarClock} label="Schedule" stay initial={{ name: def.title, report_type: def.id, frequency: 'weekly', channel: 'email', send_time: '08:00', active: true }} />}
      </div>
      <OpsFilterBar value={f} onChange={setF} show={{ factory: true, line: ['production', 'utilization', 'oee', 'cost'].includes(def.id), shift: ['production', 'oee'].includes(def.id) }} />
      {!built ? <Spinner /> : (
        <Panel title={`${built.rows.length} rows`} subtitle={built.note}>
          {built.summary.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-base-border bg-base-subtle px-4 py-3">
              {built.summary.map(([k, v]) => <div key={k}><p className="text-[11px] text-ink-muted">{k}</p><p className="font-mono text-sm font-semibold">{v}</p></div>)}
            </div>
          )}
          {!built.rows.length ? <EmptyState title="No data for this period" /> : (
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-base-border bg-base-subtle"><tr>{built.columns.map((c) => <th key={c} className="th">{c}</th>)}</tr></thead>
                <tbody>
                  {built.rows.slice(0, 500).map((r, i) => (
                    <tr key={i} className="border-b border-base-border last:border-0">
                      {built.columns.map((c) => <td key={c} className={`td whitespace-nowrap ${typeof r[c] === 'number' ? 'text-right font-mono' : ''}`}>{r[c] === null ? '—' : typeof r[c] === 'number' ? qty(r[c]) : String(r[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {built.rows.length > 500 && <p className="px-4 py-2 text-xs text-ink-muted">Showing 500 of {built.rows.length} rows — export for the full data.</p>}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}

function History() {
  const runs = useQuery('report_runs', { orderBy: { key: 'created_at', dir: 'desc' }, limit: 100 });
  if (runs.loading && !runs.rows.length) return <Spinner />;
  return (
    <Panel title="Report history" subtitle="Every export is logged with who ran it and the period">
      {!runs.rows.length ? <EmptyState title="No reports exported yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['Report', 'Format', 'Period', 'Rows', 'Generated'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {runs.rows.map((r) => (
                <tr key={r.id} className="border-b border-base-border last:border-0">
                  <td className="td">{String(r.report_type)}</td>
                  <td className="td"><Badge variant={r.format === 'pdf' ? 'red' : 'green'}>{String(r.format)}</Badge></td>
                  <td className="td font-mono text-xs">{r.period_from ? `${r.period_from} → ${r.period_to}` : '—'}</td>
                  <td className="td font-mono">{String(r.row_count ?? '—')}</td>
                  <td className="td font-mono text-xs">{dateTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
