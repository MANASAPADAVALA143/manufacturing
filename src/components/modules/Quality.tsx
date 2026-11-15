import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Eye } from 'lucide-react';
import { Badge, Button, InfoBox, Panel, Spinner, StatCard, StatGrid } from '@/components/ui';
import EntityManager, { StatusBadge } from '@/components/data/EntityManager';
import { QuickCreate } from '@/components/data/QuickCreate';
import { BarChart, CHART, LineChart } from '@/components/charts';
import { useApp } from '@/lib/app';
import { entity } from '@/lib/data/entities';
import { useQuery } from '@/lib/data/hooks';
import { DEFAULT_COMPANY_SETTINGS, type BaseRow } from '@/lib/data/schema';
import { dateRange, defaultFilters, filterReports, groupAgg, shortDay, supplierScorecard } from '@/lib/analytics';
import { useOps } from '@/lib/useDataset';
import { ymd } from '@/lib/dates';
import { date, pct, qty } from '@/lib/format';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { ModuleTabs, useModuleTab } from './shared';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'incoming', label: 'Incoming inspection' },
  { id: 'in_process', label: 'In-process' },
  { id: 'final', label: 'Finished goods' },
  { id: 'ncrs', label: 'NCR' },
  { id: 'capas', label: 'CAPA' },
  { id: 'suppliers', label: 'Supplier quality' },
  { id: 'quality_parameters', label: 'Parameters' },
  { id: 'defect_codes', label: 'Defect classification' },
];

export default function Quality({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab === 'inspections' ? 'incoming' : tab, TABS);
  return (
    <div className="space-y-5">
      <ModuleTabs module="quality" tabs={TABS} current={current} />
      {current === 'dashboard' && <Dashboard />}
      {['incoming', 'in_process', 'final'].includes(current) && (
        <EntityManager key={current} table="inspections" fixedWhere={{ stage: current }} title={TABS.find((t) => t.id === current)!.label}
          detailExtra={(r) => <InspectionExtras ins={r} />}
          emptyHint={current === 'incoming' ? 'Incoming inspections are created automatically when a GRN is posted.' : undefined} />
      )}
      {current === 'ncrs' && <EntityManager table="ncrs" rowActions={(r) => <QuickCreate table="capas" label="Raise CAPA" initial={{ ncr_id: r.id }} />} />}
      {current === 'capas' && <EntityManager table="capas" />}
      {current === 'suppliers' && <SupplierQuality />}
      {current === 'quality_parameters' && <EntityManager table="quality_parameters" />}
      {current === 'defect_codes' && <EntityManager table="defect_codes" />}
    </div>
  );
}

function InspectionExtras({ ins }: { ins: BaseRow }) {
  const lot = Number(ins.lot_qty), rej = Number(ins.rejected_qty ?? 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[['Lot', qty(lot, 0)], ['Accepted', qty(ins.accepted_qty ?? 0, 0)], ['Rejected', `${qty(rej, 0)} (${pct(lot ? (rej / lot) * 100 : 0)})`]].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-base-border px-3 py-2"><p className="text-[11px] text-ink-muted">{k}</p><p className="font-mono text-sm">{v}</p></div>
        ))}
      </div>
      <ParamList materialId={String(ins.material_id)} stage={String(ins.stage)} />
    </div>
  );
}

function ParamList({ materialId, stage }: { materialId: string; stage: string }) {
  const q = useQuery('quality_parameters', { where: { material_id: materialId, stage } });
  if (!q.rows.length) return <p className="text-xs text-ink-muted">No quality parameters defined for this material at this stage. <button className="text-accent-blue underline" onClick={() => navigate('/quality/quality_parameters')}>Define parameters</button></p>;
  return (
    <div>
      <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-ink-muted">Specification</p>
      <ul className="divide-y divide-base-border rounded-lg border border-base-border text-sm">
        {q.rows.map((p) => <li key={p.id} className="flex justify-between px-3 py-2"><span>{String(p.name)}</span><span className="font-mono text-ink-muted">{String(p.min_value ?? '—')} – {String(p.max_value ?? '—')} {String(p.unit ?? '')}</span></li>)}
      </ul>
    </div>
  );
}

function Dashboard() {
  const { company } = useApp();
  const settings = { ...DEFAULT_COMPANY_SETTINGS, ...(company?.settings ?? {}) };
  const f = defaultFilters(30);
  const { ds, machines } = useOps(f);
  const def = entity('inspections');
  const m = useMemo(() => {
    // Lots are in different units (kg, nos, L), so rates are per lot — never summed across lots.
    const done = ds.inspections.filter((i) => ['passed', 'failed', 'conditional'].includes(String(i.status)));
    const lotRej = (i: BaseRow) => (Number(i.lot_qty) > 0 ? Number(i.rejected_qty ?? 0) / Number(i.lot_qty) : 0);
    const accepted = done.filter((i) => i.status !== 'failed' && Number(i.rejected_qty ?? 0) === 0).length;
    const inc = done.filter((i) => i.stage === 'incoming');
    const today = ymd();
    const shiftToday = filterReports(ds, f, today, today);
    const defectsToday = shiftToday.reduce((s, r) => s + Number(r.rejected_qty), 0) + ds.inspections.filter((i) => i.inspection_date === today).reduce((s, i) => s + Number(i.rejected_qty ?? 0), 0);
    const days = dateRange(f.from, f.to);
    const byDay = new Map(groupAgg(filterReports(ds, f), (r) => String(r.report_date), machines).map((g) => [g.key, g]));
    const defects = new Map<string, number>();
    for (const i of done) if (i.defect_code_id) defects.set(String(i.defect_code_id), (defects.get(String(i.defect_code_id)) ?? 0) + Number(i.rejected_qty ?? 0));
    return {
      passRate: done.length ? (accepted / done.length) * 100 : null, lots: done.length,
      incRate: inc.length ? (inc.reduce((s, i) => s + lotRej(i), 0) / inc.length) * 100 : null,
      defectsToday, days, byDay, defects, pending: ds.inspections.filter((i) => ['requested', 'in_progress'].includes(String(i.status))),
    };
  }, [ds, f, machines]);
  const ncrs = useQuery('ncrs', { where: { status: ['open', 'investigating', 'dispositioned'] }, limit: 50 });
  const defectNames = useQuery('defect_codes', { limit: 200 });
  if (ds.loading) return <Spinner />;

  const alerts = ds.inspections.filter((i) => ['failed', 'conditional'].includes(String(i.status)) || (i.status === 'passed' && Number(i.rejected_qty ?? 0) > 0))
    .sort((a, b) => String(b.inspection_date).localeCompare(String(a.inspection_date))).slice(0, 5);
  const supWorst = supplierScorecard(ds).filter((s) => s.rejectionPct !== null).sort((a, b) => (b.rejectionPct ?? 0) - (a.rejectionPct ?? 0));
  const mat = (id: unknown) => String(ds.materials.find((x) => x.id === id)?.name ?? '—');
  const sup = (id: unknown) => String(ds.suppliers.find((x) => x.id === id)?.name ?? '—');
  const insights: { tone: 'amber' | 'green'; text: string }[] = [];
  const topDefect = [...m.defects.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDefect) insights.push({ tone: 'amber', text: `Most frequent defect (30 days): ${defectNames.rows.find((d) => d.id === topDefect[0])?.name ?? 'unclassified'} — ${topDefect[1]} units rejected. Check open CAPA coverage.` });
  if (supWorst[0] && (supWorst[0].rejectionPct ?? 0) > 2) insights.push({ tone: 'amber', text: `${supWorst[0].supplier.name} incoming rejection is ${pct(supWorst[0].rejectionPct)} — above 2%. Consider a supplier corrective action request.` });
  const clean = supplierScorecard(ds).filter((s) => s.deliveries >= 2 && s.rejectionPct === 0);
  if (clean[0]) insights.push({ tone: 'green', text: `${clean[0].supplier.name}: 0% rejection across ${clean[0].deliveries} deliveries — candidate for reduced inspection / preferred status.` });

  return (
    <div className="space-y-5">
      <StatGrid cols={4}>
        <StatCard label="First-pass lot acceptance" value={pct(m.passRate)} variant={m.passRate !== null && m.passRate < 90 ? 'amber' : 'green'} sub={`${m.lots} lots inspected (30d)`} />
        <StatCard label="Defects today" value={qty(m.defectsToday, 0)} sub="Shift rejections + inspections" />
        <StatCard label="Pending inspections" value={String(m.pending.length)} variant={m.pending.length ? 'amber' : undefined} />
        <StatCard label="Avg incoming rejection / lot" value={pct(m.incRate)} variant={m.incRate !== null && m.incRate > 2 ? 'amber' : 'green'} sub={`${ncrs.rows.length} open NCRs`} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink-muted">Quality alerts</h3>
          <div className="space-y-2">
            {alerts.length === 0 && <InfoBox variant="green">No failed or deviated lots in the last 30 days.</InfoBox>}
            {alerts.map((a) => {
              const level = a.status === 'failed' ? 'red' : a.status === 'conditional' ? 'amber' : 'green';
              const Icon = level === 'red' ? AlertTriangle : level === 'amber' ? Eye : CheckCircle2;
              const st = { red: 'border-accent-red/30 bg-accent-red/5', amber: 'border-accent-amber/30 bg-accent-amber/5', green: 'border-base-border bg-base-panel' }[level];
              return (
                <button key={a.id} onClick={() => navigate(routeFor('inspections', a.id))} className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left ${st}`}>
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${level === 'red' ? 'bg-accent-red' : level === 'amber' ? 'bg-accent-amber' : 'bg-accent-green'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold">{String(a.batch_no ?? a.number)}</span><span className="text-sm text-ink-muted">· {mat(a.material_id)}</span></span>
                    <span className="mt-1 block text-sm">{String(a.findings ?? 'Rejections recorded')}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{qty(a.rejected_qty ?? 0, 0)} of {qty(a.lot_qty, 0)} rejected · {date(a.inspection_date)}</span>
                  </span>
                  <Icon className={`h-4 w-4 shrink-0 ${level === 'red' ? 'text-accent-red' : level === 'amber' ? 'text-accent-amber' : 'text-accent-green'}`} />
                </button>
              );
            })}
          </div>
        </div>
        <Panel title="Rejection trend" subtitle="Shift-report rejection %, last 30 days">
          <div className="p-4">
            <LineChart labels={m.days.map(shortDay)} unit="%" target={{ value: settings.rejection_alert_pct, label: 'Alert threshold' }}
              series={[{ name: 'Rejection %', color: CHART.red, values: m.days.map((d) => m.byDay.get(d)?.rejectionPct ?? null) }]} />
          </div>
        </Panel>
      </div>

      <Panel title="Inspection queue" actions={<QuickCreate table="inspections" label="New inspection" initial={{ stage: 'in_process' }} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['Inspection', 'Stage', 'Supplier', 'Material', 'Lot qty', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {m.pending.map((i) => (
                <tr key={i.id} onClick={() => navigate(routeFor('inspections', i.id).replace('/inspections', `/${i.stage}`))} className="cursor-pointer border-b border-base-border last:border-0 hover:bg-base-hover">
                  <td className="td font-mono">{String(i.number)}</td>
                  <td className="td">{String(i.stage).replace('_', '-')}</td>
                  <td className="td">{i.supplier_id ? sup(i.supplier_id) : '—'}</td>
                  <td className="td text-ink-muted">{mat(i.material_id)}</td>
                  <td className="td font-mono">{qty(i.lot_qty, 0)}</td>
                  <td className="td"><StatusBadge def={def} value={i.status} /></td>
                </tr>
              ))}
              {!m.pending.length && <tr><td colSpan={6} className="td py-8 text-center text-ink-muted">No pending inspections</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Defect Pareto (30 days)">
          <div className="p-4">
            {m.defects.size ? <BarChart horizontal labels={[...m.defects.keys()].map((k) => String(defectNames.rows.find((d) => d.id === k)?.name ?? '—'))} series={[{ name: 'Units', color: CHART.amber, values: [...m.defects.values()] }]} /> : <p className="py-6 text-center text-sm text-ink-muted">No classified defects.</p>}
          </div>
        </Panel>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink-muted">Quality insights <span className="font-normal">(rule-based)</span></h3>
          <div className="space-y-3">
            {insights.map((i, k) => (
              <div key={k} className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${i.tone === 'amber' ? 'border-accent-amber/30 bg-accent-amber/5' : 'border-accent-green/30 bg-accent-green/5'}`}>
                {i.tone === 'amber' ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent-amber" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-green" />}
                <p className="text-sm leading-relaxed">{i.text}</p>
              </div>
            ))}
            {!insights.length && <InfoBox>Not enough inspection history for insights yet.</InfoBox>}
          </div>
        </div>
      </div>
    </div>
  );
}

function SupplierQuality() {
  const { ds } = useOps(defaultFilters(180));
  const rows = useMemo(() => supplierScorecard(ds).filter((s) => s.deliveries > 0).sort((a, b) => (b.rejectionPct ?? 0) - (a.rejectionPct ?? 0)), [ds]);
  if (ds.loading) return <Spinner />;
  return (
    <Panel title="Supplier quality" subtitle="Incoming inspection results, last 180 days">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="border-b border-base-border bg-base-subtle"><tr>{['Supplier', 'Deliveries', 'Rejection %', 'On-time %', 'Open NCRs', 'Grade'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((s) => {
              const r = s.rejectionPct ?? 0;
              const grade = r <= 0.5 ? 'A' : r <= 2 ? 'B' : r <= 5 ? 'C' : 'D';
              return (
                <tr key={s.supplier.id} className="border-b border-base-border last:border-0">
                  <td className="td font-medium">{String(s.supplier.name)}</td>
                  <td className="td font-mono">{s.deliveries}</td>
                  <td className={`td font-mono ${r > 2 ? 'text-accent-red' : ''}`}>{pct(s.rejectionPct)}</td>
                  <td className="td font-mono">{pct(s.onTimePct, 0)}</td>
                  <td className="td font-mono">{ds.inspections.filter((i) => i.supplier_id === s.supplier.id && i.status === 'failed').length}</td>
                  <td className="td"><Badge variant={grade === 'A' ? 'green' : grade === 'B' ? 'blue' : grade === 'C' ? 'amber' : 'red'}>{grade}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-base-border p-3"><Button size="sm" tone="secondary" onClick={() => navigate('/procurement/performance')}>Full supplier scorecard</Button></div>
    </Panel>
  );
}
