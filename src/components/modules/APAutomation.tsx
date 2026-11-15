import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, CheckCircle2, Circle, Mail, PackagePlus, Plus, XCircle } from 'lucide-react';
import { Badge, Button, EmptyState, InfoBox, Panel, Spinner, StatCard, StatGrid, StatusDot, useConfirm } from '@/components/ui';
import EntityManager, { StatusBadge } from '@/components/data/EntityManager';
import { DocumentCapture } from '@/components/data/DocumentCapture';
import { QuickCreate } from '@/components/data/QuickCreate';
import { BarChart, CHART } from '@/components/charts';
import { useApp } from '@/lib/app';
import { entity } from '@/lib/data/entities';
import { useActions, useQuery, useRefMaps } from '@/lib/data/hooks';
import type { AuditEntry, BaseRow, LineItem } from '@/lib/data/schema';
import { apPosition, defaultFilters, supplierScorecard } from '@/lib/analytics';
import { useDataset } from '@/lib/useDataset';
import { AGEING_BUCKETS } from '@/lib/domain';
import { parseInvoice } from '@/lib/extract';
import { date, dateTime, humanize, money, qty } from '@/lib/format';
import { navigate, setParam, useRoute } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import { ymd } from '@/lib/dates';
import { ModuleTabs, useModuleTab } from './shared';

const TABS = [
  { id: 'invoices', label: 'Invoice queue' },
  { id: 'upload', label: 'Scan & upload (OCR)' },
  { id: 'match', label: '3-way match' },
  { id: 'ageing', label: 'AP ageing' },
  { id: 'payments', label: 'Payments' },
  { id: 'vendors', label: 'Vendor master' },
  { id: 'audit', label: 'Audit trail' },
];

export default function APAutomation({ tab }: { tab: string | null }) {
  const current = useModuleTab(tab === 'queue' ? 'invoices' : tab, TABS);
  const ds = useDataset(defaultFilters(90), { lookbackDays: 90 });
  const ap = useMemo(() => apPosition(ds), [ds]);
  const month = ymd().slice(0, 7);
  return (
    <div className="space-y-5">
      <StatGrid cols={5}>
        <StatCard label="Invoices this month" value={String(ds.invoices.filter((i) => String(i.invoice_date).startsWith(month)).length)} sub={`${ds.invoices.length} total`} />
        <StatCard label="Matched" value={String(ds.invoices.filter((i) => i.match_status === 'matched').length)} variant="green" />
        <StatCard label="Exceptions" value={String(ap.exceptions.length)} variant={ap.exceptions.length ? 'amber' : 'green'} />
        <StatCard label="Pending approval" value={String(ap.pendingApproval.length)} />
        <StatCard label="Outstanding" value={money(ap.outstanding, true)} sub={`${money(ap.overdue, true)} overdue`} variant={ap.overdue ? 'amber' : undefined} />
      </StatGrid>
      <ModuleTabs module="ap" tabs={TABS} current={current} />
      {current === 'invoices' && <EntityManager table="invoices" detailExtra={(r) => <InvoiceWorkflow inv={r} />} rowActions={(r) => <Button tone="secondary" onClick={() => navigate(`/ap/match?inv=${r.id}`)}>3-way match</Button>} />}
      {current === 'upload' && (
        <div className="space-y-5">
          <DocumentCapture table="invoices" kind="invoice" title="Scan & upload supplier invoice"
            hint="Upload a PDF, photo or text export of the bill. Vendor is identified by GSTIN/name, the PO by its number, and the invoice is matched against the PO and posted GRNs automatically on save. Exact duplicate invoice numbers are blocked."
            parse={(text, maps) => parseInvoice(text, { suppliers: [...(maps.suppliers?.values() ?? [])], materials: [...(maps.materials?.values() ?? [])], pos: [...(maps.purchase_orders?.values() ?? [])] })} />
          <InfoBox>Prefer typing? <QuickCreate table="invoices" icon={Plus} label="Enter invoice manually" initial={{ invoice_date: ymd() }} /></InfoBox>
        </div>
      )}
      {current === 'match' && <ThreeWayMatch />}
      {current === 'ageing' && <Ageing ap={ap} loading={ds.loading} />}
      {current === 'payments' && <EntityManager table="payments" emptyHint="Record payments against approved invoices. Invoices move to paid / partially paid automatically." />}
      {current === 'vendors' && <VendorMaster />}
      {current === 'audit' && <ApAudit />}
    </div>
  );
}

type StepStatus = 'completed' | 'flagged' | 'pending';

function steps(inv: BaseRow): { label: string; status: StepStatus; note?: string }[] {
  const exc = (inv.exceptions as string[]) ?? [];
  const s = String(inv.status);
  const has = (re: RegExp) => exc.some((e) => re.test(e));
  const after = (list: string[]) => list.includes(s);
  return [
    { label: 'Supplier invoice received', status: 'completed' },
    { label: 'Data captured', status: 'completed', note: inv.extraction_confidence ? `${inv.extraction_confidence}% extraction` : 'Manual entry' },
    { label: 'Duplicate check', status: has(/duplicate/i) ? 'flagged' : 'completed' },
    { label: 'PO match', status: has(/No purchase order|not on the PO|differs from PO|Price variance|exceeds PO|PO is/) ? 'flagged' : 'completed' },
    { label: 'GRN match', status: has(/GRN/) ? 'flagged' : 'completed' },
    { label: 'Approval', status: after(['approved', 'partially_paid', 'paid']) ? 'completed' : s === 'rejected' ? 'flagged' : 'pending' },
    { label: 'Payment', status: s === 'paid' ? 'completed' : 'pending', note: Number(inv.paid_amount) ? `${money(inv.paid_amount)} paid` : undefined },
  ];
}

function WorkflowStep({ label, status, note }: { label: string; status: StepStatus; note?: string }) {
  const st = {
    completed: { border: 'border-accent-green/30', text: 'text-accent-green', bg: 'bg-accent-green/5', icon: CheckCircle2 },
    flagged: { border: 'border-accent-amber/30', text: 'text-accent-amber', bg: 'bg-accent-amber/5', icon: AlertTriangle },
    pending: { border: 'border-base-border', text: 'text-ink-muted', bg: 'bg-base-panel', icon: Circle },
  }[status];
  const Icon = st.icon;
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${st.border} ${st.bg}`}>
      <Icon className={`h-4 w-4 shrink-0 ${st.text}`} />
      <span className={`text-sm ${st.text}`}>{label}</span>
      {note && <span className="ml-auto text-xs text-ink-muted">{note}</span>}
    </div>
  );
}

function InvoiceWorkflow({ inv }: { inv: BaseRow }) {
  const exc = (inv.exceptions as string[]) ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">Workflow</p>
        <div className="flex flex-col">
          {steps(inv).map((s, i, a) => (
            <div key={s.label}>
              <WorkflowStep {...s} />
              {i < a.length - 1 && <div className="flex justify-center py-0.5"><ArrowDown className="h-3.5 w-3.5 text-ink-faint" /></div>}
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">Validation results</p>
        {exc.length === 0 ? <InfoBox variant="green">All checks passed: PO, GRN and price match within tolerance.</InfoBox> : (
          <ul className="space-y-2">{exc.map((e) => <li key={e} className="flex items-start gap-2 rounded-lg border border-accent-amber/25 px-3 py-2 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />{e}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

function ThreeWayMatch() {
  const route = useRoute();
  const { can } = useApp();
  const act = useActions();
  const confirm = useConfirm();
  const invoices = useQuery('invoices', { where: { status: ['received', 'matched', 'exception', 'on_hold', 'pending_approval'] }, orderBy: { key: 'invoice_date', dir: 'desc' }, limit: 300 });
  const { name, maps } = useRefMaps(['suppliers', 'materials', 'purchase_orders', 'warehouses']);
  const invId = route.params.get('inv') ?? invoices.rows.find((i) => i.status === 'exception')?.id ?? invoices.rows[0]?.id;
  const allInv = useQuery('invoices', { where: { id: invId ?? '' } }, { enabled: !!invId });
  const inv = invoices.rows.find((i) => i.id === invId) ?? allInv.rows[0];
  const po = inv?.po_id ? maps.purchase_orders?.get(String(inv.po_id)) : undefined;
  const grns = useQuery('grns', { where: { po_id: po?.id ?? '', status: 'posted' } }, { enabled: !!po });
  const def = entity('invoices');

  if (invoices.loading && !invoices.rows.length) return <Spinner />;
  if (!inv) return <EmptyState title="No invoices awaiting matching" />;

  const exc = (inv.exceptions as string[]) ?? [];
  const invLines = (inv.lines as LineItem[]) ?? [];
  const poLines = (po?.lines as LineItem[]) ?? [];
  const received: Record<string, number> = {};
  for (const g of grns.rows) for (const l of (g.lines as LineItem[]) ?? []) received[l.material_id] = (received[l.material_id] ?? 0) + Number(l.qty) - Number(l.rejected_qty ?? 0);
  const supplier = maps.suppliers?.get(String(inv.supplier_id));
  const transition = async (to: string, label: string, requireComment: boolean, tone: 'primary' | 'danger' = 'primary') => {
    const r = await confirm({ title: `${label}?`, confirmLabel: label, requireComment, tone, commentLabel: 'Reason (recorded in audit trail)' });
    if (r.ok) await act.transition('invoices', inv.id, to, r.comment, `${inv.invoice_no}: ${label}`).catch(() => undefined);
  };
  const mailto = supplier?.email ? `mailto:${supplier.email}?subject=${encodeURIComponent(`Query on invoice ${inv.invoice_no}`)}&body=${encodeURIComponent(`Dear ${supplier.name},\n\nWe are unable to process invoice ${inv.invoice_no} dated ${inv.invoice_date} because:\n- ${exc.join('\n- ')}\n\nPlease review and send a corrected invoice or clarification.\n\nRegards`)}` : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[260px] flex-1 sm:max-w-md"><span className="label">Invoice</span>
          <select className="input" value={inv.id} onChange={(e) => setParam('inv', e.target.value)}>
            {invoices.rows.map((i) => <option key={i.id} value={i.id}>{String(i.invoice_no)} — {name('suppliers', i.supplier_id)} ({humanize(i.status)})</option>)}
          </select>
        </label>
        <p className="font-mono text-xs text-ink-muted">Reference: {po ? String(po.number) : 'no PO'} · Invoice {String(inv.invoice_no)}</p>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border shadow-card lg:grid-cols-3">
        <MatchColumn title={po ? `Purchase order ${po.number}` : 'Purchase order'} rows={po ? [
          ['Supplier', name('suppliers', po.supplier_id)], ['PO date', date(po.po_date)], ['Status', humanize(po.status)],
          ...poLines.map((l) => [name('materials', l.material_id), `${qty(l.qty)} × ${money(l.rate)}`] as [string, string]), ['Total', money(po.total)],
        ] : [['PO', 'No purchase order referenced']]} warn={!po} />
        <MatchColumn title="Goods receipt notes" rows={grns.rows.length ? [
          ...grns.rows.map((g) => [String(g.number), `${date(g.received_date)} · ${name('warehouses', g.warehouse_id)}`] as [string, string]),
          ...Object.entries(received).map(([m, q]) => [`Accepted: ${name('materials', m)}`, qty(q)] as [string, string]),
        ] : [['GRN status', 'NOT RECEIVED YET'], ['Note', 'GRN required before approval']]} warn={!grns.rows.length} />
        <div className="bg-base-panel">
          <div className="border-b border-base-border px-4 py-3"><h3 className="text-sm font-semibold">Supplier bill {String(inv.invoice_no)}</h3></div>
          <div className="divide-y divide-base-border">
            {[['Supplier', name('suppliers', inv.supplier_id)], ['Invoice date', date(inv.invoice_date)], ['Due', date(inv.due_date)]].map(([k, v]) => (
              <div key={k} className="px-4 py-2.5"><p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">{k}</p><p className="mt-0.5 font-mono text-sm">{v}</p></div>
            ))}
            {invLines.map((l, i) => {
              const pl = poLines.find((p) => p.material_id === l.material_id);
              const priceOk = pl && Math.abs((l.rate - pl.rate) / pl.rate) * 100 <= 2;
              const qtyOk = (received[l.material_id] ?? 0) >= l.qty;
              return (
                <div key={i} className="px-4 py-2.5">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">{name('materials', l.material_id)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-sm">
                    <span className={qtyOk ? '' : 'text-accent-red'}>{qty(l.qty)} {qtyOk ? <CheckCircle2 className="inline h-3.5 w-3.5 text-accent-green" /> : <XCircle className="inline h-3.5 w-3.5" />}</span>
                    <span className={priceOk ? '' : 'text-accent-red'}>× {money(l.rate)} {priceOk ? <CheckCircle2 className="inline h-3.5 w-3.5 text-accent-green" /> : <XCircle className="inline h-3.5 w-3.5" />}</span>
                  </p>
                </div>
              );
            })}
            <div className="px-4 py-2.5"><p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">Total incl. GST</p><p className="mt-0.5 font-mono text-sm">{money(inv.total)}</p></div>
          </div>
        </div>
      </div>

      <div className={`rounded-xl border px-4 py-3 ${exc.length ? 'border-accent-red/30 bg-accent-red/5' : 'border-accent-green/30 bg-accent-green/5'}`}>
        <div className="flex items-start gap-3">
          {exc.length ? <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent-red" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-green" />}
          <div>
            <p className={`font-mono text-sm font-semibold ${exc.length ? 'text-accent-red' : 'text-accent-green'}`}>{exc.length ? `EXCEPTION — ${exc.length} issue${exc.length > 1 ? 's' : ''}` : 'MATCHED — PO, GRN and invoice agree'}</p>
            {exc.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-ink-primary">{exc.map((e) => <li key={e}>{e}</li>)}</ul>}
            <p className="mt-1 text-xs text-ink-muted">Status: <StatusBadge def={def} value={inv.status} /></p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {inv.status === 'matched' && can('ap', 'edit') && <Button onClick={() => void transition('pending_approval', 'Send for approval', false)}>Send for approval</Button>}
        {inv.status === 'exception' && can('ap', 'edit') && <Button onClick={() => void transition('pending_approval', 'Override & send for approval', true)}>Approve anyway (override)</Button>}
        {inv.status === 'pending_approval' && can('ap', 'approve') && <Button onClick={() => void transition('approved', 'Approve for payment', false)}>Approve for payment</Button>}
        {mailto && <a href={mailto} className="inline-flex h-10 items-center gap-2 rounded-lg border border-base-border bg-white px-4 text-sm font-medium hover:border-accent-blue hover:text-accent-blue"><Mail className="h-4 w-4" />Query supplier</a>}
        {['received', 'matched', 'exception', 'pending_approval'].includes(String(inv.status)) && can('ap', 'edit') && <Button tone="secondary" onClick={() => void transition('on_hold', 'Hold', true)}>Hold for GRN</Button>}
        {inv.status === 'on_hold' && can('ap', 'edit') && <Button tone="secondary" onClick={() => void transition('exception', 'Release hold', false)}>Release hold</Button>}
        {po && !grns.rows.length && ['approved', 'sent', 'partially_received'].includes(String(po.status)) && (
          <QuickCreate table="grns" icon={PackagePlus} label="Record GRN" stay initial={() => ({ po_id: po.id, supplier_id: po.supplier_id, warehouse_id: po.delivery_warehouse_id, received_date: ymd(), lines: poLines.map((l) => ({ material_id: l.material_id, qty: l.qty - Number(l.received_qty ?? 0), rejected_qty: 0, rate: l.rate })) })} />
        )}
        {['received', 'matched', 'exception', 'pending_approval', 'on_hold'].includes(String(inv.status)) && can('ap', 'approve') && <Button tone="danger" onClick={() => void transition('rejected', 'Reject invoice', true, 'danger')}>Reject bill</Button>}
      </div>
    </div>
  );
}

function MatchColumn({ title, rows, warn }: { title: string; rows: [string, string][]; warn?: boolean }) {
  return (
    <div className="bg-base-panel">
      <div className="border-b border-base-border px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3></div>
      <div className="divide-y divide-base-border">
        {rows.map(([k, v], i) => (
          <div key={k + i} className="px-4 py-2.5">
            <p className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">{k}</p>
            <p className={`mt-0.5 font-mono text-sm ${warn ? 'text-accent-amber' : ''}`}>{warn && i === 0 && <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />}{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Ageing({ ap, loading }: { ap: ReturnType<typeof apPosition>; loading: boolean }) {
  const { name } = useRefMaps(['suppliers']);
  if (loading) return <Spinner />;
  const today = ymd();
  const bySupplier = new Map<string, number>();
  for (const i of ap.open) bySupplier.set(String(i.supplier_id), (bySupplier.get(String(i.supplier_id)) ?? 0) + Number(i.total) - Number(i.paid_amount ?? 0));
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Panel title="Ageing buckets" subtitle="Outstanding amount by days past due">
        <div className="p-4"><BarChart labels={[...AGEING_BUCKETS]} series={[{ name: 'Outstanding', color: CHART.navy, values: AGEING_BUCKETS.map((b) => ap.buckets[b]) }]} /></div>
        <div className="grid grid-cols-5 border-t border-base-border text-center">
          {AGEING_BUCKETS.map((b) => <div key={b} className="px-1 py-2"><p className="text-[10px] text-ink-muted">{b}</p><p className="font-mono text-xs">{money(ap.buckets[b], true)}</p></div>)}
        </div>
      </Panel>
      <Panel title="Overdue invoices" className="xl:col-span-2" subtitle={`${ap.overdueList.length} invoices · ${money(ap.overdue)}`}>
        {!ap.overdueList.length ? <EmptyState title="Nothing overdue" /> : (
          <ul className="divide-y divide-base-border">
            {ap.overdueList.map((i) => {
              const days = Math.round((Date.parse(today) - Date.parse(String(i.due_date))) / 86_400_000);
              return (
                <li key={i.id}><button onClick={() => navigate(routeFor('invoices', i.id))} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-base-hover">
                  <span className="font-mono text-sm">{String(i.invoice_no)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{name('suppliers', i.supplier_id)}</span>
                  <span className="font-mono text-sm">{money(Number(i.total) - Number(i.paid_amount ?? 0))}</span>
                  <Badge variant={days > 60 ? 'red' : 'amber'}>{days} days overdue</Badge>
                  <StatusBadge def={entity('invoices')} value={i.status} />
                </button></li>
              );
            })}
          </ul>
        )}
      </Panel>
      <Panel title="Outstanding by supplier" className="xl:col-span-3">
        <div className="p-4"><BarChart horizontal labels={[...bySupplier.keys()].map((id) => name('suppliers', id))} series={[{ name: 'Outstanding', color: CHART.blue, values: [...bySupplier.values()] }]} /></div>
      </Panel>
    </div>
  );
}

function VendorMaster() {
  const ds = useDataset(defaultFilters(365), { lookbackDays: 365 });
  const [search, setSearch] = useState('');
  const rows = useMemo(() => supplierScorecard(ds), [ds]);
  if (ds.loading) return <Spinner />;
  const filtered = rows.filter((r) => [r.supplier.name, r.supplier.category, r.supplier.gstin].some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase())));
  return (
    <Panel title="Vendor master" actions={<QuickCreate table="suppliers" icon={Plus} label="Add supplier" tone="primary" initial={{}} />}>
      <div className="border-b border-base-border p-3"><input type="search" className="input max-w-md" placeholder="Search suppliers by name, category, GSTIN…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-base-border bg-base-subtle"><tr>{['Supplier', 'Category', 'GSTIN', 'Risk score', 'Total bills', 'Exceptions', 'Last bill', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map((r) => {
              const invs = ds.invoices.filter((i) => i.supplier_id === r.supplier.id);
              const excs = invs.filter((i) => ((i.exceptions as string[]) ?? []).length > 0 && i.status !== 'rejected').length;
              const last = invs.map((i) => String(i.invoice_date)).sort().pop();
              const risk = excs / Math.max(1, invs.length) > 0.4 || (r.rejectionPct ?? 0) > 5 ? 'red' : excs > 0 || (r.onTimePct ?? 100) < 90 ? 'amber' : 'green';
              return (
                <tr key={r.supplier.id} onClick={() => navigate(routeFor('suppliers', r.supplier.id))} className="cursor-pointer border-b border-base-border last:border-0 hover:bg-base-hover">
                  <td className="td font-medium">{String(r.supplier.name)}</td>
                  <td className="td text-ink-muted">{String(r.supplier.category ?? '—')}</td>
                  <td className="td font-mono text-xs text-ink-muted">{String(r.supplier.gstin ?? '—')}</td>
                  <td className="td"><span className="flex items-center gap-2"><StatusDot variant={risk} /><span className={risk === 'red' ? 'text-accent-red' : risk === 'amber' ? 'text-accent-amber' : 'text-accent-green'}>{risk === 'red' ? 'HIGH' : risk === 'amber' ? 'MEDIUM' : 'LOW'}</span></span></td>
                  <td className="td font-mono">{invs.length}</td>
                  <td className={`td font-mono ${excs > 2 ? 'text-accent-red' : excs ? 'text-accent-amber' : ''}`}>{excs}</td>
                  <td className="td font-mono text-ink-muted">{last ? date(last) : '—'}</td>
                  <td className="td">{r.supplier.status === 'preferred' ? <span className="text-accent-green">★ Preferred</span> : humanize(r.supplier.status)}</td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={8} className="td py-8 text-center text-ink-muted">No suppliers found</td></tr>}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ApAudit() {
  const inv = useQuery<AuditEntry>('audit_log', { where: { table_name: ['invoices', 'payments'] }, orderBy: { key: 'created_at', dir: 'desc' }, limit: 100 });
  const { maps } = useRefMaps(['invoices', 'payments']);
  if (inv.loading && !inv.rows.length) return <Spinner />;
  return (
    <Panel title="AP audit trail" subtitle="Every create, change, status transition and payment, with who and when">
      {!inv.rows.length ? <EmptyState title="No AP activity recorded yet" /> : (
        <ul className="divide-y divide-base-border">
          {inv.rows.map((a) => {
            const rec = maps[a.table_name]?.get(a.record_id);
            return (
              <li key={a.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="w-36 shrink-0 font-mono text-xs text-ink-muted">{dateTime(a.created_at)}</span>
                <span className="min-w-0 flex-1 text-sm">
                  <b>{a.actor_name ?? 'System'}</b>{' '}
                  {a.action === 'transition' && a.changes?.status ? `moved ${humanize(a.changes.status.from)} → ${humanize(a.changes.status.to)}` : a.action === 'insert' ? 'created' : a.action}{' '}
                  <button className="font-mono text-accent-blue hover:underline" onClick={() => navigate(routeFor(a.table_name as 'invoices', a.record_id))}>{String(rec?.invoice_no ?? rec?.number ?? a.record_id.slice(0, 8))}</button>
                  {a.note && <span className="text-ink-muted"> — “{a.note}”</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
