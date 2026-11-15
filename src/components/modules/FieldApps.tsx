import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Boxes, Camera, CheckCircle2, ChevronRight, ClipboardCheck, CloudOff, Factory, Minus, Plus, ScanLine, Search, ShieldCheck, Wrench } from 'lucide-react';
import { useApp } from '@/lib/app';
import { useActions, useLookup, useQuery, displayName } from '@/lib/data/hooks';
import type { BaseRow, LineItem } from '@/lib/data/schema';
import { DEFAULT_COMPANY_SETTINGS } from '@/lib/data/schema';
import { computeOee } from '@/lib/domain';
import { ymd } from '@/lib/dates';
import { humanize, money, pct, qty } from '@/lib/format';
import { navigate } from '@/lib/router';
import { routeFor } from '@/lib/routes';
import type { MutationOutcome } from '@/lib/data/sync';
import { uuid } from '@/lib/data/backend';
import { Badge, Button, EmptyState, InfoBox, Spinner, useConfirm } from '@/components/ui';
import { ScannerDialog } from '@/components/data/Scanner';
import { FilePickers, PendingFiles } from '@/components/data/Attachments';
import { resolveScan } from '@/components/data/FieldInput';
import { useToast } from '@/components/Toast';

const APPS = [
  { id: 'store', title: 'Store keeper', desc: 'Stock IN / OUT with scan and document', icon: Boxes, module: 'inventory' as const, action: 'create' as const },
  { id: 'shift', title: 'Shift report', desc: 'Line, machine, output, rejects, downtime', icon: Factory, module: 'production' as const, action: 'create' as const },
  { id: 'technician', title: 'Technician', desc: 'Assigned work orders, parts, photos, completion', icon: Wrench, module: 'maintenance' as const, action: 'edit' as const },
  { id: 'inspector', title: 'Quality inspector', desc: 'Inspection requests, results, defects, decision', icon: ShieldCheck, module: 'quality' as const, action: 'edit' as const },
];

export default function FieldApps({ tab }: { tab: string | null }) {
  const { can } = useApp();
  const apps = APPS.filter((a) => can(a.module, a.action));
  const app = apps.find((a) => a.id === tab);
  if (!app) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <p className="text-sm text-ink-muted">Shop-floor workflows designed for phones. They work offline — entries are stored on the device and synced when the connection returns.</p>
        {apps.map((a) => (
          <button key={a.id} onClick={() => navigate(`/field/${a.id}`)} className="flex w-full items-center gap-4 rounded-2xl border border-base-border bg-base-panel p-4 text-left shadow-card active:scale-[0.99]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-blue/10"><a.icon className="h-6 w-6 text-accent-blue" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">{a.title}</span><span className="block text-sm text-ink-muted">{a.desc}</span></span>
            <ChevronRight className="h-5 w-5 text-ink-faint" />
          </button>
        ))}
        {!apps.length && <EmptyState title="No field workflows for your role" />}
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl">
      <button onClick={() => navigate('/field')} className="mb-3 inline-flex items-center gap-1 text-sm text-ink-muted"><ArrowLeft className="h-4 w-4" />All field apps</button>
      {app.id === 'store' && <StoreKeeper />}
      {app.id === 'shift' && <ShiftReport />}
      {app.id === 'technician' && <Technician />}
      {app.id === 'inspector' && <Inspector />}
    </div>
  );
}

// ─── shared bits ───
function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-4">
      <div className="flex gap-1">{steps.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= current ? 'bg-accent-blue' : 'bg-slate-200'}`} />)}</div>
      <p className="mt-2 text-xs text-ink-muted">Step {current + 1} of {steps.length} · <span className="font-medium text-ink-primary">{steps[current]}</span></p>
    </div>
  );
}

function Choice({ selected, onClick, title, sub, right }: { selected?: boolean; onClick: () => void; title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <button onClick={onClick} className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${selected ? 'border-accent-blue bg-accent-blue/5 ring-2 ring-accent-blue/20' : 'border-base-border bg-white active:bg-base-hover'}`}>
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{title}</span>{sub && <span className="block truncate text-xs text-ink-muted">{sub}</span>}</span>
      {right}
    </button>
  );
}

function NumberPad({ label, value, onChange, unit, step = 1, min = 0, hint }: { label: string; value: number | ''; onChange: (v: number | '') => void; unit?: string; step?: number; min?: number; hint?: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-stretch gap-2">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(min, Number(value || 0) - step))} className="flex w-14 items-center justify-center rounded-xl border border-base-border bg-white active:bg-base-hover"><Minus className="h-5 w-5" /></button>
        <div className="relative flex-1">
          <input type="number" inputMode="decimal" step="any" min={min} className="input h-14 text-center font-mono text-2xl font-semibold" value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} aria-label={label} />
          {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">{unit}</span>}
        </div>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(Number(value || 0) + step)} className="flex w-14 items-center justify-center rounded-xl border border-base-border bg-white active:bg-base-hover"><Plus className="h-5 w-5" /></button>
      </div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

function NavBar({ onBack, onNext, nextLabel = 'Next', disabled, loading }: { onBack?: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean; loading?: boolean }) {
  return (
    <div className="pb-safe sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-3 mt-5 flex gap-2 border-t border-base-border bg-base-bg/95 px-3 py-3 backdrop-blur lg:bottom-0">
      {onBack && <Button tone="secondary" size="lg" onClick={onBack} className="flex-1">Back</Button>}
      <Button size="lg" onClick={onNext} disabled={disabled} loading={loading} className="flex-[2]">{nextLabel}</Button>
    </div>
  );
}

function Done({ outcome, title, detail, onNew, link }: { outcome: MutationOutcome<unknown>; title: string; detail?: ReactNode; onNew: () => void; link?: string }) {
  const queued = outcome.status === 'queued';
  return (
    <div className="rounded-2xl border border-base-border bg-base-panel p-6 text-center shadow-card">
      {queued ? <CloudOff className="mx-auto h-14 w-14 text-accent-amber" /> : <CheckCircle2 className="mx-auto h-14 w-14 text-accent-green" />}
      <h2 className="mt-3 text-xl font-bold">{queued ? 'Stored on this device' : title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{queued ? 'You are offline. This entry has NOT reached the server yet — it will sync automatically when you reconnect. Check the sync indicator at the top.' : 'Confirmed by the server.'}</p>
      {detail && <div className="mt-4 text-left">{detail}</div>}
      <div className="mt-6 flex flex-col gap-2">
        <Button size="lg" onClick={onNew}>New entry</Button>
        {link && !queued && <Button size="lg" tone="secondary" onClick={() => navigate(link)}>View record</Button>}
      </div>
    </div>
  );
}

function Photos({ files, setFiles }: { files: File[]; setFiles: (f: File[]) => void }) {
  return (
    <div>
      <span className="label flex items-center gap-1"><Camera className="h-3.5 w-3.5" />Photos / supporting document</span>
      <FilePickers onFiles={(f) => setFiles([...files, ...f])} />
      <PendingFiles files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
    </div>
  );
}

// ─── Store keeper ───
const REASONS_IN = ['purchase_receipt', 'production_output', 'customer_return', 'opening_balance', 'other'];
const REASONS_OUT = ['production_issue', 'maintenance_issue', 'sales_dispatch', 'supplier_return', 'damage', 'other'];

function StoreKeeper() {
  const act = useActions();
  const { showToast } = useToast();
  const warehouses = useLookup('warehouses');
  const materials = useLookup('materials');
  const balances = useQuery('stock_balances', { limit: 5000 });
  const [step, setStep] = useState(0);
  const [wh, setWh] = useState(() => localStorage.getItem('gnanova.field.wh') ?? '');
  const [mat, setMat] = useState('');
  const [dir, setDir] = useState<'in' | 'out'>('out');
  const [q, setQ] = useState<number | ''>('');
  const [reason, setReason] = useState('production_issue');
  const [batch, setBatch] = useState('');
  const [ref, setRef] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [search, setSearch] = useState('');
  const [scan, setScan] = useState(false);
  const [outcome, setOutcome] = useState<MutationOutcome<BaseRow> | null>(null);
  const [id, setId] = useState(uuid);

  const m = materials.map.get(mat);
  const onHand = balances.rows.filter((b) => b.material_id === mat && b.warehouse_id === wh).reduce((s, b) => s + Number(b.qty), 0);
  const batches = balances.rows.filter((b) => b.material_id === mat && b.warehouse_id === wh && Number(b.qty) > 0 && b.batch_no);
  const list = materials.rows.filter((x) => !search || [x.name, x.code, x.barcode].some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase()))).slice(0, 40);
  const reset = () => { setStep(1); setMat(''); setQ(''); setBatch(''); setRef(''); setFiles([]); setOutcome(null); setId(uuid()); };

  if (outcome) return <Done outcome={outcome} title={`Stock ${dir.toUpperCase()} posted`} onNew={reset} link={outcome.status === 'saved' ? routeFor('stock_movements', outcome.result.id) : undefined}
    detail={<InfoBox>{dir === 'in' ? 'Received' : 'Issued'} <b>{qty(q)} {String(m?.uom)}</b> of {String(m?.name)} {dir === 'in' ? 'into' : 'from'} {String(warehouses.map.get(wh)?.name)}{outcome.status === 'saved' ? <> · <span className="font-mono">{String(outcome.result.number)}</span></> : null}</InfoBox>} />;

  const steps = ['Warehouse', 'Material', 'Quantity & reason', 'Review'];
  const submit = async () => {
    const out = await act.insert('stock_movements', {
      id, movement_type: dir, material_id: mat, warehouse_id: wh, qty: Number(q), reason, batch_no: batch || null, reference: ref || null, movement_date: ymd(),
    }, `Stock ${dir.toUpperCase()}`, true).catch(() => null);
    if (!out) return;
    for (const f of files) await act.upload(f, 'stock_movements', id, f.name).catch(() => undefined);
    setOutcome(out);
  };

  return (
    <div>
      <h2 className="mb-3 text-xl font-bold">Store keeper</h2>
      <Steps steps={steps} current={step} />
      {step === 0 && (
        <div className="space-y-2">
          {warehouses.loading ? <Spinner /> : warehouses.rows.map((w) => <Choice key={w.id} selected={wh === w.id} onClick={() => { setWh(w.id); localStorage.setItem('gnanova.field.wh', w.id); setStep(1); }} title={String(w.name)} sub={`${w.code} · ${humanize(w.kind)}`} />)}
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input type="search" className="input h-12 pl-9" placeholder="Search name, code or barcode" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Button size="lg" icon={ScanLine} onClick={() => setScan(true)} aria-label="Scan barcode">Scan</Button>
          </div>
          <div className="space-y-2">
            {list.map((x) => {
              const oh = balances.rows.filter((b) => b.material_id === x.id && b.warehouse_id === wh).reduce((s, b) => s + Number(b.qty), 0);
              return <Choice key={x.id} selected={mat === x.id} onClick={() => { setMat(x.id); setStep(2); }} title={String(x.name)} sub={`${x.code}${x.barcode ? ` · ${x.barcode}` : ''}`} right={<span className="shrink-0 font-mono text-sm">{qty(oh)} {String(x.uom)}</span>} />;
            })}
          </div>
          <NavBar onBack={() => setStep(0)} onNext={() => setStep(2)} disabled={!mat} />
          <ScannerDialog open={scan} onClose={() => setScan(false)} onResult={(code) => {
            setScan(false);
            const hit = resolveScan(code, materials.rows);
            if (hit) { setMat(hit.id); setStep(2); } else showToast(`No material with code ${code}`, 'error');
          }} />
        </div>
      )}
      {step === 2 && m && (
        <div className="space-y-4">
          <div className="rounded-xl border border-base-border bg-white p-3"><p className="font-semibold">{String(m.name)}</p><p className="text-sm text-ink-muted">On hand in {String(warehouses.map.get(wh)?.code)}: <b className="font-mono text-ink-primary">{qty(onHand)} {String(m.uom)}</b></p></div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setDir('in'); setReason('purchase_receipt'); }} className={`flex h-16 items-center justify-center gap-2 rounded-xl border-2 text-lg font-semibold ${dir === 'in' ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-base-border bg-white'}`}><ArrowDownToLine className="h-5 w-5" />Stock IN</button>
            <button onClick={() => { setDir('out'); setReason('production_issue'); }} className={`flex h-16 items-center justify-center gap-2 rounded-xl border-2 text-lg font-semibold ${dir === 'out' ? 'border-accent-amber bg-accent-amber/10 text-accent-amber' : 'border-base-border bg-white'}`}><ArrowUpFromLine className="h-5 w-5" />Stock OUT</button>
          </div>
          <NumberPad label="Quantity" value={q} onChange={setQ} unit={String(m.uom)} hint={dir === 'out' && Number(q) > onHand ? <span className="text-accent-red">Exceeds stock on hand — the server will reject this.</span> : undefined} />
          <div>
            <span className="label">Reason</span>
            <div className="flex flex-wrap gap-2">{(dir === 'in' ? REASONS_IN : REASONS_OUT).map((r) => <button key={r} onClick={() => setReason(r)} className={`rounded-full border px-3 py-2 text-sm ${reason === r ? 'border-accent-blue bg-accent-blue text-white' : 'border-base-border bg-white'}`}>{humanize(r)}</button>)}</div>
          </div>
          <div>
            <label className="label" htmlFor="batch">Batch / lot {dir === 'out' && '(optional — FIFO if blank)'}</label>
            {dir === 'out' && batches.length > 0 ? (
              <select id="batch" className="input h-12" value={batch} onChange={(e) => setBatch(e.target.value)}><option value="">Any (FIFO)</option>{batches.map((b) => <option key={b.id} value={String(b.batch_no)}>{String(b.batch_no)} — {qty(b.qty)}</option>)}</select>
            ) : <input id="batch" className="input h-12" value={batch} onChange={(e) => setBatch(e.target.value)} />}
          </div>
          <div><label className="label" htmlFor="ref">Reference (PO / production order / challan)</label><input id="ref" className="input h-12" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
          <Photos files={files} setFiles={setFiles} />
          <NavBar onBack={() => setStep(1)} onNext={() => setStep(3)} disabled={!q || Number(q) <= 0} nextLabel="Review" />
        </div>
      )}
      {step === 3 && m && (
        <div className="space-y-3">
          <dl className="divide-y divide-base-border rounded-xl border border-base-border bg-white">
            {[['Type', `Stock ${dir.toUpperCase()}`], ['Warehouse', String(warehouses.map.get(wh)?.name)], ['Material', String(m.name)], ['Quantity', `${qty(q)} ${m.uom}`], ['Reason', humanize(reason)], ['Batch', batch || (dir === 'out' ? 'FIFO' : '—')], ['Reference', ref || '—'], ['Attachments', String(files.length)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-3 text-sm"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
          <NavBar onBack={() => setStep(2)} onNext={() => void submit()} nextLabel="Submit" loading={act.busy} />
        </div>
      )}
    </div>
  );
}

// ─── Production supervisor ───
function ShiftReport() {
  const { company } = useApp();
  const settings = { ...DEFAULT_COMPANY_SETTINGS, ...(company?.settings ?? {}) };
  const act = useActions();
  const lines = useLookup('production_lines');
  const machines = useLookup('machines');
  const shifts = useLookup('shifts');
  const employees = useLookup('employees');
  const orders = useQuery('production_orders', { where: { status: ['released', 'in_progress'] } });
  const [step, setStep] = useState(0);
  const [v, setV] = useState<{ line: string; machine: string; shift: string; date: string; target: number | ''; actual: number | ''; rejected: number | ''; downtime: number | ''; reason: string; operator: string; order: string; comments: string }>(
    { line: '', machine: '', shift: '', date: ymd(), target: '', actual: '', rejected: 0, downtime: 0, reason: 'none', operator: '', order: '', comments: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [outcome, setOutcome] = useState<MutationOutcome<BaseRow> | null>(null);
  const [id, setId] = useState(uuid);
  const set = (p: Partial<typeof v>) => setV((s) => ({ ...s, ...p }));
  const shift = shifts.map.get(v.shift);
  const machine = machines.map.get(v.machine);
  const planned = Number(shift?.planned_minutes ?? 480);

  useEffect(() => {
    if (v.line && !v.target) {
      const cap = Number(lines.map.get(v.line)?.capacity_per_shift ?? 0);
      if (cap) set({ target: cap });
    }
    if (v.line && !v.order) {
      const o = orders.rows.find((x) => x.line_id === v.line && (!v.machine || !x.machine_id || x.machine_id === v.machine));
      if (o) set({ order: o.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.line, v.machine]);

  const oee = useMemo(() => (v.actual === '' ? null : computeOee([{ planned_minutes: planned, downtime_minutes: Number(v.downtime || 0), actual_qty: Number(v.actual), rejected_qty: Number(v.rejected || 0), ideal_cycle_time_sec: Number(machine?.ideal_cycle_time_sec ?? 0) }])), [v, planned, machine]);
  const errors: string[] = [];
  if (Number(v.rejected) > Number(v.actual)) errors.push('Rejected cannot exceed actual output');
  if (Number(v.downtime) > planned) errors.push(`Downtime cannot exceed ${planned} planned minutes`);
  if (Number(v.downtime) > 0 && v.reason === 'none') errors.push('Select a downtime reason');

  const reset = () => { setStep(1); set({ machine: '', actual: '', rejected: 0, downtime: 0, reason: 'none', comments: '', order: '' }); setFiles([]); setOutcome(null); setId(uuid()); };
  const pctTarget = v.target ? (Number(v.actual) / Number(v.target)) * 100 : null;
  const rejPct = Number(v.actual) ? (Number(v.rejected) / Number(v.actual)) * 100 : 0;

  if (outcome) return <Done outcome={outcome} title="Shift report submitted" onNew={reset} link={outcome.status === 'saved' ? routeFor('shift_reports', outcome.result.id) : undefined}
    detail={<div className="space-y-2">
      <InfoBox>{String(machine?.name)} · {String(shift?.name)}: {qty(v.actual, 0)} / {qty(v.target, 0)} ({pct(pctTarget, 0)}), OEE {pct(oee ? oee.oee * 100 : null)}</InfoBox>
      {pctTarget !== null && pctTarget < settings.below_target_alert_pct && <InfoBox variant="amber">{outcome.status === 'saved' ? 'A below-target alert was sent to production managers.' : 'A below-target alert will be raised when this syncs.'}</InfoBox>}
      {rejPct > settings.rejection_alert_pct && <InfoBox variant="red">{outcome.status === 'saved' ? 'A high-rejection alert was raised.' : 'A high-rejection alert will be raised when this syncs.'}</InfoBox>}
    </div>} />;

  const steps = ['Line', 'Machine & shift', 'Output', 'Downtime & notes', 'Review'];
  const submit = async () => {
    const out = await act.insert('shift_reports', {
      id, report_date: v.date, shift_id: v.shift, line_id: v.line, machine_id: v.machine, production_order_id: v.order || null, operator_id: v.operator || null,
      target_qty: Number(v.target), actual_qty: Number(v.actual), rejected_qty: Number(v.rejected || 0), planned_minutes: planned, downtime_minutes: Number(v.downtime || 0),
      downtime_reason: v.reason, comments: v.comments || null,
    }, 'Shift report', true).catch(() => null);
    if (!out) return;
    for (const f of files) await act.upload(f, 'shift_reports', id, f.name).catch(() => undefined);
    setOutcome(out);
  };

  return (
    <div>
      <h2 className="mb-3 text-xl font-bold">Shift production report</h2>
      <Steps steps={steps} current={step} />
      {step === 0 && <div className="space-y-2">{lines.rows.map((l) => <Choice key={l.id} selected={v.line === l.id} onClick={() => { set({ line: l.id, machine: '', target: '', order: '' }); setStep(1); }} title={String(l.name)} sub={`Capacity ${qty(l.capacity_per_shift, 0)} / shift`} />)}</div>}
      {step === 1 && (
        <div className="space-y-4">
          <div><span className="label">Machine</span><div className="space-y-2">{machines.rows.filter((m) => m.line_id === v.line).map((m) => <Choice key={m.id} selected={v.machine === m.id} onClick={() => set({ machine: m.id })} title={String(m.name)} sub={String(m.code)} right={<Badge variant={m.status === 'running' ? 'green' : m.status === 'breakdown' ? 'red' : 'amber'}>{String(m.status)}</Badge>} />)}</div></div>
          <div><span className="label">Shift</span><div className="grid grid-cols-3 gap-2">{shifts.rows.map((s) => <button key={s.id} onClick={() => set({ shift: s.id })} className={`rounded-xl border-2 px-2 py-3 text-sm font-semibold ${v.shift === s.id ? 'border-accent-blue bg-accent-blue/5 text-accent-blue' : 'border-base-border bg-white'}`}>{String(s.name)}<span className="block text-[11px] font-normal text-ink-muted">{String(s.start_time)}–{String(s.end_time)}</span></button>)}</div></div>
          <div><label className="label" htmlFor="sd">Date</label><input id="sd" type="date" className="input h-12" max={ymd()} value={v.date} onChange={(e) => set({ date: e.target.value })} /></div>
          <NavBar onBack={() => setStep(0)} onNext={() => setStep(2)} disabled={!v.machine || !v.shift} />
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <NumberPad label="Target" value={v.target} onChange={(x) => set({ target: x })} step={10} />
          <NumberPad label="Actual output (including rejects)" value={v.actual} onChange={(x) => set({ actual: x })} step={10} />
          <NumberPad label="Rejected" value={v.rejected} onChange={(x) => set({ rejected: x })} hint={Number(v.actual) ? `${pct(rejPct)} rejection` : undefined} />
          <div><label className="label" htmlFor="po">Production order</label><select id="po" className="input h-12" value={v.order} onChange={(e) => set({ order: e.target.value })}><option value="">None</option>{orders.rows.filter((o) => o.line_id === v.line).map((o) => <option key={o.id} value={o.id}>{String(o.number)}</option>)}</select></div>
          <div><label className="label" htmlFor="op">Operator</label><select id="op" className="input h-12" value={v.operator} onChange={(e) => set({ operator: e.target.value })}><option value="">Select…</option>{employees.rows.filter((e) => e.skill === 'operator').map((e) => <option key={e.id} value={e.id}>{String(e.name)}</option>)}</select></div>
          <NavBar onBack={() => setStep(1)} onNext={() => setStep(3)} disabled={v.actual === '' || v.target === ''} />
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <NumberPad label="Downtime" value={v.downtime} onChange={(x) => set({ downtime: x })} unit="min" step={5} hint={`Planned time ${planned} min`} />
          <div><span className="label">Downtime reason</span><div className="flex flex-wrap gap-2">{['none', 'breakdown', 'changeover', 'material_shortage', 'power_failure', 'quality_issue', 'no_operator', 'planned_maintenance', 'other'].map((r) => <button key={r} onClick={() => set({ reason: r })} className={`rounded-full border px-3 py-2 text-sm ${v.reason === r ? 'border-accent-blue bg-accent-blue text-white' : 'border-base-border bg-white'}`}>{humanize(r)}</button>)}</div></div>
          <div><label className="label" htmlFor="cm">Comments</label><textarea id="cm" rows={3} className="input" value={v.comments} onChange={(e) => set({ comments: e.target.value })} /></div>
          <Photos files={files} setFiles={setFiles} />
          {errors.map((e) => <p key={e} className="text-sm text-accent-red">{e}</p>)}
          <NavBar onBack={() => setStep(2)} onNext={() => setStep(4)} disabled={errors.length > 0} nextLabel="Review" />
        </div>
      )}
      {step === 4 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['Achievement', pct(pctTarget, 0)], ['Rejection', pct(rejPct)], ['OEE', pct(oee ? oee.oee * 100 : null)]].map(([k, x]) => <div key={k} className="rounded-xl border border-base-border bg-white p-3"><p className="text-[11px] text-ink-muted">{k}</p><p className="font-mono text-lg font-semibold">{x}</p></div>)}
          </div>
          <dl className="divide-y divide-base-border rounded-xl border border-base-border bg-white">
            {[['Line', String(lines.map.get(v.line)?.name)], ['Machine', String(machine?.name)], ['Shift', `${shift?.name} · ${v.date}`], ['Target / actual / rejected', `${v.target} / ${v.actual} / ${v.rejected}`], ['Downtime', `${v.downtime} min · ${humanize(v.reason)}`], ['Operator', String(employees.map.get(v.operator)?.name ?? '—')], ['Attachments', String(files.length)]].map(([k, x]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-3 text-sm"><dt className="text-ink-muted">{k}</dt><dd className="text-right font-medium">{x}</dd></div>
            ))}
          </dl>
          <NavBar onBack={() => setStep(3)} onNext={() => void submit()} nextLabel="Submit shift report" loading={act.busy} />
        </div>
      )}
    </div>
  );
}

// ─── Maintenance technician ───
function Technician() {
  const { user } = useApp();
  const act = useActions();
  const confirm = useConfirm();
  const employees = useLookup('employees');
  const machines = useLookup('machines');
  const materials = useLookup('materials');
  const warehouses = useLookup('warehouses');
  const me = employees.rows.find((e) => e.skill === 'technician' && String(e.name).toLowerCase() === user?.name.toLowerCase());
  const [who, setWho] = useState<string>('');
  const techId = who || me?.id || '';
  const wos = useQuery('work_orders', { where: { status: ['open', 'assigned', 'in_progress', 'on_hold'], ...(techId && techId !== 'all' ? { assigned_to: techId } : {}) }, orderBy: { key: 'due_date', dir: 'asc' } });
  const [sel, setSel] = useState<BaseRow | null>(null);
  const [parts, setParts] = useState<LineItem[]>([]);
  const [wh, setWh] = useState('');
  const [hours, setHours] = useState<number | ''>('');
  const [down, setDown] = useState<number | ''>('');
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [outcome, setOutcome] = useState<MutationOutcome<unknown> | null>(null);

  const open = (w: BaseRow) => {
    setSel(w); setParts(((w.parts_used as LineItem[]) ?? []).map((p) => ({ ...p }))); setHours(Number(w.labour_hours ?? 0) || ''); setDown(Number(w.downtime_minutes ?? 0) || '');
    setRemarks(String(w.completion_remarks ?? '')); setWh(String(w.parts_warehouse_id ?? warehouses.rows.find((x) => x.kind === 'spares')?.id ?? '')); setFiles([]); setOutcome(null);
  };
  if (outcome && sel) return <Done outcome={outcome} title={`${sel.number} completed`} onNew={() => { setSel(null); setOutcome(null); }} link={outcome.status === 'saved' ? routeFor('work_orders', sel.id) : undefined}
    detail={<InfoBox>Machine returned to service and {parts.length} spare part line(s) issued from stock.</InfoBox>} />;

  if (!sel) {
    return (
      <div>
        <h2 className="mb-3 text-xl font-bold">My work orders</h2>
        <select aria-label="Technician" className="input mb-3 h-12" value={techId} onChange={(e) => setWho(e.target.value)}>
          <option value="all">All technicians</option>
          {employees.rows.filter((e) => e.skill === 'technician').map((e) => <option key={e.id} value={e.id}>{String(e.name)}{e.id === me?.id ? ' (me)' : ''}</option>)}
        </select>
        {wos.loading ? <Spinner /> : !wos.rows.length ? <EmptyState icon={ClipboardCheck} title="No open work orders" /> : (
          <div className="space-y-2">
            {wos.rows.map((w) => (
              <Choice key={w.id} onClick={() => open(w)} title={<>{String(w.number)} · {String(machines.map.get(String(w.machine_id))?.name ?? '')}</>}
                sub={`${humanize(w.wo_type)} · due ${w.due_date ?? '—'} · ${String(w.description).slice(0, 60)}`}
                right={<Badge variant={w.priority === 'critical' || w.priority === 'high' ? 'red' : 'amber'}>{String(w.priority)}</Badge>} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const mc = machines.map.get(String(sel.machine_id));
  const status = String(sel.status);
  const tx = async (to: string, label: string, comment?: string) => {
    const out = await act.transition('work_orders', sel.id, to, comment, `${sel.number}: ${label}`).catch(() => null);
    if (out) setSel({ ...sel, status: to });
  };
  const complete = async () => {
    const patch = { parts_used: parts.filter((p) => p.material_id && Number(p.qty) > 0), parts_warehouse_id: wh || null, labour_hours: Number(hours || 0), downtime_minutes: Number(down || 0), completion_remarks: remarks };
    const up = await act.update('work_orders', sel.id, patch, String(sel.number), true).catch(() => null);
    if (!up) return;
    for (const f of files) await act.upload(f, 'work_orders', sel.id, f.name).catch(() => undefined);
    const tr = await act.transition('work_orders', sel.id, 'completed', remarks || undefined, `${sel.number} completed`).catch(() => null);
    if (tr) setOutcome(tr.status === 'queued' || up.status === 'queued' ? { status: 'queued', opId: '' } : tr);
  };
  const spares = materials.rows.filter((m) => ['spare', 'consumable'].includes(String(m.type)));

  return (
    <div className="space-y-4">
      <button onClick={() => setSel(null)} className="inline-flex items-center gap-1 text-sm text-ink-muted"><ArrowLeft className="h-4 w-4" />Work orders</button>
      <div className="rounded-xl border border-base-border bg-white p-4">
        <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-bold">{String(sel.number)}</h2><Badge variant={status === 'in_progress' ? 'amber' : 'blue'}>{humanize(status)}</Badge></div>
        <p className="mt-1 text-sm">{String(sel.description)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          {[['Machine', String(mc?.name)], ['Asset code', String(mc?.code)], ['Machine status', humanize(mc?.status)], ['Make / model', `${mc?.make ?? '—'} ${mc?.model ?? ''}`]].map(([k, x]) => <div key={k}><dt className="text-ink-muted">{k}</dt><dd className="font-medium">{x}</dd></div>)}
        </dl>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {['open', 'assigned', 'on_hold'].includes(status) && <Button size="lg" onClick={() => void tx('in_progress', 'Started')} loading={act.busy} className="col-span-2">Start work</Button>}
        {status === 'in_progress' && <Button size="lg" tone="secondary" onClick={async () => { const r = await confirm({ title: 'Put work order on hold?', requireComment: true, commentLabel: 'Reason (e.g. waiting for spare)' }); if (r.ok) void tx('on_hold', 'On hold', r.comment); }}>Put on hold</Button>}
      </div>
      {status === 'in_progress' && (
        <>
          <div>
            <span className="label">Spare parts consumed</span>
            <div className="space-y-2">
              {parts.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <select aria-label="Part" className="input h-12 min-w-0 flex-[2]" value={p.material_id} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, material_id: e.target.value, rate: Number(materials.map.get(e.target.value)?.standard_cost ?? 0) } : x))}>
                    <option value="">Select part…</option>{spares.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
                  </select>
                  <input aria-label="Quantity" type="number" inputMode="decimal" min={0} className="input h-12 w-20 font-mono" value={p.qty || ''} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))} />
                  <button aria-label="Remove" onClick={() => setParts(parts.filter((_, j) => j !== i))} className="w-10 text-accent-red">×</button>
                </div>
              ))}
              <Button tone="secondary" icon={Plus} onClick={() => setParts([...parts, { material_id: '', qty: 1, rate: 0 }])}>Add part</Button>
              {parts.length > 0 && (
                <select aria-label="Issue from warehouse" className="input h-12" value={wh} onChange={(e) => setWh(e.target.value)}>
                  <option value="">Issue parts from…</option>{warehouses.rows.map((w) => <option key={w.id} value={w.id}>{String(w.name)}</option>)}
                </select>
              )}
              {parts.length > 0 && <p className="text-xs text-ink-muted">Parts value {money(parts.reduce((s, p) => s + Number(p.qty) * Number(p.rate), 0))}</p>}
            </div>
          </div>
          <NumberPad label="Labour hours" value={hours} onChange={setHours} step={0.5} />
          <NumberPad label="Machine downtime" value={down} onChange={setDown} unit="min" step={15} />
          <div><label className="label" htmlFor="rm">Completion remarks *</label><textarea id="rm" rows={3} className="input" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></div>
          <Photos files={files} setFiles={setFiles} />
          <NavBar onNext={() => void complete()} nextLabel="Submit completion" loading={act.busy} disabled={!remarks.trim() || (parts.length > 0 && !wh)} />
        </>
      )}
    </div>
  );
}

// ─── Quality inspector ───
function Inspector() {
  const act = useActions();
  const reqs = useQuery('inspections', { where: { status: ['requested', 'in_progress'] }, orderBy: { key: 'inspection_date', dir: 'asc' } });
  const materials = useLookup('materials');
  const suppliers = useLookup('suppliers');
  const defects = useLookup('defect_codes');
  const [sel, setSel] = useState<BaseRow | null>(null);
  const params = useQuery('quality_parameters', { where: { material_id: String(sel?.material_id ?? ''), stage: String(sel?.stage ?? '') } }, { enabled: !!sel });
  const [accepted, setAccepted] = useState<number | ''>('');
  const [rejected, setRejected] = useState<number | ''>(0);
  const [sample, setSample] = useState<number | ''>('');
  const [defect, setDefect] = useState('');
  const [findings, setFindings] = useState('');
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [outcome, setOutcome] = useState<MutationOutcome<unknown> | null>(null);
  const [decision, setDecision] = useState('');

  const open = (i: BaseRow) => { setSel(i); setAccepted(Number(i.lot_qty) - Number(i.rejected_qty ?? 0)); setRejected(Number(i.rejected_qty ?? 0)); setSample(Number(i.sample_size ?? 0) || ''); setDefect(String(i.defect_code_id ?? '')); setFindings(String(i.findings ?? '')); setMeasures({}); setFiles([]); setOutcome(null); };
  if (outcome && sel) return <Done outcome={outcome} title={`Inspection ${humanize(decision)}`} onNew={() => { setSel(null); setOutcome(null); }} link={outcome.status === 'saved' ? routeFor('inspections', sel.id) : undefined}
    detail={decision === 'failed' || Number(rejected) > 0 ? <InfoBox variant="amber">A non-conformance report (NCR) {outcome.status === 'saved' ? 'was' : 'will be'} raised automatically.</InfoBox> : undefined} />;

  if (!sel) {
    return (
      <div>
        <h2 className="mb-3 text-xl font-bold">Inspection requests</h2>
        {reqs.loading ? <Spinner /> : !reqs.rows.length ? <EmptyState icon={ClipboardCheck} title="No pending inspections" /> : (
          <div className="space-y-2">
            {reqs.rows.map((i) => <Choice key={i.id} onClick={() => open(i)} title={<>{String(i.number)} · {String(materials.map.get(String(i.material_id))?.name ?? '')}</>} sub={`${humanize(i.stage)} · lot ${qty(i.lot_qty, 0)} · batch ${i.batch_no ?? '—'}${i.supplier_id ? ` · ${suppliers.map.get(String(i.supplier_id))?.name}` : ''}`} right={<Badge variant={i.status === 'in_progress' ? 'amber' : 'grey'}>{humanize(i.status)}</Badge>} />)}
          </div>
        )}
      </div>
    );
  }

  const lot = Number(sel.lot_qty);
  const invalid = Number(accepted) + Number(rejected) > lot;
  const oos = params.rows.filter((p) => { const v = measures[p.id]; if (v === undefined || v === '') return false; const n = Number(v); return (p.min_value != null && n < Number(p.min_value)) || (p.max_value != null && n > Number(p.max_value)); });
  const decide = async (to: 'passed' | 'conditional' | 'failed') => {
    const measured = params.rows.filter((p) => measures[p.id]).map((p) => `${p.name}: ${measures[p.id]}${p.unit ? ` ${p.unit}` : ''}${oos.includes(p) ? ' (OUT OF SPEC)' : ''}`).join('; ');
    const allFindings = [findings, measured && `Measurements — ${measured}`].filter(Boolean).join('\n');
    if (to !== 'passed' && !allFindings.trim()) return;
    const up = await act.update('inspections', sel.id, { accepted_qty: Number(accepted || 0), rejected_qty: Number(rejected || 0), sample_size: Number(sample || 0) || null, defect_code_id: defect || null, findings: allFindings || null }, String(sel.number), true).catch(() => null);
    if (!up) return;
    for (const f of files) await act.upload(f, 'inspections', sel.id, f.name).catch(() => undefined);
    const tr = await act.transition('inspections', sel.id, to, allFindings || undefined, `${sel.number}: ${humanize(to)}`).catch(() => null);
    if (tr) { setDecision(to); setOutcome(tr.status === 'queued' || up.status === 'queued' ? { status: 'queued', opId: '' } : tr); }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setSel(null)} className="inline-flex items-center gap-1 text-sm text-ink-muted"><ArrowLeft className="h-4 w-4" />Requests</button>
      <div className="rounded-xl border border-base-border bg-white p-4">
        <h2 className="text-lg font-bold">{String(sel.number)}</h2>
        <p className="text-sm">{String(materials.map.get(String(sel.material_id))?.name)} · {humanize(sel.stage)} · lot {qty(lot, 0)} · batch {String(sel.batch_no ?? '—')}</p>
      </div>
      {params.rows.length > 0 && (
        <div>
          <span className="label">Quality parameters</span>
          <div className="space-y-2">
            {params.rows.map((p) => (
              <div key={p.id} className={`flex items-center gap-3 rounded-xl border bg-white p-3 ${oos.includes(p) ? 'border-accent-red' : 'border-base-border'}`}>
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{String(p.name)}</p><p className="font-mono text-xs text-ink-muted">spec {String(p.min_value ?? '—')} – {String(p.max_value ?? '—')} {String(p.unit ?? '')}</p></div>
                <input aria-label={String(p.name)} type="number" inputMode="decimal" step="any" className="input h-12 w-28 text-right font-mono" value={measures[p.id] ?? ''} onChange={(e) => setMeasures({ ...measures, [p.id]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}
      <NumberPad label="Sample size" value={sample} onChange={setSample} />
      <NumberPad label="Accepted" value={accepted} onChange={setAccepted} step={10} />
      <NumberPad label="Rejected" value={rejected} onChange={setRejected} hint={invalid ? <span className="text-accent-red">Accepted + rejected exceeds lot quantity ({lot})</span> : `${pct(lot ? (Number(rejected) / lot) * 100 : 0)} of lot`} />
      <div><label className="label" htmlFor="dc">Defect classification</label><select id="dc" className="input h-12" value={defect} onChange={(e) => setDefect(e.target.value)}><option value="">None</option>{defects.rows.map((d) => <option key={d.id} value={d.id}>{String(d.code)} · {String(d.name)} ({String(d.severity)})</option>)}</select></div>
      <div><label className="label" htmlFor="fd">Findings {oos.length ? '*' : ''}</label><textarea id="fd" rows={3} className="input" value={findings} onChange={(e) => setFindings(e.target.value)} /></div>
      <Photos files={files} setFiles={setFiles} />
      {oos.length > 0 && <InfoBox variant="red">{oos.length} parameter(s) out of specification.</InfoBox>}
      <div className="pb-safe sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-3 grid grid-cols-3 gap-2 border-t border-base-border bg-base-bg/95 px-3 py-3 backdrop-blur lg:bottom-0">
        <Button size="lg" tone="success" disabled={invalid || oos.length > 0} loading={act.busy} onClick={() => void decide('passed')}>Approve</Button>
        <Button size="lg" tone="secondary" disabled={invalid || !findings.trim()} onClick={() => void decide('conditional')}>Deviation</Button>
        <Button size="lg" tone="danger" disabled={invalid || !findings.trim()} onClick={() => void decide('failed')}>Reject</Button>
      </div>
      {!findings.trim() && <p className="text-center text-xs text-ink-muted">Findings are required to accept with deviation or reject.</p>}
    </div>
  );
}
