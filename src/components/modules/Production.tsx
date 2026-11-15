import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Clock, Maximize2, Minimize2, TrendingDown, TrendingUp, Wrench } from 'lucide-react';
import { Badge, Button, InfoBox, Panel, Spinner, StatCard, StatGrid } from '@/components/ui';
import EntityManager, { StatusBadge } from '@/components/data/EntityManager';
import { BarChart, CHART, LineChart } from '@/components/charts';
import { useApp } from '@/lib/app';
import { entity } from '@/lib/data/entities';
import { DEFAULT_COMPANY_SETTINGS, type BaseRow } from '@/lib/data/schema';
import { aggregate, dateRange, defaultFilters, filterReports, groupAgg, machineUtilization, shortDay, type OpsFilters } from '@/lib/analytics';
import { useOps } from '@/lib/useDataset';
import { addDays, daysBetween, ymd } from '@/lib/dates';
import { humanize, money, pct, qty } from '@/lib/format';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { loadFilters, ModuleTabs, OpsFilterBar, saveFilters, useModuleTab } from './shared';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'production_orders', label: 'Production orders' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'shift_reports', label: 'Shift reports' },
  { id: 'oee', label: 'OEE' },
  { id: 'downtime', label: 'Downtime' },
  { id: 'consumption', label: 'Consumption & WIP' },
  { id: 'andon', label: 'Andon board' },
];

export default function Production({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab, TABS);
  const [f, setF] = useState<OpsFilters>(() => loadFilters('production', defaultFilters(7)));
  const update = (v: OpsFilters) => { setF(v); saveFilters('production', v); };
  const analytic = ['dashboard', 'oee', 'downtime', 'consumption'].includes(current);
  return (
    <div className="space-y-5">
      <ModuleTabs module="production" tabs={TABS} current={current} />
      {analytic && <OpsFilterBar value={f} onChange={update} />}
      {current === 'dashboard' && <Dashboard f={f} />}
      {current === 'production_orders' && <EntityManager table="production_orders" detailExtra={(r) => <OrderProgress o={r} />} />}
      {current === 'schedule' && <Schedule />}
      {current === 'shift_reports' && (
        <div className="space-y-3">
          <InfoBox>Supervisors on the floor can use the mobile <button className="font-medium text-accent-blue underline" onClick={() => navigate('/field/shift')}>shift report workflow</button>. Reports update production orders, post good output to finished goods, and trigger below-target / high-rejection alerts.</InfoBox>
          <EntityManager table="shift_reports" />
        </div>
      )}
      {current === 'oee' && <OeeView f={f} />}
      {current === 'downtime' && <Downtime f={f} />}
      {current === 'consumption' && <Consumption f={f} />}
      {current === 'andon' && <Andon />}
    </div>
  );
}

function useSettings() {
  const { company } = useApp();
  return { ...DEFAULT_COMPANY_SETTINGS, ...(company?.settings ?? {}) };
}

function Dashboard({ f }: { f: OpsFilters }) {
  const { ds, machines } = useOps(f);
  const settings = useSettings();
  const m = useMemo(() => {
    const reports = filterReports(ds, f);
    const today = filterReports(ds, f, f.to, f.to);
    const prev = filterReports(ds, f, addDays(f.from, -(daysBetween(f.from, f.to) + 1)), addDays(f.from, -1));
    const lines = ds.lines.filter((l) => (!f.factoryId || l.factory_id === f.factoryId) && (!f.lineId || l.id === f.lineId));
    return { period: aggregate(reports, machines), today: aggregate(today, machines), prev: aggregate(prev, machines), lines, reports };
  }, [ds, f, machines]);
  if (ds.loading) return <Spinner />;
  const active = ds.productionOrders.filter((o) => ['released', 'in_progress'].includes(String(o.status)));
  const oee = m.period.oee ? m.period.oee.oee * 100 : null;
  const prevOee = m.prev.oee ? m.prev.oee.oee * 100 : null;
  const insights: { icon: typeof Wrench; text: string; tone: 'amber' | 'red' | 'blue' | 'green' }[] = [];
  const byLine = groupAgg(m.reports, (r) => String(r.line_id), machines);
  const worst = [...byLine].filter((g) => g.oee).sort((a, b) => a.oee!.oee - b.oee!.oee)[0];
  if (worst && worst.oee!.oee * 100 < settings.oee_target_pct) {
    const reasons = groupAgg(m.reports.filter((r) => r.line_id === worst.key), (r) => String(r.downtime_reason ?? 'none'), machines).sort((a, b) => b.downtime - a.downtime);
    insights.push({ icon: Wrench, tone: 'amber', text: `${ds.lines.find((l) => l.id === worst.key)?.name} OEE is ${(worst.oee!.oee * 100).toFixed(1)}% (target ${settings.oee_target_pct}%). Availability ${(worst.oee!.availability * 100).toFixed(0)}%, performance ${(worst.oee!.performance * 100).toFixed(0)}%, quality ${(worst.oee!.quality * 100).toFixed(0)}%. Largest downtime cause: ${humanize(reasons[0]?.key)} (${reasons[0]?.downtime ?? 0} min).` });
  }
  const byShift = groupAgg(m.reports, (r) => String(r.shift_id), machines).filter((g) => g.achievement !== null).sort((a, b) => b.achievement! - a.achievement!);
  if (byShift.length > 1 && byShift[0].achievement! - byShift[byShift.length - 1].achievement! > 5) {
    const nm = (id: string) => ds.shifts.find((s) => s.id === id)?.name;
    insights.push({ icon: TrendingUp, tone: 'blue', text: `${nm(byShift[0].key)} achieves ${byShift[0].achievement!.toFixed(0)}% of target vs ${byShift[byShift.length - 1].achievement!.toFixed(0)}% for ${nm(byShift[byShift.length - 1].key)}. Compare changeover practice and staffing.` });
  }
  const behind = active.map((o) => {
    const days = Math.max(1, daysBetween(String(o.planned_start), String(o.planned_end)) + 1);
    const elapsed = Math.min(days, Math.max(0, daysBetween(String(o.planned_start), ymd()) + 1));
    const expected = (Number(o.planned_qty) * elapsed) / days;
    return { o, gap: expected - Number(o.produced_qty ?? 0), expected };
  }).filter((x) => x.gap > Number(x.o.planned_qty) * 0.05).sort((a, b) => b.gap - a.gap);
  if (behind[0]) insights.push({ icon: AlertTriangle, tone: 'red', text: `${behind[0].o.number} (${ds.materials.find((x) => x.id === behind[0].o.product_id)?.name}) is ${qty(behind[0].gap, 0)} units behind its planned run-rate.` });
  if (!insights.length) insights.push({ icon: TrendingUp, tone: 'green', text: 'All lines are at or above target for the selected period.' });

  const def = entity('production_orders');
  return (
    <div className="space-y-5">
      <StatGrid cols={5}>
        <StatCard label={`Good output ${shortDay(f.to)}`} value={qty(m.today.good, 0)} sub={m.today.target ? `${pct(m.today.achievement, 0)} of target` : 'No reports'} />
        <StatCard label="OEE (period)" value={pct(oee)} variant={oee !== null && oee < settings.oee_target_pct ? 'amber' : 'green'} sub={prevOee !== null && oee !== null ? `${oee >= prevOee ? '▲' : '▼'} ${Math.abs(oee - prevOee).toFixed(1)} pts vs previous` : undefined} />
        <StatCard label="Downtime (period)" value={`${qty(m.period.downtime / 60, 1)} h`} variant="amber" />
        <StatCard label="Rejection rate" value={pct(m.period.rejectionPct)} variant={m.period.rejectionPct !== null && m.period.rejectionPct > settings.rejection_alert_pct ? 'red' : 'green'} />
        <StatCard label="Production vs target" value={pct(m.period.achievement, 0)} variant={m.period.achievement !== null && m.period.achievement < settings.below_target_alert_pct ? 'amber' : 'green'} />
      </StatGrid>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Production lines status</h3>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border shadow-card md:grid-cols-2 xl:grid-cols-4">
          {m.lines.map((line) => {
            const rs = m.reports.filter((r) => r.line_id === line.id);
            const g = aggregate(rs, machines);
            const lo = g.oee ? g.oee.oee * 100 : null;
            const lineMachines = ds.machines.filter((x) => x.line_id === line.id);
            const down = lineMachines.find((x) => x.status === 'breakdown');
            const warn = down || (lo !== null && lo < settings.oee_target_pct);
            const latest = [...rs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
            return (
              <div key={line.id} className="bg-base-panel p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{String(line.name)}</span>
                  <Badge variant={down ? 'red' : warn ? 'amber' : 'green'}>{down ? 'DOWN' : warn ? 'WARNING' : 'RUNNING'}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div><p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">OEE</p><p className={`mt-1 font-mono text-lg font-semibold ${warn ? 'text-accent-amber' : 'text-accent-green'}`}>{pct(lo)}</p></div>
                  <div><p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">Good output</p><p className="mt-1 font-mono text-lg font-semibold">{qty(g.good, 0)}</p></div>
                </div>
                {latest && <p className="mt-3 flex items-center gap-1 text-xs text-ink-muted"><Clock className="h-3.5 w-3.5" />Last report {shortDay(String(latest.report_date))} · {String(ds.shifts.find((s) => s.id === latest.shift_id)?.name ?? '')}</p>}
                <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 ${warn ? 'border-accent-amber/30 bg-accent-amber/5' : 'border-base-border bg-base-subtle'}`}>
                  {warn ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" /> : <Activity className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />}
                  <span className={`text-xs leading-relaxed ${warn ? 'text-accent-amber' : 'text-ink-muted'}`}>
                    {down ? `${down.name} is in breakdown` : lo !== null && lo < settings.oee_target_pct ? `OEE below ${settings.oee_target_pct}% — downtime ${g.downtime} min` : rs.length ? 'On schedule' : 'No reports in period'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Panel title="Active production orders" actions={<Button size="sm" tone="secondary" onClick={() => navigate('/production/production_orders')}>All orders</Button>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['Order', 'Product', 'Planned', 'Produced', 'Variance vs plan-to-date', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {active.map((o) => {
                const b = behind.find((x) => x.o.id === o.id);
                const days = Math.max(1, daysBetween(String(o.planned_start), String(o.planned_end)) + 1);
                const elapsed = Math.min(days, Math.max(0, daysBetween(String(o.planned_start), ymd()) + 1));
                const variance = Number(o.produced_qty ?? 0) - (Number(o.planned_qty) * elapsed) / days;
                return (
                  <tr key={o.id} onClick={() => navigate(routeFor('production_orders', o.id))} className="cursor-pointer border-b border-base-border last:border-0 hover:bg-base-hover">
                    <td className="td font-mono">{String(o.number)}</td>
                    <td className="td">{String(ds.materials.find((x) => x.id === o.product_id)?.name ?? '—')}</td>
                    <td className="td text-right font-mono">{qty(o.planned_qty, 0)}</td>
                    <td className="td text-right font-mono">{qty(o.produced_qty, 0)}</td>
                    <td className={`td text-right font-mono ${variance < 0 ? 'text-accent-red' : 'text-accent-green'}`}>
                      <span className="inline-flex items-center gap-1">{variance < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}{variance > 0 ? '+' : ''}{qty(variance, 0)}</span>
                    </td>
                    <td className="td"><StatusBadge def={def} value={b ? 'in_progress' : o.status} /></td>
                  </tr>
                );
              })}
              {!active.length && <tr><td colSpan={6} className="td py-8 text-center text-ink-muted">No released orders</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Production insights <span className="font-normal">(rule-based analysis of the selected period)</span></h3>
        <div className="space-y-3">
          {insights.map((i, k) => {
            const st = { amber: 'border-accent-amber/30 bg-accent-amber/5 text-accent-amber', red: 'border-accent-red/30 bg-accent-red/5 text-accent-red', blue: 'border-accent-blue/30 bg-accent-blue/5 text-accent-blue', green: 'border-accent-green/30 bg-accent-green/5 text-accent-green' }[i.tone];
            return (
              <div key={k} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${st}`}>
                <i.icon className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm leading-relaxed text-ink-primary">{i.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function OrderProgress({ o }: { o: BaseRow }) {
  const planned = Number(o.planned_qty), done = Number(o.produced_qty ?? 0), rej = Number(o.rejected_qty ?? 0);
  return (
    <div>
      <div className="flex justify-between text-xs text-ink-muted"><span>Progress</span><span className="font-mono">{qty(done, 0)} / {qty(planned, 0)} · scrap {qty(rej, 0)}</span></div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-base-hover"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${Math.min(100, (done / planned) * 100)}%` }} /></div>
    </div>
  );
}

function Schedule() {
  const { ds } = useOps(defaultFilters(30));
  const start = addDays(ymd(), -14);
  const days = dateRange(start, addDays(ymd(), 21));
  if (ds.loading) return <Spinner />;
  const orders = ds.productionOrders.filter((o) => !['cancelled', 'closed'].includes(String(o.status)) && String(o.planned_end) >= start);
  const colors: Record<string, string> = { planned: '#94A3B8', released: '#2563EB', in_progress: '#D97706', completed: '#0D9488' };
  return (
    <Panel title="Production schedule" subtitle="Orders by line, 2 weeks back to 3 weeks ahead. Bar fill = completion.">
      <div className="overflow-x-auto">
        <div className="min-w-[860px] p-4">
          <div className="ml-48 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
            {days.map((d) => <div key={d} className={`text-center font-mono text-[9px] ${d === ymd() ? 'font-bold text-accent-blue' : 'text-ink-faint'}`}>{d.slice(8)}</div>)}
          </div>
          {ds.lines.map((line) => (
            <div key={line.id} className="mt-2">
              <p className="mb-1 text-xs font-semibold text-ink-muted">{String(line.name)}</p>
              {orders.filter((o) => o.line_id === line.id).map((o) => {
                const s = Math.max(0, daysBetween(start, String(o.planned_start)));
                const e = Math.min(days.length - 1, daysBetween(start, String(o.planned_end)));
                const prog = Math.min(1, Number(o.produced_qty ?? 0) / Number(o.planned_qty));
                return (
                  <button key={o.id} onClick={() => navigate(routeFor('production_orders', o.id))} className="flex w-full items-center hover:opacity-90">
                    <span className="w-48 shrink-0 truncate pr-2 text-left text-xs"><span className="font-mono">{String(o.number)}</span> · {String(ds.materials.find((x) => x.id === o.product_id)?.name ?? '')}</span>
                    <span className="relative grid h-6 flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0,1fr))` }}>
                      {e >= s && (
                        <span className="relative overflow-hidden rounded" style={{ gridColumn: `${s + 1} / ${e + 2}`, background: `${colors[String(o.status)] ?? '#94A3B8'}33`, border: `1px solid ${colors[String(o.status)] ?? '#94A3B8'}` }}>
                          <span className="absolute inset-y-0 left-0" style={{ width: `${prog * 100}%`, background: colors[String(o.status)] ?? '#94A3B8', opacity: 0.6 }} />
                          <span className="relative px-1 font-mono text-[10px] leading-6">{Math.round(prog * 100)}%</span>
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
              {!orders.some((o) => o.line_id === line.id) && <p className="ml-48 text-xs text-ink-faint">No orders scheduled</p>}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function OeeView({ f }: { f: OpsFilters }) {
  const { ds, machines } = useOps(f);
  const settings = useSettings();
  const [by, setBy] = useState<'line' | 'machine' | 'shift' | 'product'>('machine');
  if (ds.loading) return <Spinner />;
  const reports = filterReports(ds, f);
  const keyFn = { line: (r: BaseRow) => String(r.line_id), machine: (r: BaseRow) => String(r.machine_id), shift: (r: BaseRow) => String(r.shift_id), product: (r: BaseRow) => String(r.product_id ?? '') }[by];
  const nameOf = (k: string) => String((by === 'line' ? ds.lines : by === 'machine' ? ds.machines : by === 'shift' ? ds.shifts : ds.materials).find((x) => x.id === k)?.name ?? '—');
  const groups = groupAgg(reports, keyFn, machines).sort((a, b) => (a.oee?.oee ?? 0) - (b.oee?.oee ?? 0));
  const days = dateRange(f.from, f.to);
  const byDay = new Map(groupAgg(reports, (r) => String(r.report_date), machines).map((g) => [g.key, g]));
  return (
    <div className="space-y-5">
      <Panel title="OEE trend" subtitle="OEE = Availability × Performance × Quality">
        <div className="p-4">
          <LineChart labels={days.map(shortDay)} unit="%" target={{ value: settings.oee_target_pct, label: `Target ${settings.oee_target_pct}%` }} series={[
            { name: 'OEE', color: CHART.blue, values: days.map((d) => (byDay.get(d)?.oee ? byDay.get(d)!.oee!.oee * 100 : null)) },
            { name: 'Availability', color: CHART.teal, values: days.map((d) => (byDay.get(d)?.oee ? byDay.get(d)!.oee!.availability * 100 : null)) },
            { name: 'Performance', color: CHART.amber, values: days.map((d) => (byDay.get(d)?.oee ? byDay.get(d)!.oee!.performance * 100 : null)) },
          ]} />
        </div>
      </Panel>
      <Panel title="OEE breakdown" actions={
        <select aria-label="Group by" className="input h-8 w-auto py-0 text-xs" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="machine">By machine</option><option value="line">By line</option><option value="shift">By shift</option><option value="product">By product</option>
        </select>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['Name', 'Reports', 'Target', 'Actual', 'Good', 'Rejected', 'Downtime', 'Utilization', 'A', 'P', 'Q', 'OEE'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {groups.map((g) => {
                const o = g.oee ? g.oee.oee * 100 : null;
                return (
                  <tr key={g.key} className="border-b border-base-border last:border-0">
                    <td className="td font-medium">{nameOf(g.key)}</td>
                    <td className="td font-mono">{g.reports}</td>
                    <td className="td font-mono">{qty(g.target, 0)}</td>
                    <td className="td font-mono">{qty(g.actual, 0)}</td>
                    <td className="td font-mono">{qty(g.good, 0)}</td>
                    <td className="td font-mono">{qty(g.rejected, 0)}</td>
                    <td className="td font-mono">{qty(g.downtime, 0)} min</td>
                    <td className="td font-mono">{pct(machineUtilization(reports.filter((r) => keyFn(r) === g.key)))}</td>
                    <td className="td font-mono">{pct(g.oee ? g.oee.availability * 100 : null, 0)}</td>
                    <td className="td font-mono">{pct(g.oee ? g.oee.performance * 100 : null, 0)}</td>
                    <td className="td font-mono">{pct(g.oee ? g.oee.quality * 100 : null, 1)}</td>
                    <td className={`td font-mono font-semibold ${o !== null && o < settings.oee_target_pct ? 'text-accent-amber' : 'text-accent-green'}`}>{pct(o)}</td>
                  </tr>
                );
              })}
              {!groups.length && <tr><td colSpan={12} className="td py-8 text-center text-ink-muted">No shift reports in this period</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Downtime({ f }: { f: OpsFilters }) {
  const { ds, machines } = useOps(f);
  if (ds.loading) return <Spinner />;
  const reports = filterReports(ds, f).filter((r) => Number(r.downtime_minutes) > 0);
  const byReason = groupAgg(reports, (r) => String(r.downtime_reason ?? 'other'), machines).sort((a, b) => b.downtime - a.downtime);
  const byMachine = groupAgg(reports, (r) => String(r.machine_id), machines).sort((a, b) => b.downtime - a.downtime);
  const total = byReason.reduce((s, x) => s + x.downtime, 0);
  let cum = 0;
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="Downtime by reason (Pareto)" subtitle={`${qty(total / 60, 1)} hours total`}>
        <ul className="divide-y divide-base-border">
          {byReason.map((g) => {
            cum += g.downtime;
            return (
              <li key={g.key} className="px-4 py-3">
                <div className="flex justify-between text-sm"><span>{humanize(g.key)}</span><span className="font-mono">{qty(g.downtime, 0)} min · {pct((g.downtime / total) * 100, 0)} · cum {pct((cum / total) * 100, 0)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-base-hover"><div className="h-full rounded-full bg-accent-amber" style={{ width: `${(g.downtime / (byReason[0]?.downtime || 1)) * 100}%` }} /></div>
              </li>
            );
          })}
        </ul>
      </Panel>
      <Panel title="Downtime by machine">
        <div className="p-4"><BarChart horizontal labels={byMachine.map((g) => String(ds.machines.find((x) => x.id === g.key)?.name ?? '—'))} series={[{ name: 'Minutes', color: CHART.red, values: byMachine.map((g) => g.downtime) }]} unit=" min" /></div>
      </Panel>
    </div>
  );
}

function Consumption({ f }: { f: OpsFilters }) {
  const { ds } = useOps(f);
  if (ds.loading) return <Spinner />;
  const wh = new Map(ds.warehouses.map((w) => [w.id, w]));
  const inScope = (w: unknown) => !f.factoryId || wh.get(String(w))?.factory_id === f.factoryId;
  const mv = ds.movements.filter((m) => String(m.movement_date) >= f.from && String(m.movement_date) <= f.to && inScope(m.warehouse_id));
  const issues = new Map<string, number>(), output = new Map<string, number>();
  for (const m of mv) {
    if (m.reason === 'production_issue') issues.set(String(m.material_id), (issues.get(String(m.material_id)) ?? 0) + Number(m.qty));
    if (m.reason === 'production_output') output.set(String(m.material_id), (output.get(String(m.material_id)) ?? 0) + Number(m.qty));
  }
  const mat = new Map(ds.materials.map((m) => [m.id, m]));
  const wip = ds.productionOrders.filter((o) => o.status === 'in_progress');
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Panel title="Raw material consumption" subtitle="Production issues in period">
        <ul className="divide-y divide-base-border">
          {[...issues.entries()].sort((a, b) => b[1] - a[1]).map(([id, q]) => (
            <li key={id} className="flex justify-between gap-2 px-4 py-2.5 text-sm"><span className="truncate">{String(mat.get(id)?.name)}</span><span className="shrink-0 font-mono">{qty(q, 0)} {String(mat.get(id)?.uom ?? '')} · {money(q * Number(mat.get(id)?.standard_cost ?? 0), true)}</span></li>
          ))}
          {!issues.size && <li className="px-4 py-6 text-center text-sm text-ink-muted">No issues recorded</li>}
        </ul>
      </Panel>
      <Panel title="Work in progress" subtitle="Orders in progress — planned minus good output">
        <ul className="divide-y divide-base-border">
          {wip.map((o) => (
            <li key={o.id}><button onClick={() => navigate(routeFor('production_orders', o.id))} className="flex w-full justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-base-hover">
              <span className="truncate"><span className="font-mono">{String(o.number)}</span> · {String(mat.get(String(o.product_id))?.name)}</span>
              <span className="shrink-0 font-mono">{qty(Math.max(0, Number(o.planned_qty) - Number(o.produced_qty ?? 0)), 0)} open</span>
            </button></li>
          ))}
          {!wip.length && <li className="px-4 py-6 text-center text-sm text-ink-muted">No orders in progress</li>}
        </ul>
      </Panel>
      <Panel title="Finished goods produced" subtitle="Good output posted to stock in period">
        <ul className="divide-y divide-base-border">
          {[...output.entries()].map(([id, q]) => (
            <li key={id} className="flex justify-between gap-2 px-4 py-2.5 text-sm"><span className="truncate">{String(mat.get(id)?.name)}</span><span className="shrink-0 font-mono">{qty(q, 0)} · {money(q * Number(mat.get(id)?.standard_cost ?? 0), true)}</span></li>
          ))}
          {!output.size && <li className="px-4 py-6 text-center text-sm text-ink-muted">No output posted</li>}
        </ul>
      </Panel>
    </div>
  );
}

function Andon() {
  const { ds, machines } = useOps(defaultFilters(1));
  const settings = useSettings();
  const [full, setFull] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const t = setInterval(() => window.dispatchEvent(new CustomEvent('gnanova:data-changed', { detail: { table: 'shift_reports' } })), 60_000);
    return () => clearInterval(t);
  }, []);
  if (ds.loading) return <Spinner />;
  const today = ymd();
  const list = ds.machines.filter((mc) => Number(mc.ideal_cycle_time_sec) > 1);
  const board = (
    <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${full ? 'p-4' : ''}`}>
      {list.map((mc) => {
        const rs = ds.shiftReports.filter((r) => r.machine_id === mc.id && r.report_date === today);
        const g = aggregate(rs, machines);
        const o = g.oee ? g.oee.oee * 100 : null;
        const open = ds.workOrders.filter((w) => w.machine_id === mc.id && ['open', 'assigned', 'in_progress', 'on_hold'].includes(String(w.status)));
        const state = mc.status === 'breakdown' ? 'red' : mc.status === 'maintenance' ? 'amber' : !rs.length ? 'grey' : (o ?? 100) < settings.oee_target_pct || (g.achievement ?? 100) < settings.below_target_alert_pct ? 'amber' : 'green';
        const bg = { red: 'bg-accent-red', amber: 'bg-accent-amber', green: 'bg-accent-green', grey: 'bg-slate-500' }[state];
        return (
          <div key={mc.id} className={`overflow-hidden rounded-xl text-white shadow-card ${bg}`}>
            <div className="flex items-center justify-between bg-black/15 px-4 py-2">
              <span className="truncate text-sm font-semibold">{String(mc.name)}</span>
              <span className="font-mono text-xs uppercase">{mc.status === 'breakdown' ? 'BREAKDOWN' : mc.status === 'maintenance' ? 'MAINTENANCE' : !rs.length ? 'NO REPORT' : state === 'amber' ? 'BELOW TARGET' : 'ON TARGET'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 py-3 text-center">
              <div><p className="text-[10px] uppercase opacity-80">Output</p><p className="font-mono text-2xl font-bold">{qty(g.good, 0)}</p><p className="text-[10px] opacity-80">of {qty(g.target, 0)}</p></div>
              <div><p className="text-[10px] uppercase opacity-80">OEE</p><p className="font-mono text-2xl font-bold">{o === null ? '—' : o.toFixed(0)}</p><p className="text-[10px] opacity-80">%</p></div>
              <div><p className="text-[10px] uppercase opacity-80">Down</p><p className="font-mono text-2xl font-bold">{g.downtime}</p><p className="text-[10px] opacity-80">min</p></div>
            </div>
            {open.length > 0 && <p className="bg-black/10 px-4 py-1.5 text-xs">{open.length} open work order{open.length > 1 ? 's' : ''}: {String(open[0].description).slice(0, 60)}</p>}
          </div>
        );
      })}
    </div>
  );
  if (full) {
    return (
      <div className="fixed inset-0 z-[65] overflow-y-auto bg-navy-950">
        <div className="flex items-center justify-between px-4 py-3 text-white">
          <p className="font-semibold">Andon · {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
          <Button tone="secondary" icon={Minimize2} onClick={() => setFull(false)}>Exit</Button>
        </div>
        {board}
      </div>
    );
  }
  return (
    <Panel title="Live Andon board" subtitle={`Today’s status per machine · refreshes every minute · ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`} actions={<Button size="sm" tone="secondary" icon={Maximize2} onClick={() => setFull(true)}>Full screen</Button>}>
      <div className="p-4">{board}</div>
    </Panel>
  );
}
