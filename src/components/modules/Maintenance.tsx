import { useMemo } from 'react';
import { AlertTriangle, CalendarClock, Eye, Siren, Wrench } from 'lucide-react';
import { Badge, Button, InfoBox, Panel, Spinner, StatCard, StatGrid } from '@/components/ui';
import EntityManager, { StatusBadge } from '@/components/data/EntityManager';
import { QuickCreate } from '@/components/data/QuickCreate';
import { BarChart, CHART } from '@/components/charts';
import { entity } from '@/lib/data/entities';
import { useQuery } from '@/lib/data/hooks';
import type { BaseRow, LineItem } from '@/lib/data/schema';
import { defaultFilters, machineHealth, maintenanceDue, OPEN_WO } from '@/lib/analytics';
import { useOps } from '@/lib/useDataset';
import { daysBetween, ymd } from '@/lib/dates';
import { date, money, qty } from '@/lib/format';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { ModuleTabs, useModuleTab } from './shared';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'work_orders', label: 'Work orders' },
  { id: 'pm_schedules', label: 'Preventive schedules' },
  { id: 'machines', label: 'Machines & equipment' },
  { id: 'technicians', label: 'Technician allocation' },
  { id: 'history', label: 'History & cost' },
];

export default function Maintenance({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab, TABS);
  return (
    <div className="space-y-5">
      <ModuleTabs module="maintenance" tabs={TABS} current={current} />
      {current === 'dashboard' && <Dashboard />}
      {current === 'work_orders' && (
        <div className="space-y-3">
          <InfoBox>Technicians can update their assigned work orders, record spares and upload photos from the mobile <button className="font-medium text-accent-blue underline" onClick={() => navigate('/field/technician')}>technician workflow</button>.</InfoBox>
          <EntityManager table="work_orders" toolbarExtra={<BreakdownButton />} detailExtra={(r) => <WoCost wo={r} />} />
        </div>
      )}
      {current === 'pm_schedules' && <EntityManager table="pm_schedules" rowActions={(r) => <PmToWo pm={r} />} detailExtra={(r) => <PmDue pm={r} />} />}
      {current === 'machines' && <EntityManager table="machines" rowActions={(r) => <BreakdownButton machine={r} />} detailExtra={(r) => <MachineHistory machine={r} />} />}
      {current === 'technicians' && <Technicians />}
      {current === 'history' && <History />}
    </div>
  );
}

function BreakdownButton({ machine }: { machine?: BaseRow }) {
  return (
    <QuickCreate table="work_orders" tone="secondary" icon={Siren} label="Report breakdown" title="Report machine breakdown"
      initial={{ wo_type: 'breakdown', priority: 'critical', machine_id: machine?.id, due_date: ymd() }} />
  );
}

function PmToWo({ pm }: { pm: BaseRow }) {
  const open = useQuery('work_orders', { where: { pm_schedule_id: pm.id, status: OPEN_WO } });
  if (open.rows.length) return <Button tone="secondary" onClick={() => navigate(routeFor('work_orders', open.rows[0].id))}>Open {String(open.rows[0].number)}</Button>;
  return <QuickCreate table="work_orders" label="Create work order" initial={{ wo_type: 'preventive', priority: String(pm.next_due) < ymd() ? 'high' : 'medium', machine_id: pm.machine_id, description: pm.task, assigned_to: pm.technician_id, due_date: pm.next_due, pm_schedule_id: pm.id }} />;
}

function PmDue({ pm }: { pm: BaseRow }) {
  const d = daysBetween(ymd(), String(pm.next_due));
  return <InfoBox variant={d < 0 ? 'red' : d <= 3 ? 'amber' : 'green'}>{d < 0 ? `Overdue by ${-d} days` : d === 0 ? 'Due today' : `Due in ${d} days`} · every {String(pm.frequency_days)} days</InfoBox>;
}

function WoCost({ wo }: { wo: BaseRow }) {
  const parts = ((wo.parts_used as LineItem[]) ?? []).reduce((s, p) => s + Number(p.qty) * Number(p.rate ?? 0), 0);
  const labour = Number(wo.labour_cost ?? 0);
  return (
    <div className="grid grid-cols-3 gap-2">
      {[['Parts', money(parts)], ['Labour', money(labour)], ['Downtime', `${qty(wo.downtime_minutes ?? 0, 0)} min`]].map(([k, v]) => (
        <div key={k} className="rounded-lg border border-base-border px-3 py-2"><p className="text-[11px] text-ink-muted">{k}</p><p className="font-mono text-sm">{v}</p></div>
      ))}
    </div>
  );
}

function healthColor(p: number) { return p >= 85 ? 'text-accent-green' : p >= 70 ? 'text-accent-amber' : 'text-accent-red'; }
function ringStroke(p: number) { return p >= 85 ? '#0D9488' : p >= 70 ? '#D97706' : '#DC2626'; }

function HealthRing({ pct }: { pct: number }) {
  const r = 32, c = 2 * Math.PI * r;
  return (
    <div className="relative h-20 w-20">
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#E2E8F0" strokeWidth="6" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={ringStroke(pct)} strokeWidth="6" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center"><span className={`font-mono text-base font-semibold ${healthColor(pct)}`}>{pct}%</span></div>
    </div>
  );
}

function Dashboard() {
  const { ds } = useOps(defaultFilters(30));
  const woDef = entity('work_orders');
  const m = useMemo(() => {
    const open = ds.workOrders.filter((w) => OPEN_WO.includes(String(w.status)));
    const due = maintenanceDue(ds, 7);
    const health = ds.machines.map((mc) => ({ mc, ...machineHealth(ds, mc) })).sort((a, b) => a.score - b.score);
    const down30 = ds.shiftReports.reduce((s, r) => s + Number(r.downtime_minutes), 0);
    return { open, due, health, avgDown: down30 / 30 / 60 };
  }, [ds]);
  if (ds.loading) return <Spinner />;
  const name = (id: unknown) => String(ds.machines.find((x) => x.id === id)?.name ?? '—');
  const alerts: { mc: BaseRow; level: 'red' | 'amber'; text: string; action: JSX.Element }[] = [];
  for (const mc of ds.machines.filter((x) => x.status === 'breakdown')) {
    const wo = m.open.find((w) => w.machine_id === mc.id && w.wo_type === 'breakdown');
    alerts.push({ mc, level: 'red', text: `Machine in breakdown${wo ? ` — ${wo.number}: ${wo.description}` : ''}.`, action: wo ? <Button size="sm" tone="danger" onClick={() => navigate(routeFor('work_orders', wo.id))}>Open {String(wo.number)}</Button> : <BreakdownButton machine={mc} /> });
  }
  for (const d of m.due.filter((x) => x.overdueDays > 0)) {
    const mc = ds.machines.find((x) => x.id === d.pm.machine_id)!;
    alerts.push({ mc, level: d.overdueDays > 7 ? 'red' : 'amber', text: `${d.pm.task} is ${d.overdueDays} days overdue (every ${d.pm.frequency_days} days).`, action: <PmToWo pm={d.pm} /> });
  }
  for (const h of m.health.filter((x) => x.score < 70 && !alerts.some((a) => a.mc.id === x.mc.id))) {
    alerts.push({ mc: h.mc, level: 'amber', text: `Health score ${h.score}: utilization ${h.util === null ? 'n/a' : h.util.toFixed(0) + '%'}, ${h.downtime} min downtime and ${h.breakdowns} breakdown(s) in 30 days.`, action: <QuickCreate table="work_orders" size="sm" label="Create work order" initial={{ machine_id: h.mc.id, wo_type: 'inspection', priority: 'high', description: `Condition inspection — health score ${h.score}` }} /> });
  }

  return (
    <div className="space-y-5">
      <StatGrid cols={4}>
        <StatCard label="Open work orders" value={String(m.open.length)} sub={`${m.open.filter((w) => w.wo_type === 'breakdown').length} breakdowns`} />
        <StatCard label="Maintenance due (7 days)" value={String(m.due.length)} variant={m.due.some((d) => d.overdueDays > 0) ? 'red' : undefined} sub={`${m.due.filter((d) => d.overdueDays > 0).length} overdue`} />
        <StatCard label="Avg downtime / day (30d)" value={`${m.avgDown.toFixed(1)} h`} />
        <StatCard label="Avg equipment health" value={`${m.health.length ? Math.round(m.health.reduce((s, h) => s + h.score, 0) / m.health.length) : 0}%`} variant="amber" />
      </StatGrid>
      <p className="font-mono text-xs text-ink-muted">Health scores and alerts are rule-based (downtime, breakdowns, overdue PM) — no sensor or predictive model is connected.</p>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Maintenance alerts — action required</h3>
        <div className="space-y-2">
          {!alerts.length && <InfoBox variant="green">No breakdowns, overdue PM or low-health equipment.</InfoBox>}
          {alerts.map((a, i) => (
            <div key={i} className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start ${a.level === 'red' ? 'border-accent-red/30 bg-accent-red/5' : 'border-accent-amber/30 bg-accent-amber/5'}`}>
              <div className={`mt-1 hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block ${a.level === 'red' ? 'bg-accent-red' : 'bg-accent-amber'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{String(a.mc.name)}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{a.text}</p>
              </div>
              <div className="shrink-0">{a.action}</div>
            </div>
          ))}
        </div>
      </div>

      <Panel title="Open work orders" actions={<BreakdownButton />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['WO#', 'Equipment', 'Type', 'Priority', 'Due', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {m.open.map((w) => (
                <tr key={w.id} onClick={() => navigate(routeFor('work_orders', w.id))} className="cursor-pointer border-b border-base-border last:border-0 hover:bg-base-hover">
                  <td className="td font-mono">{String(w.number)}</td>
                  <td className="td">{name(w.machine_id)}</td>
                  <td className="td capitalize text-ink-muted">{String(w.wo_type)}</td>
                  <td className="td"><Badge variant={w.priority === 'critical' || w.priority === 'high' ? 'red' : w.priority === 'medium' ? 'amber' : 'grey'}>{String(w.priority)}</Badge></td>
                  <td className={`td font-mono ${w.due_date && String(w.due_date) < ymd() ? 'text-accent-red' : 'text-ink-muted'}`}>{date(w.due_date)}</td>
                  <td className="td"><StatusBadge def={woDef} value={w.status} /></td>
                </tr>
              ))}
              {!m.open.length && <tr><td colSpan={6} className="td py-8 text-center text-ink-muted">No open work orders</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Equipment health</h3>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border shadow-card md:grid-cols-3 xl:grid-cols-4">
          {m.health.map((h) => {
            const pm = ds.pmSchedules.filter((p) => p.machine_id === h.mc.id && p.active !== false).sort((a, b) => String(a.next_due).localeCompare(String(b.next_due)))[0];
            const overdue = pm && String(pm.next_due) < ymd();
            return (
              <button key={h.mc.id} onClick={() => navigate(routeFor('machines', h.mc.id))} className="bg-base-panel p-4 text-left hover:bg-base-hover">
                <span className="flex items-center gap-2"><Wrench className="h-4 w-4 shrink-0 text-ink-muted" /><span className="truncate text-sm font-semibold">{String(h.mc.name)}</span></span>
                <span className="mt-3 flex justify-center"><HealthRing pct={h.score} /></span>
                <span className="mt-3 block space-y-1.5 text-xs">
                  <span className="flex items-center gap-2 text-ink-muted"><CalendarClock className="h-3.5 w-3.5 shrink-0" />{pm?.last_done ? `Serviced ${daysBetween(String(pm.last_done), ymd())} days ago` : 'No PM history'}</span>
                  <span className={`flex items-center gap-2 ${overdue ? 'font-semibold text-accent-red' : 'text-ink-muted'}`}>
                    {overdue ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <Eye className="h-3.5 w-3.5 shrink-0" />}
                    {pm ? (overdue ? 'PM OVERDUE' : `PM due in ${daysBetween(ymd(), String(pm.next_due))} days`) : 'No PM schedule'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MachineHistory({ machine }: { machine: BaseRow }) {
  const wos = useQuery('work_orders', { where: { machine_id: machine.id }, orderBy: { key: 'created_at', dir: 'desc' }, limit: 20 });
  const { ds } = useOps(defaultFilters(30));
  const h = machineHealth(ds, machine);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Health', `${h.score}%`], ['Utilization 30d', h.util === null ? '—' : `${h.util.toFixed(0)}%`], ['Downtime 30d', `${h.downtime} min`], ['Breakdowns 30d', String(h.breakdowns)]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-base-border px-3 py-2"><p className="text-[11px] text-ink-muted">{k}</p><p className="font-mono text-sm">{v}</p></div>
        ))}
      </div>
      <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">Maintenance history</p>
      <ul className="divide-y divide-base-border rounded-lg border border-base-border">
        {wos.rows.map((w) => (
          <li key={w.id}><button onClick={() => navigate(routeFor('work_orders', w.id))} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-base-hover">
            <span><span className="font-mono">{String(w.number)}</span> · {String(w.description).slice(0, 50)}</span>
            <StatusBadge def={entity('work_orders')} value={w.status} />
          </button></li>
        ))}
        {!wos.rows.length && <li className="px-3 py-3 text-sm text-ink-muted">No work orders yet</li>}
      </ul>
    </div>
  );
}

function Technicians() {
  const techs = useQuery('employees', { where: { skill: 'technician' } });
  const wos = useQuery('work_orders', { where: { status: OPEN_WO }, limit: 500 });
  const machines = useQuery('machines', { limit: 500 });
  const woDef = entity('work_orders');
  const unassigned = wos.rows.filter((w) => !w.assigned_to);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {techs.rows.map((t) => {
        const mine = wos.rows.filter((w) => w.assigned_to === t.id);
        return (
          <Panel key={t.id} title={String(t.name)} subtitle={`${mine.length} open work order${mine.length === 1 ? '' : 's'}`}>
            <ul className="divide-y divide-base-border">
              {mine.map((w) => (
                <li key={w.id}><button onClick={() => navigate(routeFor('work_orders', w.id))} className="w-full px-4 py-2.5 text-left hover:bg-base-hover">
                  <span className="flex justify-between gap-2"><span className="font-mono text-sm">{String(w.number)}</span><StatusBadge def={woDef} value={w.status} /></span>
                  <span className="text-xs text-ink-muted">{String(machines.rows.find((m) => m.id === w.machine_id)?.name ?? '')} · due {date(w.due_date)}</span>
                </button></li>
              ))}
              {!mine.length && <li className="px-4 py-4 text-sm text-ink-muted">Available</li>}
            </ul>
          </Panel>
        );
      })}
      <Panel title="Unassigned" subtitle="Open work orders without a technician">
        <ul className="divide-y divide-base-border">
          {unassigned.map((w) => (
            <li key={w.id}><button onClick={() => navigate(routeFor('work_orders', w.id))} className="w-full px-4 py-2.5 text-left text-sm hover:bg-base-hover"><span className="font-mono">{String(w.number)}</span> · {String(machines.rows.find((m) => m.id === w.machine_id)?.name ?? '')}</button></li>
          ))}
          {!unassigned.length && <li className="px-4 py-4 text-sm text-ink-muted">All work orders are assigned</li>}
        </ul>
      </Panel>
    </div>
  );
}

function History() {
  const wos = useQuery('work_orders', { where: { status: ['completed', 'closed'] }, orderBy: { key: 'completed_at', dir: 'desc' }, limit: 500 });
  const machines = useQuery('machines', { limit: 500 });
  const byMachine = new Map<string, { parts: number; labour: number; downtime: number; count: number }>();
  for (const w of wos.rows) {
    const k = String(w.machine_id);
    const e = byMachine.get(k) ?? { parts: 0, labour: 0, downtime: 0, count: 0 };
    e.parts += ((w.parts_used as LineItem[]) ?? []).reduce((s, p) => s + Number(p.qty) * Number(p.rate ?? 0), 0);
    e.labour += Number(w.labour_cost ?? 0);
    e.downtime += Number(w.downtime_minutes ?? 0);
    e.count++;
    byMachine.set(k, e);
  }
  const rows = [...byMachine.entries()].sort((a, b) => b[1].parts + b[1].labour - (a[1].parts + a[1].labour));
  const nm = (id: string) => String(machines.rows.find((m) => m.id === id)?.name ?? '—');
  const total = rows.reduce((s, [, v]) => s + v.parts + v.labour, 0);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="Maintenance cost by machine" subtitle={`Completed work orders · ${money(total, true)} total`}>
        <div className="p-4"><BarChart horizontal stacked labels={rows.map(([k]) => nm(k))} series={[{ name: 'Parts', color: CHART.blue, values: rows.map(([, v]) => v.parts) }, { name: 'Labour', color: CHART.teal, values: rows.map(([, v]) => v.labour) }]} /></div>
      </Panel>
      <Panel title="Downtime from work orders">
        <div className="p-4"><BarChart horizontal unit=" min" labels={rows.map(([k]) => nm(k))} series={[{ name: 'Downtime', color: CHART.red, values: rows.map(([, v]) => v.downtime) }]} /></div>
      </Panel>
      <div className="lg:col-span-2"><EntityManager table="work_orders" title="Completed work orders" fixedWhere={{ status: ['completed', 'closed'] }} allowCreate={false} /></div>
    </div>
  );
}
