import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, PackagePlus, ShoppingCart, Trophy } from 'lucide-react';
import { Badge, Button, EmptyState, InfoBox, Panel, Sheet, Spinner, StatCard, StatGrid } from '@/components/ui';
import EntityManager, { StatusBadge } from '@/components/data/EntityManager';
import { QuickCreate } from '@/components/data/QuickCreate';
import { useApp } from '@/lib/app';
import { entity } from '@/lib/data/entities';
import { displayName, useActions, useLookup, useQuery, useRefMaps } from '@/lib/data/hooks';
import type { BaseRow, LineItem } from '@/lib/data/schema';
import { defaultFilters, delayedPOs, OPEN_PO, stockPosition, supplierScorecard } from '@/lib/analytics';
import { useDataset } from '@/lib/useDataset';
import { addDays, ymd } from '@/lib/dates';
import { date, money, pct, qty } from '@/lib/format';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { ModuleTabs, useModuleTab } from './shared';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'purchase_requisitions', label: 'Requisitions' },
  { id: 'comparison', label: 'Comparative statement' },
  { id: 'supplier_quotations', label: 'Supplier quotations' },
  { id: 'purchase_orders', label: 'Purchase orders' },
  { id: 'reorder', label: 'Reorder recommendations' },
  { id: 'performance', label: 'Supplier performance' },
  { id: 'suppliers', label: 'Suppliers' },
];

export default function Procurement({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab, TABS);
  return (
    <div className="space-y-5">
      <ModuleTabs module="procurement" tabs={TABS} current={current} />
      {current === 'overview' && <ProcOverview />}
      {current === 'purchase_requisitions' && <EntityManager table="purchase_requisitions" rowActions={(r) => <RaisePO pr={r} />} detailExtra={(r) => <PrQuotes pr={r} />} />}
      {current === 'comparison' && <Comparison />}
      {current === 'supplier_quotations' && <EntityManager table="supplier_quotations" />}
      {current === 'purchase_orders' && <EntityManager table="purchase_orders" rowActions={(r) => <ReceiveGoods po={r} />} detailExtra={(r) => <PoReceipts po={r} />} />}
      {current === 'reorder' && <ReorderPanel />}
      {current === 'performance' && <Performance />}
      {current === 'suppliers' && <EntityManager table="suppliers" />}
    </div>
  );
}

function ProcOverview() {
  const ds = useDataset(defaultFilters(90), { lookbackDays: 90 });
  const { name } = useRefMaps(['suppliers', 'materials']);
  const def = entity('purchase_orders');
  const m = useMemo(() => {
    const open = ds.purchaseOrders.filter((p) => OPEN_PO.includes(String(p.status)));
    const pendingGrn = ds.purchaseOrders.filter((p) => ['approved', 'sent', 'partially_received'].includes(String(p.status)));
    const priceExc = ds.invoices.filter((i) => ((i.exceptions as string[]) ?? []).some((e) => e.startsWith('Price variance')));
    const cycle = ds.purchaseOrders.filter((p) => p.requisition_id && ['approved', 'sent', 'partially_received', 'received', 'closed'].includes(String(p.status)))
      .map((p) => {
        const pr = ds.requisitions.find((r) => r.id === p.requisition_id);
        return pr ? (Date.parse(String(p.po_date)) - Date.parse(String(pr.created_at).slice(0, 10))) / 86_400_000 : null;
      }).filter((x): x is number => x !== null);
    // Price intelligence: latest quotation per material vs last PO rate.
    const lastRate = new Map<string, { rate: number; po: string }>();
    for (const p of [...ds.purchaseOrders].filter((x) => !['draft', 'cancelled'].includes(String(x.status))).sort((a, b) => String(a.po_date).localeCompare(String(b.po_date)))) {
      for (const l of (p.lines as LineItem[]) ?? []) lastRate.set(l.material_id, { rate: Number(l.rate), po: String(p.number) });
    }
    return { open, pendingGrn, priceExc, cycle: cycle.length ? cycle.reduce((a, b) => a + b, 0) / cycle.length : null, lastRate, delayed: delayedPOs(ds) };
  }, [ds]);
  const sqs = useQuery('supplier_quotations', { where: { status: 'received' }, limit: 200 });

  if (ds.loading) return <Spinner />;
  const anomalies = sqs.rows.map((q) => {
    const last = m.lastRate.get(String(q.material_id));
    return last ? { q, last, variance: ((Number(q.rate) - last.rate) / last.rate) * 100 } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 4);

  return (
    <div className="space-y-5">
      <StatGrid cols={5}>
        <StatCard label="Open POs" value={String(m.open.length)} sub={money(m.open.reduce((s, p) => s + Number(p.total ?? 0), 0), true)} />
        <StatCard label="POs pending GRN" value={String(m.pendingGrn.length)} />
        <StatCard label="Delayed POs" value={String(m.delayed.length)} variant={m.delayed.length ? 'red' : 'green'} />
        <StatCard label="Invoice price exceptions" value={String(m.priceExc.length)} variant={m.priceExc.length ? 'amber' : 'green'} />
        <StatCard label="Avg PR → PO cycle" value={m.cycle === null ? '—' : `${m.cycle.toFixed(1)} days`} />
      </StatGrid>

      <Panel title="Active PO queue" actions={<Button size="sm" tone="secondary" onClick={() => navigate('/procurement/purchase_orders')}>All POs</Button>}>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['PO number', 'Supplier', 'Material', 'Qty', 'Amount', 'Expected', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {m.open.slice(0, 8).map((p) => {
                const l = ((p.lines as LineItem[]) ?? [])[0];
                const late = m.delayed.find((d) => d.po.id === p.id);
                return (
                  <tr key={p.id} onClick={() => navigate(routeFor('purchase_orders', p.id))} className="cursor-pointer border-b border-base-border last:border-0 hover:bg-base-hover">
                    <td className="td font-mono">{String(p.number)}</td>
                    <td className="td">{name('suppliers', p.supplier_id)}</td>
                    <td className="td text-ink-muted">{l ? name('materials', l.material_id) : '—'}{((p.lines as LineItem[]) ?? []).length > 1 ? ' +' : ''}</td>
                    <td className="td font-mono">{l ? qty(l.qty, 0) : '—'}</td>
                    <td className="td font-mono">{money(p.total, true)}</td>
                    <td className={`td font-mono ${late ? 'text-accent-red' : ''}`}>{date(p.expected_date)}{late ? ` (${late.daysLate}d late)` : ''}</td>
                    <td className="td"><StatusBadge def={def} value={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-base-border md:hidden">
          {m.open.slice(0, 8).map((p) => (
            <li key={p.id}><button onClick={() => navigate(routeFor('purchase_orders', p.id))} className="w-full px-4 py-3 text-left">
              <div className="flex justify-between gap-2"><span className="font-mono text-sm">{String(p.number)}</span><StatusBadge def={def} value={p.status} /></div>
              <p className="text-xs text-ink-muted">{name('suppliers', p.supplier_id)} · {money(p.total, true)} · due {date(p.expected_date)}</p>
            </button></li>
          ))}
        </ul>
        {!m.open.length && <EmptyState title="No open purchase orders" />}
      </Panel>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Price intelligence — open supplier quotes vs last PO rate</h3>
        {anomalies.length === 0 ? <InfoBox>No open supplier quotations to compare with purchase history.</InfoBox> : (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border lg:grid-cols-2">
            {anomalies.map(({ q, last, variance }) => {
              const high = variance > 2;
              return (
                <div key={q.id} className="bg-base-panel p-4 sm:p-5">
                  <div className="flex items-center gap-2">
                    {high ? <AlertTriangle className="h-5 w-5 text-accent-amber" /> : <CheckCircle2 className="h-5 w-5 text-accent-green" />}
                    <span className="text-sm font-semibold text-ink-primary">{name('materials', q.material_id)}</span>
                  </div>
                  <p className="mt-2 text-sm text-ink-muted">{name('suppliers', q.supplier_id)} quoted {money(q.rate)} vs {money(last.rate)} on {last.po}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`font-mono text-sm font-semibold ${high ? 'text-accent-red' : 'text-accent-green'}`}>{variance > 0 ? '+' : ''}{variance.toFixed(1)}%</span>
                    <Button size="sm" tone="secondary" className="ml-auto" onClick={() => navigate(`/procurement/comparison?pr=${q.requisition_id}`)}>Compare quotes</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RaisePO({ pr }: { pr: BaseRow }) {
  const { can } = useApp();
  const act = useActions();
  const suppliers = useLookup('suppliers');
  const materials = useLookup('materials');
  const warehouses = useLookup('warehouses');
  const [open, setOpen] = useState(false);
  const mat = materials.map.get(String(pr.material_id));
  const [supplier, setSupplier] = useState('');
  const [rate, setRate] = useState<number | ''>('');
  const [wh, setWh] = useState('');
  if (pr.status !== 'approved' || !can('procurement', 'create')) return null;
  return (
    <>
      <Button icon={ShoppingCart} onClick={() => { setSupplier(String(mat?.preferred_supplier_id ?? '')); setRate(Number(pr.estimated_rate) || Number(mat?.standard_cost) || ''); setWh(String(warehouses.rows.find((w) => w.kind === 'raw_material')?.id ?? '')); setOpen(true); }}>Raise PO</Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Raise PO for ${pr.number}`} subtitle={`${displayName(mat)} × ${qty(pr.qty)}`}
        footer={<><Button tone="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={act.busy} disabled={!supplier || !rate || !wh} onClick={async () => {
            const out = await act.rpc<BaseRow>('create_po_from_requisition', { p_requisition_id: pr.id, p_supplier_id: supplier, p_rate: rate, p_warehouse_id: wh }, 'Draft PO created').catch(() => null);
            if (out?.status === 'saved') navigate(routeFor('purchase_orders', out.result.id));
          }}>Create draft PO</Button></>}>
        <div className="space-y-4">
          <InfoBox>Prefer comparing supplier quotations first? Use the <button className="text-accent-blue underline" onClick={() => navigate(`/procurement/comparison?pr=${pr.id}`)}>comparative statement</button>.</InfoBox>
          <label className="block"><span className="label">Supplier *</span>
            <select className="input" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
              <option value="">Select…</option>
              {suppliers.rows.filter((s) => s.status !== 'blocked').map((s) => <option key={s.id} value={s.id}>{displayName(s)}{s.id === mat?.preferred_supplier_id ? ' (preferred)' : ''}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Rate *</span><input type="number" min={0} step="any" className="input font-mono" value={rate} onChange={(e) => setRate(e.target.value === '' ? '' : Number(e.target.value))} /></label>
          <label className="block"><span className="label">Deliver to *</span>
            <select className="input" value={wh} onChange={(e) => setWh(e.target.value)}>
              <option value="">Select…</option>
              {warehouses.rows.map((w) => <option key={w.id} value={w.id}>{displayName(w)}</option>)}
            </select>
          </label>
          {rate !== '' && <p className="text-sm text-ink-muted">PO value before tax: <span className="font-mono text-ink-primary">{money(Number(rate) * Number(pr.qty))}</span></p>}
        </div>
      </Sheet>
    </>
  );
}

function PrQuotes({ pr }: { pr: BaseRow }) {
  const q = useQuery('supplier_quotations', { where: { requisition_id: pr.id } });
  if (!q.rows.length) return <QuickCreate table="supplier_quotations" label="Record supplier quotation" initial={{ requisition_id: pr.id, material_id: pr.material_id }} stay />;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-muted">{q.rows.length} supplier quotation(s) received.</span>
      <Button size="sm" tone="secondary" onClick={() => navigate(`/procurement/comparison?pr=${pr.id}`)}>Open comparative statement</Button>
      <QuickCreate size="sm" table="supplier_quotations" label="Add quotation" initial={{ requisition_id: pr.id, material_id: pr.material_id }} stay />
    </div>
  );
}

function Comparison() {
  const { can } = useApp();
  const act = useActions();
  const prs = useQuery('purchase_requisitions', { where: { status: ['submitted', 'approved', 'ordered'] }, orderBy: { key: 'created_at', dir: 'desc' }, limit: 200 });
  const { name, maps } = useRefMaps(['suppliers', 'materials']);
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const [prId, setPrId] = useState(params.get('pr') ?? '');
  const pr = prs.rows.find((p) => p.id === prId) ?? prs.rows.find((p) => p.status === 'approved');
  const quotes = useQuery('supplier_quotations', { where: { requisition_id: pr?.id ?? '' } }, { enabled: !!pr });
  const ds = useDataset(defaultFilters(180), { lookbackDays: 180 });
  const scores = useMemo(() => new Map(supplierScorecard(ds).map((s) => [s.supplier.id, s])), [ds]);
  const ranked = [...quotes.rows].sort((a, b) => Number(a.rate) - Number(b.rate));
  const best = ranked[0];

  return (
    <div className="space-y-5">
      <Panel title="Comparative statement" subtitle="Supplier quotations for one requisition, ranked by price, with lead time, terms and track record">
        <div className="flex flex-wrap items-end gap-3 border-b border-base-border p-4">
          <label className="min-w-[260px] flex-1"><span className="label">Requisition</span>
            <select className="input" value={pr?.id ?? ''} onChange={(e) => setPrId(e.target.value)}>
              {prs.rows.map((p) => <option key={p.id} value={p.id}>{String(p.number)} — {name('materials', p.material_id)} × {qty(p.qty)} ({String(p.status)})</option>)}
            </select>
          </label>
          {pr && <QuickCreate table="supplier_quotations" label="Add quotation" initial={{ requisition_id: pr.id, material_id: pr.material_id }} stay />}
        </div>
        {!pr ? <EmptyState title="No requisitions to compare" /> : !ranked.length ? <EmptyState title="No quotations yet">Record supplier quotations against {String(pr.number)} to compare them.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-base-border bg-base-subtle"><tr>{['Rank', 'Supplier', 'Rate', 'Total value', 'vs best', 'Lead time', 'Terms', 'On-time %', 'Rejection %', 'Status', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {ranked.map((q, i) => {
                  const sc = scores.get(String(q.supplier_id));
                  const diff = best ? ((Number(q.rate) - Number(best.rate)) / Number(best.rate)) * 100 : 0;
                  return (
                    <tr key={q.id} className={`border-b border-base-border last:border-0 ${i === 0 ? 'bg-accent-green/5' : ''}`}>
                      <td className="td">{i === 0 ? <Trophy className="h-4 w-4 text-accent-green" /> : i + 1}</td>
                      <td className="td font-medium">{name('suppliers', q.supplier_id)}</td>
                      <td className="td font-mono">{money(q.rate)}</td>
                      <td className="td font-mono">{money(Number(q.rate) * Number(pr.qty), true)}</td>
                      <td className={`td font-mono ${diff > 0 ? 'text-accent-red' : 'text-accent-green'}`}>{i === 0 ? 'Best' : `+${diff.toFixed(1)}%`}</td>
                      <td className="td font-mono">{String(q.lead_time_days)} d</td>
                      <td className="td font-mono">{q.payment_terms_days ? `${q.payment_terms_days} d` : '—'}</td>
                      <td className="td font-mono">{pct(sc?.onTimePct ?? null, 0)}</td>
                      <td className="td font-mono">{pct(sc?.rejectionPct ?? null)}</td>
                      <td className="td"><StatusBadge def={entity('supplier_quotations')} value={q.status} /></td>
                      <td className="td">
                        {pr.status === 'approved' && can('procurement', 'create') && (
                          <Button size="sm" tone={i === 0 ? 'primary' : 'secondary'} loading={act.busy} onClick={async () => {
                            const out = await act.rpc<BaseRow>('create_po_from_requisition', { p_requisition_id: pr.id, p_supplier_quotation_id: q.id }, `PO raised on ${name('suppliers', q.supplier_id)}`).catch(() => null);
                            if (out?.status === 'saved') navigate(routeFor('purchase_orders', out.result.id));
                          }}>Select & raise PO</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pr && pr.status !== 'approved' && ranked.length > 0 && <p className="border-t border-base-border px-4 py-3 text-xs text-ink-muted">A PO can be raised once {String(pr.number)} is approved (currently {String(pr.status)}).</p>}
        {pr && maps.materials && <p className="px-4 pb-3 text-xs text-ink-faint">Standard cost of {name('materials', pr.material_id)}: {money(maps.materials.get(String(pr.material_id))?.standard_cost)}</p>}
      </Panel>
    </div>
  );
}

function ReceiveGoods({ po }: { po: BaseRow }) {
  if (!['approved', 'sent', 'partially_received'].includes(String(po.status))) return null;
  return (
    <QuickCreate table="grns" icon={PackagePlus} label="Receive goods (GRN)" title={`Goods receipt against ${po.number}`}
      initial={() => ({
        po_id: po.id, supplier_id: po.supplier_id, warehouse_id: po.delivery_warehouse_id, received_date: ymd(),
        lines: ((po.lines as LineItem[]) ?? []).map((l) => ({ material_id: l.material_id, qty: Math.max(0, Number(l.qty) - Number(l.received_qty ?? 0)), rejected_qty: 0, rate: l.rate, batch_no: '' })).filter((l) => l.qty > 0),
      })} />
  );
}

function PoReceipts({ po }: { po: BaseRow }) {
  const grns = useQuery('grns', { where: { po_id: po.id } });
  const invs = useQuery('invoices', { where: { po_id: po.id } });
  if (!grns.rows.length && !invs.rows.length) return null;
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {grns.rows.map((g) => <button key={g.id} onClick={() => navigate(routeFor('grns', g.id))}><Badge variant={g.status === 'posted' ? 'green' : 'grey'}>{String(g.number)}</Badge></button>)}
      {invs.rows.map((i) => <button key={i.id} onClick={() => navigate(routeFor('invoices', i.id))}><Badge variant={i.match_status === 'matched' ? 'green' : 'amber'}>{String(i.invoice_no)}</Badge></button>)}
    </div>
  );
}

export function ReorderPanel() {
  const ds = useDataset(defaultFilters(30));
  const rows = useMemo(() => stockPosition(ds).filter((s) => s.belowReorder || (s.cover !== null && s.cover < Number(s.material.lead_time_days) + 3))
    .sort((a, b) => (a.cover ?? 999) - (b.cover ?? 999)), [ds]);
  const openPR = new Set(ds.requisitions.filter((r) => ['draft', 'submitted', 'approved'].includes(String(r.status))).map((r) => String(r.material_id)));
  const { name } = useRefMaps(['suppliers']);
  if (ds.loading) return <Spinner />;
  return (
    <Panel title="Reorder recommendations" subtitle="Materials below reorder level, or whose days of cover is shorter than lead time + 3 days (30-day consumption)">
      {!rows.length ? <EmptyState title="No reorders needed" /> : (
        <ul className="divide-y divide-base-border">
          {rows.map((s) => {
            const m = s.material;
            const suggested = Math.max(Number(m.reorder_qty), Math.ceil(Number(m.reorder_level) - s.onHand - s.openPoQty));
            return (
              <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-primary">{String(m.name)} <span className="font-mono text-xs text-ink-muted">{String(m.code)}</span></p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    On hand <b className="text-ink-primary">{qty(s.onHand, 0)} {String(m.uom)}</b> · reorder at {qty(m.reorder_level, 0)} · cover {s.cover === null ? 'n/a' : `${s.cover.toFixed(1)} d`} · lead time {String(m.lead_time_days)} d
                    {s.openPoQty > 0 ? ` · ${qty(s.openPoQty, 0)} on open POs` : ''}{m.preferred_supplier_id ? ` · preferred: ${name('suppliers', m.preferred_supplier_id)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  {s.cover !== null && s.cover < Number(m.lead_time_days) && <Badge variant="red">Stock-out before delivery</Badge>}
                  {openPR.has(m.id) ? <Badge variant="blue">Requisition open</Badge> : (
                    <QuickCreate table="purchase_requisitions" size="sm" label={`Create PR (${qty(suggested, 0)})`} initial={{
                      request_type: 'purchase', material_id: m.id, qty: suggested, estimated_rate: m.standard_cost, required_by: addDays(ymd(), Number(m.lead_time_days)),
                      priority: s.cover !== null && s.cover < Number(m.lead_time_days) ? 'urgent' : 'high', source: 'reorder',
                      reason: `Reorder recommendation: ${qty(s.onHand, 0)} ${m.uom} on hand, ${s.cover === null ? 'no recent consumption' : `${s.cover.toFixed(1)} days cover`}.`,
                    }} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Performance() {
  const ds = useDataset(defaultFilters(180), { lookbackDays: 180 });
  const rows = useMemo(() => supplierScorecard(ds).filter((s) => s.poCount || s.invoices).sort((a, b) => b.spend - a.spend), [ds]);
  if (ds.loading) return <Spinner />;
  const risk = (s: (typeof rows)[number]) => ((s.onTimePct ?? 100) < 85 || (s.rejectionPct ?? 0) > 5 || (s.ppvPct ?? 0) > 5 ? 'HIGH' : (s.onTimePct ?? 100) < 95 || (s.rejectionPct ?? 0) > 2 || (s.ppvPct ?? 0) > 2 ? 'MEDIUM' : 'LOW');
  return (
    <Panel title="Supplier performance & purchase price variance" subtitle="On-time = GRN received on or before PO expected date. PPV = invoiced rate vs PO rate, weighted by quantity.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-base-border bg-base-subtle"><tr>{['Supplier', 'Spend', 'POs', 'Deliveries', 'On-time %', 'Rejection %', 'PPV %', 'PPV value', 'Risk'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((s) => {
              const r = risk(s);
              return (
                <tr key={s.supplier.id} className="border-b border-base-border last:border-0 hover:bg-base-hover">
                  <td className="td font-medium"><button className="hover:text-accent-blue" onClick={() => navigate(routeFor('suppliers', s.supplier.id))}>{String(s.supplier.name)}</button></td>
                  <td className="td font-mono">{money(s.spend, true)}</td>
                  <td className="td font-mono">{s.poCount}</td>
                  <td className="td font-mono">{s.deliveries}</td>
                  <td className="td font-mono">{pct(s.onTimePct, 0)}</td>
                  <td className={`td font-mono ${(s.rejectionPct ?? 0) > 2 ? 'text-accent-red' : ''}`}>{pct(s.rejectionPct)}</td>
                  <td className={`td font-mono ${(s.ppvPct ?? 0) > 2 ? 'text-accent-red' : ''}`}>{s.ppvPct === null ? '—' : `${s.ppvPct > 0 ? '+' : ''}${s.ppvPct.toFixed(1)}%`}</td>
                  <td className="td font-mono">{money(s.ppvValue, true)}</td>
                  <td className="td"><Badge variant={r === 'HIGH' ? 'red' : r === 'MEDIUM' ? 'amber' : 'green'}>{r}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
