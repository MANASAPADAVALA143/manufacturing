import { useMemo } from 'react';
import { AlertTriangle, Clock, Package, Printer, Truck } from 'lucide-react';
import { Badge, Button, EmptyState, InfoBox, Panel, Spinner, StatCard, StatGrid } from '@/components/ui';
import EntityManager, { StatusBadge } from '@/components/data/EntityManager';
import { BarChart, CHART } from '@/components/charts';
import { useApp } from '@/lib/app';
import { entity } from '@/lib/data/entities';
import { useActions, useRefMaps } from '@/lib/data/hooks';
import type { BaseRow, LineItem } from '@/lib/data/schema';
import { defaultFilters, dispatchPerformance } from '@/lib/analytics';
import { useDataset } from '@/lib/useDataset';
import { addDays, daysBetween, ymd } from '@/lib/dates';
import { date, money, pct, qty } from '@/lib/format';
import { printReport } from '@/lib/export';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { useToast } from '@/components/Toast';
import { ModuleTabs, useModuleTab } from './shared';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'planning', label: 'Dispatch planning' },
  { id: 'shipments', label: 'Delivery orders' },
  { id: 'carriers', label: 'Carrier performance' },
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'transporters', label: 'Transporters' },
];

export default function Logistics({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab, TABS);
  return (
    <div className="space-y-5">
      <ModuleTabs module="logistics" tabs={TABS} current={current} />
      {current === 'dashboard' && <Dashboard />}
      {current === 'planning' && <Planning />}
      {current === 'shipments' && <EntityManager table="shipments" rowActions={(r) => <ChallanButton s={r} />} detailExtra={(r) => <PodHint s={r} />} />}
      {current === 'carriers' && <Carriers />}
      {current === 'vehicles' && <EntityManager table="vehicles" />}
      {current === 'transporters' && <EntityManager table="transporters" />}
    </div>
  );
}

function PodHint({ s }: { s: BaseRow }) {
  if (s.status === 'delivered') return <InfoBox variant="amber">Upload the signed proof of delivery (photo or PDF) below, then mark “POD received”.</InfoBox>;
  if (s.status === 'delayed') return <InfoBox variant="red">Delayed — see the audit trail for the reported reason. ETA {date(s.eta)}.</InfoBox>;
  return null;
}

function ChallanButton({ s }: { s: BaseRow }) {
  const { company } = useApp();
  const { name, maps } = useRefMaps(['customers', 'materials', 'transporters', 'vehicles', 'sales_orders']);
  const { showToast } = useToast();
  const lines = (s.lines as LineItem[]) ?? [];
  return (
    <Button tone="secondary" icon={Printer} onClick={() => {
      const ok = printReport({
        title: `Delivery Challan ${s.challan_no ?? s.number}`,
        subtitle: `${name('customers', s.customer_id)} · ${s.destination} · SO ${name('sales_orders', s.sales_order_id)} · E-way bill ${s.eway_bill_no ?? '—'} · LR ${s.lr_no ?? '—'} · Vehicle ${maps.vehicles?.get(String(s.vehicle_id))?.registration_no ?? '—'} (${name('transporters', s.transporter_id)})`,
        company: company?.name ?? '',
        rows: lines,
        cols: [
          { label: 'Code', value: (l) => String(maps.materials?.get(l.material_id)?.code ?? '') },
          { label: 'Description', value: (l) => name('materials', l.material_id) },
          { label: 'HSN', value: (l) => String(maps.materials?.get(l.material_id)?.hsn_code ?? '') },
          { label: 'Qty', value: (l) => l.qty },
          { label: 'UOM', value: (l) => String(maps.materials?.get(l.material_id)?.uom ?? '') },
        ],
        summary: [['DO number', String(s.number)], ['Dispatch date', date(s.dispatch_date)], ['Receiver signature', '______________________']],
      });
      if (!ok) showToast('Allow pop-ups to print the challan', 'warning');
    }}>Print challan</Button>
  );
}

function Dashboard() {
  const ds = useDataset(defaultFilters(30));
  const def = entity('shipments');
  const { name } = useRefMaps(['customers', 'transporters']);
  const month = ymd().slice(0, 7);
  const m = useMemo(() => {
    const perf = dispatchPerformance(ds, addDays(ymd(), -29), ymd());
    const delivered = ds.shipments.filter((s) => s.delivered_on && s.dispatch_date);
    const transit = delivered.length ? delivered.reduce((a, s) => a + daysBetween(String(s.dispatch_date), String(s.delivered_on)), 0) / delivered.length : null;
    const weeks = [3, 2, 1, 0].map((w) => {
      const to = addDays(ymd(), -7 * w), from = addDays(to, -6);
      return { label: `${from.slice(5)}–${to.slice(5)}`, p: dispatchPerformance(ds, from, to).onTimePct };
    });
    return { perf, transit, weeks };
  }, [ds]);
  if (ds.loading) return <Spinner />;
  const active = m.perf.active;
  return (
    <div className="space-y-5">
      <StatGrid cols={5}>
        <StatCard label="Shipments this month" value={String(ds.shipments.filter((s) => String(s.dispatch_date).startsWith(month)).length)} />
        <StatCard label="On-time delivery (30d)" value={pct(m.perf.onTimePct)} variant={(m.perf.onTimePct ?? 100) < 95 ? 'amber' : 'green'} />
        <StatCard label="Delayed / past ETA" value={String(m.perf.late.length)} variant={m.perf.late.length ? 'red' : 'green'} />
        <StatCard label="Avg transit time" value={m.transit === null ? '—' : `${m.transit.toFixed(1)} days`} />
        <StatCard label="Freight (30d)" value={money(m.perf.freight, true)} />
      </StatGrid>

      <Panel title="Active shipments" actions={<Button size="sm" tone="secondary" onClick={() => navigate('/logistics/shipments')}>All delivery orders</Button>}>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['DO #', 'Customer', 'Destination', 'Carrier', 'ETA', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {active.map((s) => {
                const late = m.perf.late.includes(s);
                return (
                  <tr key={s.id} onClick={() => navigate(routeFor('shipments', s.id))} className="cursor-pointer border-b border-base-border last:border-0 hover:bg-base-hover">
                    <td className="td font-mono">{String(s.number)}</td>
                    <td className="td">{name('customers', s.customer_id)}</td>
                    <td className="td text-ink-muted">{String(s.destination)}</td>
                    <td className="td text-ink-muted">{name('transporters', s.transporter_id) || '—'}</td>
                    <td className={`td font-mono ${late ? 'text-accent-red' : String(s.eta) === ymd() ? 'text-accent-amber' : 'text-ink-muted'}`}>{date(s.eta)}</td>
                    <td className="td"><span className="inline-flex items-center gap-2">{late && <AlertTriangle className="h-3.5 w-3.5 text-accent-red" />}<StatusBadge def={def} value={s.status} /></span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <ul className="divide-y divide-base-border md:hidden">
          {active.map((s) => (
            <li key={s.id}><button onClick={() => navigate(routeFor('shipments', s.id))} className="w-full px-4 py-3 text-left">
              <div className="flex justify-between gap-2"><span className="font-mono text-sm">{String(s.number)}</span><StatusBadge def={def} value={s.status} /></div>
              <p className="text-xs text-ink-muted">{name('customers', s.customer_id)} · {String(s.destination)} · ETA {date(s.eta)}</p>
            </button></li>
          ))}
        </ul>
        {!active.length && <EmptyState title="No active shipments" />}
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink-muted">Delay alerts</h3>
          <div className="space-y-2">
            {!m.perf.late.length && <InfoBox variant="green">No delayed shipments.</InfoBox>}
            {m.perf.late.map((s) => (
              <div key={s.id} className="flex flex-col gap-3 rounded-xl border border-accent-red/30 bg-accent-red/5 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{String(s.number)} to {name('customers', s.customer_id)} — {name('transporters', s.transporter_id) || 'own fleet'}</p>
                  <p className="mt-1 text-sm text-ink-muted">{s.status === 'delayed' ? 'Reported delayed' : 'Past ETA'} · ETA {date(s.eta)} · {String(s.destination)}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" tone="secondary" onClick={() => navigate(routeFor('shipments', s.id))}>View</Button>
                  <Button size="sm" tone="danger" onClick={() => navigate(routeFor('shipments', s.id))}>Reassign carrier</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <Panel title="SLA performance — last 4 weeks" subtitle="On-time % of deliveries completed each week (target 95%)">
          <div className="p-4"><BarChart labels={m.weeks.map((w) => w.label)} unit="%" target={{ value: 95, label: 'Target' }} series={[{ name: 'On-time %', color: CHART.teal, values: m.weeks.map((w) => w.p ?? 0) }]} /></div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border sm:grid-cols-3">
        {[[Package, 'Total active', `${active.length} shipments`, 'text-accent-blue'], [Clock, 'Avg transit', m.transit === null ? '—' : `${m.transit.toFixed(1)} days`, 'text-accent-amber'], [Truck, 'Delivered (30d)', String(m.perf.delivered), 'text-accent-green']].map(([Icon, k, v, c]) => {
          const I = Icon as typeof Package;
          return (
            <div key={String(k)} className="flex items-center gap-3 bg-base-panel p-4"><I className={`h-5 w-5 ${c}`} /><div><p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">{String(k)}</p><p className="font-mono text-sm font-semibold">{String(v)}</p></div></div>
          );
        })}
      </div>
    </div>
  );
}

function Planning() {
  const ds = useDataset(defaultFilters(30));
  const { can } = useApp();
  const act = useActions();
  const { name } = useRefMaps(['customers', 'materials']);
  if (ds.loading) return <Spinner />;
  const fgStock = new Map<string, number>();
  for (const b of ds.balances) fgStock.set(String(b.material_id), (fgStock.get(String(b.material_id)) ?? 0) + Number(b.qty));
  const orders = ds.salesOrders.filter((s) => ['confirmed', 'in_production', 'ready_to_dispatch'].includes(String(s.status))).sort((a, b) => String(a.delivery_date).localeCompare(String(b.delivery_date)));
  const planned = ds.shipments.filter((s) => ['planned', 'loaded'].includes(String(s.status)));
  return (
    <div className="space-y-5">
      <Panel title="Orders to dispatch" subtitle="Open sales orders by delivery date, with finished-goods availability">
        {!orders.length ? <EmptyState title="No open orders" /> : (
          <ul className="divide-y divide-base-border">
            {orders.map((so) => {
              const shipped = ds.shipments.filter((x) => x.sales_order_id === so.id && x.status !== 'cancelled').reduce((s, x) => s + ((x.lines as LineItem[]) ?? []).reduce((a, l) => a + Number(l.qty), 0), 0);
              const ordered = ((so.lines as LineItem[]) ?? []).reduce((s, l) => s + Number(l.qty), 0);
              const days = daysBetween(ymd(), String(so.delivery_date));
              const available = ((so.lines as LineItem[]) ?? []).every((l) => (fgStock.get(l.material_id) ?? 0) >= Number(l.qty));
              return (
                <li key={so.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium"><button className="font-mono text-accent-blue hover:underline" onClick={() => navigate(routeFor('sales_orders', so.id))}>{String(so.number)}</button> · {name('customers', so.customer_id)}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{((so.lines as LineItem[]) ?? []).map((l) => `${name('materials', l.material_id)} × ${qty(l.qty, 0)}`).join(', ')} · shipped {qty(shipped, 0)} / {qty(ordered, 0)}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant={days < 0 ? 'red' : days <= 3 ? 'amber' : 'grey'}>{days < 0 ? `${-days} d late` : `due in ${days} d`}</Badge>
                    <Badge variant={available ? 'green' : 'amber'}>{available ? 'FG available' : 'FG short'}</Badge>
                    {can('logistics', 'create') && shipped < ordered && (
                      <Button size="sm" loading={act.busy} onClick={() => void act.rpc<BaseRow>('create_shipment_from_so', { p_sales_order_id: so.id }, 'Delivery order planned').then((o) => o?.status === 'saved' && navigate(routeFor('shipments', o.result.id))).catch(() => undefined)}>Plan delivery</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Planned & loading" subtitle="Assign transporter and vehicle, then load and dispatch">
        {!planned.length ? <EmptyState title="Nothing planned" /> : (
          <ul className="divide-y divide-base-border">
            {planned.map((s) => (
              <li key={s.id}><button onClick={() => navigate(routeFor('shipments', s.id))} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-base-hover">
                <span className="text-sm"><span className="font-mono">{String(s.number)}</span> · {name('customers', s.customer_id)} · {String(s.destination)}</span>
                <span className="flex items-center gap-2">{!s.vehicle_id && <Badge variant="amber">No vehicle</Badge>}<StatusBadge def={entity('shipments')} value={s.status} /></span>
              </button></li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Carriers() {
  const ds = useDataset(defaultFilters(90), { lookbackDays: 90 });
  if (ds.loading) return <Spinner />;
  const rows = ds.shipments.reduce((acc, s) => {
    const k = String(s.transporter_id ?? 'own');
    const e = acc.get(k) ?? { shipments: 0, delivered: 0, onTime: 0, delayDays: 0, freight: 0, units: 0 };
    e.shipments++;
    e.freight += Number(s.freight_cost ?? 0);
    e.units += ((s.lines as LineItem[]) ?? []).reduce((a, l) => a + Number(l.qty), 0);
    if (s.delivered_on) {
      e.delivered++;
      const late = daysBetween(String(s.eta), String(s.delivered_on));
      if (late <= 0) e.onTime++; else e.delayDays += late;
    }
    acc.set(k, e);
    return acc;
  }, new Map<string, { shipments: number; delivered: number; onTime: number; delayDays: number; freight: number; units: number }>());
  return <CarrierTable rows={[...rows.entries()]} />;
}

function CarrierTable({ rows }: { rows: [string, { shipments: number; delivered: number; onTime: number; delayDays: number; freight: number; units: number }][] }) {
  const { name } = useRefMaps(['transporters']);
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Panel title="Carrier performance (90 days)" className="lg:col-span-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['Carrier', 'Shipments', 'On-time %', 'Avg delay (late)', 'Freight', 'Cost / shipment', 'Cost / unit'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(([k, v]) => {
                const ot = v.delivered ? (v.onTime / v.delivered) * 100 : null;
                return (
                  <tr key={k} className="border-b border-base-border last:border-0">
                    <td className="td"><span className="flex items-center gap-2"><Truck className="h-4 w-4 text-ink-muted" />{k === 'own' ? 'Own fleet' : name('transporters', k)}</span></td>
                    <td className="td font-mono">{v.shipments}</td>
                    <td className={`td font-mono font-semibold ${ot === null ? '' : ot >= 95 ? 'text-accent-green' : ot >= 90 ? 'text-accent-amber' : 'text-accent-red'}`}>{pct(ot, 0)}</td>
                    <td className="td font-mono">{v.delivered - v.onTime ? `${(v.delayDays / (v.delivered - v.onTime)).toFixed(1)} d` : '—'}</td>
                    <td className="td font-mono">{money(v.freight, true)}</td>
                    <td className="td font-mono">{money(v.freight / v.shipments)}</td>
                    <td className="td font-mono">{v.units ? money(v.freight / v.units) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Freight by carrier">
        <div className="p-4"><BarChart horizontal labels={rows.map(([k]) => (k === 'own' ? 'Own fleet' : name('transporters', k)))} series={[{ name: 'Freight', color: CHART.navy, values: rows.map(([, v]) => v.freight) }]} /></div>
      </Panel>
    </div>
  );
}
