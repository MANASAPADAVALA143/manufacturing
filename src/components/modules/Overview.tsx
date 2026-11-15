import { useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ChevronRight, Info, Send } from 'lucide-react';
import { KpiCard, Panel, SectionTitle, Spinner, StatGrid } from '@/components/ui';
import { BarChart, CHART, LineChart } from '@/components/charts';
import { useApp } from '@/lib/app';
import { DEFAULT_COMPANY_SETTINGS } from '@/lib/data/schema';
import {
  aggregate, apPosition, dateRange, defaultFilters, dispatchPerformance, exceptions, filterReports, groupAgg, machineUtilization,
  maintenanceDue, movementSeries, OPEN_PO, shortDay, spendBySupplier, stockPosition, type OpsFilters,
} from '@/lib/analytics';
import { useOps } from '@/lib/useDataset';
import { money, pct, qty } from '@/lib/format';
import { navigate } from '@/lib/router';
import type { ModuleId } from '@/lib/types';
import { loadFilters, OpsFilterBar, saveFilters } from './shared';

const samplePrompts = ['What is today’s production?', 'Which machine has the highest downtime?', 'Which raw material will run out first?'];

const sevStyle = {
  critical: { dot: 'bg-accent-red', icon: AlertCircle, text: 'text-accent-red' },
  warning: { dot: 'bg-accent-amber', icon: AlertTriangle, text: 'text-accent-amber' },
  info: { dot: 'bg-accent-blue', icon: Info, text: 'text-accent-blue' },
};

export default function Overview() {
  const { company, can } = useApp();
  const [f, setF] = useState<OpsFilters>(() => loadFilters('overview', defaultFilters(30)));
  const update = (v: OpsFilters) => { setF(v); saveFilters('overview', v); };
  const { ds, machines } = useOps(f);
  const settings = useMemo(() => ({ ...DEFAULT_COMPANY_SETTINGS, ...(company?.settings ?? {}) }), [company]);
  const [input, setInput] = useState('');
  const [sev, setSev] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const m = useMemo(() => {
    const reports = filterReports(ds, f);
    const todays = filterReports(ds, f, f.to, f.to);
    const period = aggregate(reports, machines);
    const day = aggregate(todays, machines);
    const stock = stockPosition(ds, f);
    const ap = apPosition(ds);
    const days = dateRange(f.from, f.to);
    const byDay = new Map(groupAgg(reports, (r) => String(r.report_date), machines).map((g) => [g.key, g]));
    const lineName = new Map(ds.lines.map((l) => [l.id, String(l.name)]));
    const facName = new Map(ds.factories.map((x) => [x.id, String(x.name)]));
    const byLine = groupAgg(reports, (r) => String(r.line_id), machines).map((g) => ({ ...g, name: lineName.get(g.key) ?? '—' }));
    const lineFactory = new Map(ds.lines.map((l) => [l.id, String(l.factory_id)]));
    const byFactory = groupAgg(reports, (r) => lineFactory.get(String(r.line_id)) ?? '', machines).map((g) => ({ ...g, name: facName.get(g.key) ?? '—' }));
    const pendingPOs = ds.purchaseOrders.filter((p) => OPEN_PO.includes(String(p.status)));
    const due = maintenanceDue(ds, 7);
    const dispatch = dispatchPerformance(ds, f.from, f.to);
    const mv = movementSeries(ds, days, f);
    return {
      period, day, stock, ap, days, byDay, byLine, byFactory, pendingPOs, due, dispatch, mv,
      util: machineUtilization(reports),
      invValue: stock.reduce((s, x) => s + x.value, 0),
      low: stock.filter((s) => s.belowReorder),
      spend: spendBySupplier(ds, f.from, f.to).slice(0, 6),
      exc: exceptions(ds, f, settings),
    };
  }, [ds, f, machines, settings]);

  if (ds.loading) return <Spinner label="Loading plant data…" />;

  const oeePct = m.period.oee ? m.period.oee.oee * 100 : null;
  const sees = (id: ModuleId) => can(id, 'view');
  const go = (id: ModuleId, tab = '') => sees(id) && navigate(`/${id}${tab ? `/${tab}` : ''}`);
  const ask = (q: string) => navigate(`/assistant?q=${encodeURIComponent(q)}`);
  const shownExc = m.exc.filter((e) => sev === 'all' || e.severity === sev);

  const moduleCards: { name: string; metric: string; sub: string; id: ModuleId; tab?: string }[] = [
    { name: 'Sales & RFQ', id: 'sales', metric: String(ds.salesOrders.filter((s) => !['closed', 'cancelled', 'delivered'].includes(String(s.status))).length), sub: 'open sales orders' },
    { name: 'AP Automation', id: 'ap', metric: String(m.ap.open.length), sub: `open invoices · ${m.ap.exceptions.length} exceptions` },
    { name: 'Production', id: 'production', metric: pct(oeePct), sub: `OEE · ${m.byLine.filter((l) => l.oee && l.oee.oee * 100 < settings.oee_target_pct).length} lines below target` },
    { name: 'Quality', id: 'quality', metric: pct(m.period.rejectionPct === null ? null : 100 - m.period.rejectionPct), sub: `first-pass yield · ${ds.inspections.filter((i) => ['requested', 'in_progress'].includes(String(i.status))).length} inspections open` },
    { name: 'Inventory', id: 'inventory', metric: money(m.invValue, true), sub: `value · ${m.low.length} below reorder` },
    { name: 'Logistics', id: 'logistics', metric: pct(m.dispatch.onTimePct, 0), sub: `on-time · ${m.dispatch.late.length} delayed` },
  ];

  return (
    <div className="space-y-5">
      <OpsFilterBar value={f} onChange={update} />

      <StatGrid cols={6}>
        {sees('production') && <KpiCard label={`Production ${f.to === m.days[m.days.length - 1] ? 'on ' + shortDay(f.to) : ''}`} value={qty(m.day.good, 0)} unit="units" variant="green" sub={m.day.target ? `${pct(m.day.achievement, 0)} of ${qty(m.day.target, 0)} target` : 'No shift reports yet'} trend={m.day.achievement !== null ? (m.day.achievement >= settings.below_target_alert_pct ? 'up' : 'down') : undefined} onClick={() => go('production', 'shift_reports')} />}
        {sees('production') && <KpiCard label="Target achievement" value={pct(m.period.achievement, 0)} variant={m.period.achievement !== null && m.period.achievement < settings.below_target_alert_pct ? 'amber' : 'green'} sub={`${qty(m.period.good, 0)} good of ${qty(m.period.target, 0)}`} onClick={() => go('production')} />}
        {sees('production') && <KpiCard label="Machine utilization" value={pct(m.util)} sub={`${m.period.reports} shift reports`} onClick={() => go('production', 'oee')} />}
        {sees('production') && <KpiCard label="OEE" value={pct(oeePct)} variant={oeePct !== null && oeePct < settings.oee_target_pct ? 'amber' : 'green'} sub={m.period.oee ? `A ${pct(m.period.oee.availability * 100, 0)} · P ${pct(m.period.oee.performance * 100, 0)} · Q ${pct(m.period.oee.quality * 100, 0)}` : `Target ${settings.oee_target_pct}%`} onClick={() => go('production', 'oee')} />}
        {sees('inventory') && <KpiCard label="Inventory value" value={money(m.invValue, true)} sub={`${m.stock.filter((s) => s.onHand > 0).length} materials in stock`} onClick={() => go('inventory', 'stock')} />}
        {sees('inventory') && <KpiCard label="Low-stock materials" value={String(m.low.length)} variant={m.low.length ? 'red' : 'green'} sub={m.low[0] ? `${String(m.low[0].material.name)}${m.low.length > 1 ? ` +${m.low.length - 1}` : ''}` : 'All above reorder level'} onClick={() => go('inventory', 'reorder')} />}
        {sees('procurement') && <KpiCard label="Purchase orders pending" value={String(m.pendingPOs.length)} sub={`${m.pendingPOs.filter((p) => p.status === 'pending_approval').length} awaiting approval`} onClick={() => go('procurement', 'purchase_orders')} />}
        {sees('ap') && <KpiCard label="Outstanding supplier invoices" value={money(m.ap.outstanding, true)} variant={m.ap.overdue > 0 ? 'amber' : undefined} sub={`${money(m.ap.overdue, true)} overdue`} onClick={() => go('ap', 'ageing')} />}
        {sees('production') && <KpiCard label="Quality rejection" value={pct(m.period.rejectionPct)} variant={m.period.rejectionPct !== null && m.period.rejectionPct > settings.rejection_alert_pct ? 'red' : 'green'} sub={`${qty(m.period.rejected, 0)} units rejected`} onClick={() => go('quality')} />}
        {sees('production') && <KpiCard label="Machine downtime" value={qty(m.period.downtime / 60, 1)} unit="hrs" variant={m.period.planned && m.period.downtime / m.period.planned > 0.1 ? 'amber' : undefined} sub={m.period.planned ? `${pct((m.period.downtime / m.period.planned) * 100)} of planned time` : '—'} onClick={() => go('production', 'downtime')} />}
        {sees('maintenance') && <KpiCard label="Maintenance due (7 days)" value={String(m.due.length)} variant={m.due.some((d) => d.overdueDays > 0) ? 'red' : undefined} sub={`${m.due.filter((d) => d.overdueDays > 0).length} overdue`} onClick={() => go('maintenance', 'pm_schedules')} />}
        {sees('logistics') && <KpiCard label="Dispatch on-time" value={pct(m.dispatch.onTimePct, 0)} variant={m.dispatch.onTimePct !== null && m.dispatch.onTimePct < 95 ? 'amber' : 'green'} sub={`${m.dispatch.delivered} delivered · ${m.dispatch.late.length} late`} onClick={() => go('logistics')} />}
      </StatGrid>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {sees('production') && <Panel title="Production trend" subtitle="Good output vs target per day" className="xl:col-span-2">
          <div className="p-4">
            <LineChart labels={m.days.map(shortDay)} series={[
              { name: 'Good output', color: CHART.blue, values: m.days.map((d) => m.byDay.get(d)?.good ?? null) },
              { name: 'Target', color: CHART.slate, dashed: true, values: m.days.map((d) => m.byDay.get(d)?.target ?? null) },
            ]} />
          </div>
        </Panel>}
        <Panel className={sees('production') ? '' : 'xl:col-span-3'} title="Exception & alert centre" subtitle={`${m.exc.length} items need attention`}
          actions={<select aria-label="Severity" className="input h-8 w-auto py-0 text-xs" value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}>
            <option value="all">All</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option>
          </select>}>
          <ul className="max-h-[340px] divide-y divide-base-border overflow-y-auto">
            {shownExc.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-muted">No exceptions for this filter.</li>}
            {shownExc.map((e, i) => {
              const s = sevStyle[e.severity];
              return (
                <li key={i}>
                  <button onClick={() => navigate(e.link)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-base-hover">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink-primary">{e.title}</span>
                      <span className="mt-0.5 block text-xs text-ink-muted">{e.detail}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-faint">{e.module}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {sees('production') && <Panel title="Quality trend" subtitle="Rejection % per day">
          <div className="p-4">
            <LineChart labels={m.days.map(shortDay)} unit="%" target={{ value: settings.rejection_alert_pct, label: `Alert ${settings.rejection_alert_pct}%` }}
              series={[{ name: 'Rejection %', color: CHART.red, values: m.days.map((d) => m.byDay.get(d)?.rejectionPct ?? null) }]} />
          </div>
        </Panel>}
        {sees('inventory') && <Panel title="Inventory movement" subtitle="Value received vs issued (₹)">
          <div className="p-4">
            <BarChart labels={m.days.map(shortDay)} series={[
              { name: 'Stock in', color: CHART.teal, values: m.mv.inValues },
              { name: 'Stock out', color: CHART.amber, values: m.mv.outValues },
            ]} />
          </div>
        </Panel>}
        {sees('procurement') && <Panel title="Procurement spend" subtitle="PO value by supplier in period">
          <div className="p-4">
            {m.spend.length ? <BarChart horizontal labels={m.spend.map((s) => String(s.supplier?.name ?? '—'))} series={[{ name: 'Spend', color: CHART.navy, values: m.spend.map((s) => s.value) }]} /> : <p className="py-8 text-center text-sm text-ink-muted">No purchase orders in this period.</p>}
          </div>
        </Panel>}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {sees('production') && <Panel title="Plant-wise performance" subtitle={`OEE by plant and line · target ${settings.oee_target_pct}%`}>
          <div className="space-y-5 p-4">
            <BarChart horizontal unit="%" target={{ value: settings.oee_target_pct, label: 'Target' }} labels={m.byFactory.map((x) => x.name)} series={[{ name: 'OEE', color: CHART.blue, values: m.byFactory.map((x) => (x.oee ? x.oee.oee * 100 : 0)) }]} />
            <div className="border-t border-base-border pt-4">
              <BarChart horizontal unit="%" target={{ value: settings.oee_target_pct, label: 'Target' }} labels={m.byLine.map((x) => x.name)}
                series={[{ name: 'OEE', color: CHART.teal, values: m.byLine.map((x) => (x.oee ? x.oee.oee * 100 : 0)) }]} />
            </div>
          </div>
        </Panel>}

        <div>
          <SectionTitle>Module status</SectionTitle>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border shadow-card sm:grid-cols-2">
            {moduleCards.filter((c) => can(c.id, 'view')).map((c) => (
              <button key={c.name} onClick={() => go(c.id)} className="group bg-base-panel p-4 text-left transition-colors hover:bg-base-hover">
                <span className="text-sm font-semibold text-ink-primary">{c.name}</span>
                <p className="mt-2 font-mono text-xl font-semibold text-ink-primary">{c.metric}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{c.sub}</p>
                <span className="mt-2 flex items-center gap-1 text-xs text-ink-muted group-hover:text-accent-blue">Open module <ChevronRight className="h-3.5 w-3.5" /></span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {can('assistant', 'view') && (
        <div className="rounded-xl border border-base-border bg-base-panel p-4 shadow-card sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-blue/10 font-mono text-sm font-bold text-accent-blue">AI</span>
            <div>
              <p className="text-sm font-semibold text-ink-primary">Ask about your operations</p>
              <p className="text-xs text-ink-muted">Answers are computed from your company’s records, with sources.</p>
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) ask(input.trim()); }} className="mt-4 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your question…" aria-label="Ask the AI assistant" className="input min-w-0 flex-1" />
            <button type="submit" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-blue px-4 font-medium text-white hover:bg-blue-700"><Send className="h-4 w-4" /><span className="hidden sm:inline">Ask</span></button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {samplePrompts.map((p) => (
              <button key={p} onClick={() => ask(p)} className="rounded-full border border-base-border px-3 py-1.5 text-xs text-ink-muted hover:border-accent-blue hover:text-accent-blue">{p}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
