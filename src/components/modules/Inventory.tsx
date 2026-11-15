import { useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Download, Search } from 'lucide-react';
import { Badge, Button, ClickableRow, EmptyState, InfoBox, Panel, Spinner, StatCard, StatGrid } from '@/components/ui';
import EntityManager from '@/components/data/EntityManager';
import { QuickCreate } from '@/components/data/QuickCreate';
import { BarChart, CHART, Donut } from '@/components/charts';
import { defaultFilters, stockPosition, type StockRow } from '@/lib/analytics';
import { useDataset } from '@/lib/useDataset';
import type { BaseRow } from '@/lib/data/schema';
import { exportCsv } from '@/lib/export';
import { date, money, qty } from '@/lib/format';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { useApp } from '@/lib/app';
import { ModuleTabs, useModuleTab } from './shared';
import { ReorderPanel } from './Procurement';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'stock', label: 'Stock on hand' },
  { id: 'stock_movements', label: 'Stock in / out' },
  { id: 'grns', label: 'Goods receipts' },
  { id: 'batches', label: 'Batches & lots' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'stock_audits', label: 'Stock audit' },
  { id: 'reorder', label: 'Reorder' },
  { id: 'valuation', label: 'Valuation & consumption' },
  { id: 'materials', label: 'Material master' },
];

const TYPE_LABEL: Record<string, string> = { raw: 'Raw material', wip: 'WIP', fg: 'Finished goods', spare: 'Spares', consumable: 'Consumables' };

export default function Inventory({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab, TABS);
  return (
    <div className="space-y-5">
      <ModuleTabs module="inventory" tabs={TABS} current={current} />
      {current === 'dashboard' && <Dashboard />}
      {current === 'stock' && <StockOnHand />}
      {current === 'stock_movements' && (
        <div className="space-y-3">
          <MovementButtons />
          <EntityManager table="stock_movements" emptyHint="Movements are immutable; correct mistakes with a reversing adjustment." />
        </div>
      )}
      {current === 'grns' && <EntityManager table="grns" emptyHint="Receive goods against an approved PO. Posting a GRN books stock and requests incoming inspection." />}
      {current === 'batches' && <Batches />}
      {current === 'reservations' && <EntityManager table="reservations" />}
      {current === 'stock_audits' && <EntityManager table="stock_audits" emptyHint="Record a physical count; the system quantity and variance are calculated. Approval posts the adjustment." />}
      {current === 'reorder' && <ReorderPanel />}
      {current === 'valuation' && <Valuation />}
      {current === 'materials' && <EntityManager table="materials" />}
    </div>
  );
}

function MovementButtons() {
  const { can } = useApp();
  if (!can('inventory', 'create')) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <QuickCreate table="stock_movements" tone="primary" icon={ArrowDownToLine} label="Stock IN" stay title="Stock IN" initial={{ movement_type: 'in', reason: 'purchase_receipt' }} />
      <QuickCreate table="stock_movements" icon={ArrowUpFromLine} label="Stock OUT / issue" stay title="Stock OUT" initial={{ movement_type: 'out', reason: 'production_issue' }} />
      <QuickCreate table="stock_movements" icon={ArrowRightLeft} label="Transfer" stay title="Material transfer" initial={{ movement_type: 'transfer', reason: 'inter_warehouse' }} />
      <QuickCreate table="stock_movements" label="Adjustment" stay title="Stock adjustment" initial={{ movement_type: 'adjust', reason: 'damage' }} />
      <Button tone="ghost" onClick={() => navigate('/field/store')}>Open mobile store-keeper app</Button>
    </div>
  );
}

function Dashboard() {
  const ds = useDataset(defaultFilters(30));
  const stock = useMemo(() => stockPosition(ds), [ds]);
  const [selected, setSelected] = useState<string | null>(null);
  if (ds.loading) return <Spinner />;
  const value = stock.reduce((s, x) => s + x.value, 0);
  const byType = new Map<string, number>();
  for (const s of stock) byType.set(String(s.material.type), (byType.get(String(s.material.type)) ?? 0) + s.value);
  const alerts = stock.filter((s) => s.belowReorder || (s.cover !== null && s.cover < Number(s.material.lead_time_days))).sort((a, b) => (a.cover ?? 999) - (b.cover ?? 999));
  const excess = stock.filter((s) => s.cover !== null && s.cover > 90 && s.value > 50000).sort((a, b) => b.value - a.value);
  const sel = stock.find((s) => s.material.id === selected);
  const colors = [CHART.blue, CHART.amber, CHART.teal, CHART.navy, CHART.violet];
  const today = new Date().toISOString().slice(0, 10);
  const movesToday = ds.movements.filter((m) => m.movement_date === today);

  return (
    <div className="space-y-5">
      <StatGrid cols={5}>
        <StatCard label="Inventory value" value={money(value, true)} sub="At standard cost" />
        <StatCard label="Below reorder level" value={String(stock.filter((s) => s.belowReorder).length)} variant="red" />
        <StatCard label="Stock-out before delivery" value={String(stock.filter((s) => s.cover !== null && s.cover < Number(s.material.lead_time_days)).length)} variant="amber" sub="Cover < lead time" />
        <StatCard label="Excess stock (> 90 days)" value={String(excess.length)} sub={money(excess.reduce((s, x) => s + x.value, 0), true)} />
        <StatCard label="Movements today" value={String(movesToday.length)} sub={`${movesToday.filter((m) => m.movement_type === 'in').length} in · ${movesToday.filter((m) => m.movement_type === 'out').length} out`} />
      </StatGrid>
      <MovementButtons />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Panel title="Inventory alerts" className="xl:col-span-2" subtitle="Click an item to see why">
          <div>
            {[...alerts, ...excess.slice(0, 2)].map((s) => {
              const isExcess = excess.includes(s) && !alerts.includes(s);
              return (
                <ClickableRow key={s.material.id} active={selected === s.material.id} onClick={() => setSelected(selected === s.material.id ? null : s.material.id)}>
                  <span className="min-w-0 flex-1 truncate text-sm">{String(s.material.name)}</span>
                  <Badge variant={isExcess ? 'amber' : s.cover !== null && s.cover < Number(s.material.lead_time_days) ? 'red' : 'amber'}>
                    {isExcess ? 'Excess inventory' : s.cover !== null ? `Stock-out risk in ${Math.floor(s.cover)} days` : 'Below reorder level'}
                  </Badge>
                </ClickableRow>
              );
            })}
            {!alerts.length && !excess.length && <EmptyState title="All materials healthy" />}
          </div>
        </Panel>
        <Panel title="Value by category">
          <div className="p-4"><Donut label={money(value, true)} segments={[...byType.entries()].map(([k, v], i) => ({ label: TYPE_LABEL[k] ?? k, value: v, color: colors[i % colors.length] }))} /></div>
        </Panel>
      </div>
      {sel && <WhyAtRisk s={sel} />}
    </div>
  );
}

function WhyAtRisk({ s }: { s: StockRow }) {
  const m = s.material;
  const daily = s.consumed30 / 30;
  const lead = Number(m.lead_time_days);
  const reorder = Math.max(Number(m.reorder_qty), Math.ceil(daily * (lead + 14) - s.onHand - s.openPoQty));
  return (
    <Panel title={`Why is ${m.name} flagged?`}>
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-base-border bg-base-border sm:grid-cols-4">
          {[['Current stock', `${qty(s.onHand, 0)} ${m.uom}`], ['Avg daily use (30d)', `${qty(daily, 1)} ${m.uom}`], ['Supplier lead time', `${lead} days`], ['Est. stock-out', s.cover === null ? 'No consumption' : `${s.cover.toFixed(1)} days`]].map(([k, v], i) => (
            <div key={k} className="bg-base-panel px-4 py-3"><p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">{k}</p><p className={`mt-1 font-mono text-sm ${i === 3 && s.cover !== null && s.cover < lead ? 'text-accent-red' : ''}`}>{v}</p></div>
          ))}
        </div>
        <InfoBox>
          Reorder level {qty(m.reorder_level, 0)} {String(m.uom)} · open POs {qty(s.openPoQty, 0)} {String(m.uom)}. Recommended order: <b>{qty(reorder, 0)} {String(m.uom)}</b> (covers lead time + 14 days at current usage, or the reorder quantity, whichever is higher).
        </InfoBox>
        <QuickCreate table="purchase_requisitions" tone="primary" label="Raise purchase requisition" initial={{ request_type: 'purchase', material_id: m.id, qty: reorder, estimated_rate: m.standard_cost, priority: s.cover !== null && s.cover < lead ? 'urgent' : 'high', source: 'reorder', reason: `Stock-out risk: ${qty(s.onHand, 0)} ${m.uom} on hand, ~${s.cover?.toFixed(1) ?? '—'} days cover vs ${lead} days lead time.` }} />
      </div>
    </Panel>
  );
}

function StockOnHand() {
  const ds = useDataset(defaultFilters(30));
  const { company } = useApp();
  const [search, setSearch] = useState('');
  const [wh, setWh] = useState('');
  const [type, setType] = useState('');
  if (ds.loading) return <Spinner />;
  const mat = new Map(ds.materials.map((m) => [m.id, m]));
  const whs = new Map(ds.warehouses.map((w) => [w.id, w]));
  const rows = ds.balances.filter((b) => Number(b.qty) > 0 && (!wh || b.warehouse_id === wh) && (!type || mat.get(String(b.material_id))?.type === type))
    .filter((b) => { const m = mat.get(String(b.material_id)); return !search || [m?.name, m?.code, b.batch_no, m?.barcode].some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase())); })
    .sort((a, b) => String(mat.get(String(a.material_id))?.name).localeCompare(String(mat.get(String(b.material_id))?.name)));
  const cols = [
    { label: 'Code', value: (b: BaseRow) => String(mat.get(String(b.material_id))?.code ?? '') },
    { label: 'Material', value: (b: BaseRow) => String(mat.get(String(b.material_id))?.name ?? '') },
    { label: 'Warehouse', value: (b: BaseRow) => String(whs.get(String(b.warehouse_id))?.name ?? '') },
    { label: 'Batch', value: (b: BaseRow) => String(b.batch_no ?? '') },
    { label: 'Qty', value: (b: BaseRow) => Number(b.qty) },
    { label: 'UOM', value: (b: BaseRow) => String(mat.get(String(b.material_id))?.uom ?? '') },
    { label: 'Value', value: (b: BaseRow) => Math.round(Number(b.qty) * Number(mat.get(String(b.material_id))?.standard_cost ?? 0)) },
  ];
  return (
    <Panel title="Stock on hand" subtitle={`${rows.length} stock lines · ${money(rows.reduce((s, b) => s + Number(b.qty) * Number(mat.get(String(b.material_id))?.standard_cost ?? 0), 0), true)}`}
      actions={<Button size="sm" tone="secondary" icon={Download} onClick={() => exportCsv(`${company?.slug}-stock-${new Date().toISOString().slice(0, 10)}`, rows, cols)}>Export</Button>}>
      <div className="grid grid-cols-1 gap-2 border-b border-base-border p-3 sm:grid-cols-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input type="search" className="input pl-9" placeholder="Search material, code, batch, barcode…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="input" aria-label="Warehouse" value={wh} onChange={(e) => setWh(e.target.value)}><option value="">All warehouses</option>{ds.warehouses.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}</select>
        <select className="input" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-base-border bg-base-subtle"><tr>{cols.map((c) => <th key={c.label} className={`th ${['Qty', 'Value'].includes(c.label) ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-base-border last:border-0 hover:bg-base-hover">
                {cols.map((c) => <td key={c.label} className={`td ${['Qty', 'Value'].includes(c.label) ? 'text-right font-mono' : ''} ${c.label === 'Code' || c.label === 'Batch' ? 'font-mono text-xs' : ''}`}>{c.label === 'Value' ? money(c.value(b)) : c.label === 'Qty' ? qty(c.value(b)) : c.value(b)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-base-border md:hidden">
        {rows.map((b) => {
          const m = mat.get(String(b.material_id));
          return (
            <li key={b.id} className="px-4 py-3">
              <div className="flex justify-between gap-2"><p className="truncate font-medium">{String(m?.name)}</p><p className="shrink-0 font-mono">{qty(b.qty)} {String(m?.uom ?? '')}</p></div>
              <p className="text-xs text-ink-muted">{String(whs.get(String(b.warehouse_id))?.name)} · batch {String(b.batch_no || '—')}</p>
            </li>
          );
        })}
      </ul>
      {!rows.length && <EmptyState title="No stock matches" />}
    </Panel>
  );
}

function Batches() {
  const ds = useDataset(defaultFilters(90), { lookbackDays: 90 });
  const [batch, setBatch] = useState<string | null>(null);
  if (ds.loading) return <Spinner />;
  const mat = new Map(ds.materials.map((m) => [m.id, m]));
  const groups = new Map<string, { material: string; qty: number; warehouses: Set<string> }>();
  for (const b of ds.balances) {
    if (!b.batch_no) continue;
    const k = `${b.material_id}|${b.batch_no}`;
    const g = groups.get(k) ?? { material: String(b.material_id), qty: 0, warehouses: new Set<string>() };
    g.qty += Number(b.qty);
    g.warehouses.add(String(ds.warehouses.find((w) => w.id === b.warehouse_id)?.code ?? ''));
    groups.set(k, g);
  }
  const trace = batch ? ds.movements.filter((m) => `${m.material_id}|${m.batch_no}` === batch).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) : [];
  const ins = batch ? ds.inspections.filter((i) => `${i.material_id}|${i.batch_no}` === batch) : [];
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel title="Batches & lots on hand">
        <ul className="max-h-[560px] divide-y divide-base-border overflow-y-auto">
          {[...groups.entries()].map(([k, g]) => (
            <li key={k}><button onClick={() => setBatch(k)} className={`flex w-full justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-base-hover ${batch === k ? 'bg-base-hover' : ''}`}>
              <span className="min-w-0"><span className="block truncate font-mono">{k.split('|')[1]}</span><span className="block truncate text-xs text-ink-muted">{String(mat.get(g.material)?.name)}</span></span>
              <span className="shrink-0 text-right"><span className="block font-mono">{qty(g.qty)}</span><span className="block text-xs text-ink-muted">{[...g.warehouses].join(', ')}</span></span>
            </button></li>
          ))}
        </ul>
      </Panel>
      <Panel title={batch ? `Traceability · ${batch.split('|')[1]}` : 'Traceability'} subtitle="Movements and inspections for the selected batch (last 90 days)">
        {!batch ? <EmptyState title="Select a batch" /> : (
          <div className="space-y-3 p-4">
            {ins.map((i) => <InfoBox key={i.id} variant={i.status === 'failed' ? 'red' : i.status === 'passed' ? 'green' : 'amber'}>Inspection {String(i.number)}: {String(i.status)} · {qty(i.rejected_qty ?? 0, 0)} rejected</InfoBox>)}
            <ol className="relative space-y-3 border-l border-base-border pl-5">
              {trace.map((m) => (
                <li key={m.id} className="relative text-sm">
                  <span className={`absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ${m.movement_type === 'in' ? 'bg-accent-green' : 'bg-accent-amber'}`} />
                  <b className="uppercase">{String(m.movement_type)}</b> {qty(m.qty)} · {String(m.reason).replace(/_/g, ' ')} · <span className="font-mono">{String(m.reference ?? m.number)}</span>
                  <p className="text-xs text-ink-muted">{date(m.movement_date)} · {String(ds.warehouses.find((w) => w.id === m.warehouse_id)?.name)}</p>
                </li>
              ))}
              {!trace.length && <li className="text-sm text-ink-muted">No movements in window</li>}
            </ol>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Valuation() {
  const ds = useDataset(defaultFilters(30));
  const stock = useMemo(() => stockPosition(ds), [ds]);
  if (ds.loading) return <Spinner />;
  const byWh = new Map<string, number>();
  const mat = new Map(ds.materials.map((m) => [m.id, m]));
  for (const b of ds.balances) byWh.set(String(b.warehouse_id), (byWh.get(String(b.warehouse_id)) ?? 0) + Number(b.qty) * Number(mat.get(String(b.material_id))?.standard_cost ?? 0));
  const consumption = stock.filter((s) => s.consumed30 > 0).sort((a, b) => b.consumed30 * Number(b.material.standard_cost) - a.consumed30 * Number(a.material.standard_cost));
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="Valuation by warehouse" subtitle="Quantity × standard cost">
        <div className="p-4"><BarChart horizontal labels={[...byWh.keys()].map((k) => String(ds.warehouses.find((w) => w.id === k)?.name ?? '—'))} series={[{ name: 'Value', color: CHART.navy, values: [...byWh.values()] }]} /></div>
      </Panel>
      <Panel title="Material consumption (30 days)" subtitle="Production + maintenance issues, by value">
        <ul className="divide-y divide-base-border">
          {consumption.map((s) => (
            <li key={s.material.id} className="flex justify-between gap-2 px-4 py-2.5 text-sm">
              <span className="truncate">{String(s.material.name)}</span>
              <span className="shrink-0 font-mono">{qty(s.consumed30, 0)} {String(s.material.uom)} · {money(s.consumed30 * Number(s.material.standard_cost), true)}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="lg:col-span-2">
        <Panel title="Valuation by material">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b border-base-border bg-base-subtle"><tr>{['Material', 'Type', 'On hand', 'Std cost', 'Value', 'Cover'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {[...stock].sort((a, b) => b.value - a.value).map((s) => (
                  <tr key={s.material.id} onClick={() => navigate(routeFor('materials', s.material.id))} className="cursor-pointer border-b border-base-border last:border-0 hover:bg-base-hover">
                    <td className="td">{String(s.material.name)}</td>
                    <td className="td text-ink-muted">{TYPE_LABEL[String(s.material.type)]}</td>
                    <td className="td font-mono">{qty(s.onHand, 0)} {String(s.material.uom)}</td>
                    <td className="td font-mono">{money(s.material.standard_cost)}</td>
                    <td className="td font-mono">{money(s.value, true)}</td>
                    <td className="td font-mono">{s.cover === null ? '—' : `${s.cover.toFixed(0)} d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
