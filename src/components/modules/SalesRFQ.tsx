import { AlertTriangle, ArrowRightLeft, CheckCircle2, Factory, Truck } from 'lucide-react';
import { Badge, Button, ClickableRow, Panel, StatCard, StatGrid } from '@/components/ui';
import EntityManager, { StatusBadge } from '@/components/data/EntityManager';
import { DocumentCapture } from '@/components/data/DocumentCapture';
import { useApp } from '@/lib/app';
import { entity } from '@/lib/data/entities';
import { useActions, useQuery, useRefMaps } from '@/lib/data/hooks';
import type { BaseRow, LineItem } from '@/lib/data/schema';
import { parseRfq } from '@/lib/extract';
import { date, money, pct, qty } from '@/lib/format';
import { navigate, setParam, useRoute } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { ModuleTabs, useModuleTab } from './shared';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'rfqs', label: 'RFQs' },
  { id: 'quotations', label: 'Quotations' },
  { id: 'sales_orders', label: 'Sales orders' },
  { id: 'customers', label: 'Customers' },
];

export default function SalesRFQ({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab, TABS);
  return (
    <div className="space-y-5">
      <ModuleTabs module="sales" tabs={TABS} current={current} />
      {current === 'overview' && <SalesOverview />}
      {current === 'rfqs' && (
        <div className="space-y-5">
          <DocumentCapture table="rfqs" kind="rfq" title="Register RFQ from a document"
            hint="Upload the customer’s enquiry (email export, text, PDF or photo). Recognised fields are pre-filled for review."
            parse={(text, maps) => parseRfq(text, { customers: [...(maps.customers?.values() ?? [])], products: [...(maps.materials?.values() ?? [])].filter((m) => m.type === 'fg') })} />
          <EntityManager table="rfqs" rowActions={(r) => <QuoteFromRfq rfq={r} />} />
        </div>
      )}
      {current === 'quotations' && <EntityManager table="quotations" rowActions={(r) => <ConvertQuotation q={r} />} detailExtra={(r) => <Costing q={r} />} />}
      {current === 'sales_orders' && <EntityManager table="sales_orders" rowActions={(r) => <OrderActions so={r} />} detailExtra={(r) => <OrderTracking so={r} />} />}
      {current === 'customers' && <EntityManager table="customers" />}
    </div>
  );
}

function SalesOverview() {
  const rfqs = useQuery('rfqs', { orderBy: { key: 'received_date', dir: 'desc' }, limit: 500 });
  const quotes = useQuery('quotations', { limit: 500 });
  const orders = useQuery('sales_orders', { limit: 500 });
  const { name } = useRefMaps(['customers', 'materials']);
  const month = new Date().toISOString().slice(0, 7);
  const thisMonth = rfqs.rows.filter((r) => String(r.received_date).startsWith(month));
  const decided = rfqs.rows.filter((r) => ['won', 'lost'].includes(String(r.status)));
  const winRate = decided.length ? (decided.filter((r) => r.status === 'won').length / decided.length) * 100 : null;
  const openQuoteValue = quotes.rows.filter((q) => ['draft', 'pending_approval', 'approved', 'sent'].includes(String(q.status))).reduce((s, q) => s + Number(q.total ?? 0), 0);
  const openOrders = orders.rows.filter((o) => !['closed', 'cancelled', 'delivered'].includes(String(o.status)));
  const today = new Date().toISOString().slice(0, 10);
  const late = openOrders.filter((o) => String(o.delivery_date) < today);
  const recent = rfqs.rows.slice(0, 6);
  const selectedId = useRoute().params.get('rfq');
  const selected = recent.find((r) => r.id === selectedId) ?? null;
  const def = entity('rfqs');

  return (
    <div className="space-y-5">
      <StatGrid cols={5}>
        <StatCard label="RFQs this month" value={String(thisMonth.length)} sub={`${rfqs.rows.filter((r) => ['new', 'under_review'].includes(String(r.status))).length} awaiting quote`} />
        <StatCard label="Win rate" value={pct(winRate, 0)} variant="green" sub={`${decided.length} decided`} />
        <StatCard label="Open quotation value" value={money(openQuoteValue, true)} sub={`${quotes.rows.filter((q) => q.status === 'pending_approval').length} pending approval`} />
        <StatCard label="Open sales orders" value={String(openOrders.length)} sub={money(openOrders.reduce((s, o) => s + Number(o.total ?? 0), 0), true)} />
        <StatCard label="Orders past delivery date" value={String(late.length)} variant={late.length ? 'red' : 'green'} />
      </StatGrid>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Recent RFQs" actions={<Button size="sm" tone="secondary" onClick={() => navigate('/sales/rfqs')}>View all</Button>}>
          <div>
            {recent.map((r) => (
              <ClickableRow key={r.id} active={selected?.id === r.id} onClick={() => setParam('rfq', selected?.id === r.id ? null : r.id)}>
                <span className="font-mono text-sm text-ink-primary">{String(r.number)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{name('customers', r.customer_id)}</span>
                <span className="font-mono text-sm text-ink-primary">{qty(r.quantity, 0)}</span>
                <StatusBadge def={def} value={r.status} />
              </ClickableRow>
            ))}
            {!recent.length && <p className="p-6 text-center text-sm text-ink-muted">No RFQs yet.</p>}
          </div>
        </Panel>

        {selected ? (
          <Panel title={String(selected.number)} subtitle={`Received ${date(selected.received_date)} via ${String(selected.source ?? '').replace('_', ' ')}`}>
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-base-border bg-base-border sm:grid-cols-2">
                {[['Customer', name('customers', selected.customer_id)], ['Product', name('materials', selected.product_id)], ['Quantity', qty(selected.quantity, 0)],
                  ['Required by', date(selected.required_by)], ['Target price', selected.target_price ? money(selected.target_price) : '—'], ['Customer ref', String(selected.customer_ref ?? '—')]].map(([k, v]) => (
                  <div key={k} className="bg-base-panel px-4 py-3">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">{k}</p>
                    <p className="mt-1 text-sm text-ink-primary">{v}</p>
                  </div>
                ))}
              </div>
              <RfqChecks rfq={selected} />
              <div className="flex flex-wrap gap-2">
                <QuoteFromRfq rfq={selected} />
                <Button tone="secondary" onClick={() => navigate(routeFor('rfqs', selected.id))}>Open RFQ</Button>
              </div>
            </div>
          </Panel>
        ) : (
          <Panel title="Quotation pipeline">
            <div className="divide-y divide-base-border">
              {entity('quotations').statuses!.map((s) => {
                const list = quotes.rows.filter((q) => q.status === s.value);
                return (
                  <button key={s.value} onClick={() => navigate('/sales/quotations')} className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-base-hover">
                    <Badge variant={s.variant}>{s.label}</Badge>
                    <span className="font-mono text-sm text-ink-primary">{list.length} · {money(list.reduce((a, q) => a + Number(q.total ?? 0), 0), true)}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

/** Validation checks computed from master data, replacing the previous fixed list. */
function RfqChecks({ rfq }: { rfq: BaseRow }) {
  const { maps } = useRefMaps(['materials', 'customers']);
  const product = maps.materials?.get(String(rfq.product_id));
  const customer = maps.customers?.get(String(rfq.customer_id));
  const lead = Number(product?.lead_time_days ?? 7);
  const daysAvail = rfq.required_by ? Math.round((Date.parse(String(rfq.required_by)) - Date.now()) / 86_400_000) : null;
  const margin = product && rfq.target_price ? ((Number(rfq.target_price) - Number(product.standard_cost)) / Number(rfq.target_price)) * 100 : null;
  const checks = [
    { ok: !!product && product.type === 'fg', text: product ? `Product exists in master (${product.code})` : 'Product not found in master' },
    { ok: !!customer?.gstin, text: customer?.gstin ? 'Customer GSTIN on file' : 'Customer GSTIN missing' },
    { ok: daysAvail === null || daysAvail >= lead + 7, text: daysAvail === null ? 'No required-by date' : `${daysAvail} days to required date (lead time ${lead} d)` },
    { ok: margin === null || margin >= 15, text: margin === null ? 'No target price to check margin' : `Margin at target price: ${margin.toFixed(1)}% vs standard cost` },
  ];
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">Feasibility checks</p>
      <ul className="space-y-1.5">
        {checks.map((c) => (
          <li key={c.text} className={`flex items-center gap-2 text-sm ${c.ok ? 'text-accent-green' : 'text-accent-amber'}`}>
            {c.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}{c.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuoteFromRfq({ rfq }: { rfq: BaseRow }) {
  const { can } = useApp();
  const act = useActions();
  const { maps } = useRefMaps(['materials']);
  if (!can('sales', 'create') || !['new', 'under_review'].includes(String(rfq.status))) return null;
  const create = async () => {
    const p = maps.materials?.get(String(rfq.product_id));
    const rate = Number(rfq.target_price) || Number(p?.selling_price ?? 0);
    const qn = Number(rfq.quantity);
    const out = await act.insert('quotations', {
      rfq_id: rfq.id, customer_id: rfq.customer_id, quote_date: new Date().toISOString().slice(0, 10),
      valid_until: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      lines: [{ material_id: rfq.product_id, qty: qn, rate }], material_cost: Math.round(qn * Number(p?.standard_cost ?? 0) * 0.7),
      conversion_cost: Math.round(qn * Number(p?.standard_cost ?? 0) * 0.3), tax_pct: 18, terms: 'Ex-works. Payment as per agreed terms.',
    }, 'Draft quotation').catch(() => null);
    if (out?.status === 'saved') navigate(routeFor('quotations', out.result.id));
  };
  return <Button onClick={() => void create()} loading={act.busy}>Generate quotation</Button>;
}

function Costing({ q }: { q: BaseRow }) {
  const sub = Number(q.subtotal ?? 0);
  const mat = Number(q.material_cost ?? 0), conv = Number(q.conversion_cost ?? 0);
  const units = ((q.lines as LineItem[]) ?? []).reduce((s, l) => s + Number(l.qty), 0);
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-base-border bg-base-border sm:grid-cols-4">
      {[['Material cost', money(mat, true)], ['Conversion cost', money(conv, true)], ['Cost / unit', units ? money((mat + conv) / units) : '—'], ['Margin', q.margin_pct === null || q.margin_pct === undefined ? '—' : pct(Number(q.margin_pct))]].map(([k, v]) => (
        <div key={k} className="bg-base-subtle px-3 py-2"><p className="text-[11px] text-ink-muted">{k}</p><p className="font-mono text-sm text-ink-primary">{v}</p></div>
      ))}
      {sub > 0 && mat + conv > sub && <p className="col-span-full bg-accent-red/5 px-3 py-2 text-xs text-accent-red">Quoted price is below cost.</p>}
    </div>
  );
}

function ConvertQuotation({ q }: { q: BaseRow }) {
  const { can } = useApp();
  const act = useActions();
  if (q.status !== 'accepted' || !can('sales', 'create')) return null;
  return (
    <Button icon={ArrowRightLeft} loading={act.busy} onClick={async () => {
      const out = await act.rpc<BaseRow>('convert_quotation', { p_quotation_id: q.id }, 'Sales order created').catch(() => null);
      if (out?.status === 'saved') navigate(routeFor('sales_orders', out.result.id));
    }}>Convert to sales order</Button>
  );
}

function OrderActions({ so }: { so: BaseRow }) {
  const { can } = useApp();
  const act = useActions();
  return (
    <>
      {so.status === 'confirmed' && can('production', 'create') && (
        <Button tone="secondary" icon={Factory} loading={act.busy} onClick={() => void act.rpc('create_production_orders_from_so', { p_sales_order_id: so.id }, 'Production orders created').then((o) => o?.status === 'saved' && navigate('/production/production_orders')).catch(() => undefined)}>Release to production</Button>
      )}
      {['ready_to_dispatch', 'in_production'].includes(String(so.status)) && can('logistics', 'create') && (
        <Button tone="secondary" icon={Truck} loading={act.busy} onClick={() => void act.rpc<BaseRow>('create_shipment_from_so', { p_sales_order_id: so.id }, 'Delivery order created').then((o) => o?.status === 'saved' && navigate(routeFor('shipments', o.result.id))).catch(() => undefined)}>Create delivery order</Button>
      )}
    </>
  );
}

function OrderTracking({ so }: { so: BaseRow }) {
  const prod = useQuery('production_orders', { where: { sales_order_id: so.id } });
  const ships = useQuery('shipments', { where: { sales_order_id: so.id } });
  const ordered = ((so.lines as LineItem[]) ?? []).reduce((s, l) => s + Number(l.qty), 0);
  const produced = prod.rows.reduce((s, p) => s + Number(p.produced_qty ?? 0), 0);
  const shipped = ships.rows.filter((s) => !['planned', 'loaded', 'cancelled'].includes(String(s.status))).reduce((s, x) => s + ((x.lines as LineItem[]) ?? []).reduce((a, l) => a + Number(l.qty), 0), 0);
  const delivered = ships.rows.filter((s) => ['delivered', 'pod_received'].includes(String(s.status))).reduce((s, x) => s + ((x.lines as LineItem[]) ?? []).reduce((a, l) => a + Number(l.qty), 0), 0);
  const steps = [['Ordered', ordered], ['Produced', produced], ['Shipped', shipped], ['Delivered', delivered]] as const;
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">Order tracking</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map(([k, v]) => (
          <div key={k} className="rounded-lg border border-base-border p-3">
            <p className="text-xs text-ink-muted">{k}</p>
            <p className="font-mono text-lg font-semibold text-ink-primary">{qty(v, 0)}</p>
            <div className="mt-1 h-1.5 rounded-full bg-base-hover"><div className="h-full rounded-full bg-accent-blue" style={{ width: `${ordered ? Math.min(100, (v / ordered) * 100) : 0}%` }} /></div>
          </div>
        ))}
      </div>
      {(prod.rows.length > 0 || ships.rows.length > 0) && (
        <ul className="mt-3 space-y-1 text-sm">
          {prod.rows.map((p) => <li key={p.id}><button className="text-accent-blue hover:underline" onClick={() => navigate(routeFor('production_orders', p.id))}>{String(p.number)}</button> <span className="text-ink-muted">· {String(p.status).replace('_', ' ')}</span></li>)}
          {ships.rows.map((s) => <li key={s.id}><button className="text-accent-blue hover:underline" onClick={() => navigate(routeFor('shipments', s.id))}>{String(s.number)}</button> <span className="text-ink-muted">· {String(s.status).replace('_', ' ')} · ETA {date(s.eta)}</span></li>)}
        </ul>
      )}
    </div>
  );
}
