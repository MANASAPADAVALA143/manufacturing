import { useMemo, useState, type CSSProperties } from 'react';
import { Plus, ScanLine, Trash2 } from 'lucide-react';
import type { FieldDef } from '@/lib/data/entities';
import type { BaseRow, TableName } from '@/lib/data/schema';
import { displayName } from '@/lib/data/hooks';
import { useToast } from '@/components/Toast';
import { money } from '@/lib/format';
import { ScannerDialog } from './Scanner';

type Maps = Record<string, Map<string, BaseRow>>;

export function refOptions(f: FieldDef, maps: Maps): BaseRow[] {
  const rows = [...(maps[f.ref as string]?.values() ?? [])];
  const filtered = f.refWhere
    ? rows.filter((r) => Object.entries(f.refWhere!).every(([k, vals]) => vals.includes(r[k])))
    : rows;
  return filtered.sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

/** Resolve a scanned code to a referenced row by barcode, code or number. */
export function resolveScan(code: string, rows: BaseRow[]): BaseRow | undefined {
  const c = code.trim().toLowerCase();
  return rows.find((r) => [r.barcode, r.code, r.number, r.registration_no].some((v) => v && String(v).toLowerCase() === c));
}

export function FieldInput({ f, value, onChange, maps, error, disabled }: {
  f: FieldDef; value: unknown; onChange: (v: unknown) => void; maps: Maps; error?: string; disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [scan, setScan] = useState(false);
  const id = `f-${f.key}`;
  const common = { id, disabled: disabled || f.readOnly, 'aria-invalid': !!error, 'aria-describedby': error ? `${id}-err` : undefined };
  const options = useMemo(() => (f.type === 'ref' ? refOptions(f, maps) : []), [f, maps]);

  let input: JSX.Element;
  switch (f.type) {
    case 'textarea':
      input = <textarea {...common} rows={3} className="input" value={String(value ?? '')} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'number':
    case 'currency':
    case 'percent':
      input = (
        <div className="relative">
          {f.type === 'currency' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">₹</span>}
          <input {...common} type="number" inputMode="decimal" step="any" min={f.min} max={f.max}
            className={`input font-mono ${f.type === 'currency' ? 'pl-7' : ''} ${f.type === 'percent' ? 'pr-8' : ''}`}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
          {f.type === 'percent' && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">%</span>}
        </div>
      );
      break;
    case 'date':
      input = <input {...common} type="date" className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)} />;
      break;
    case 'datetime':
      input = <input {...common} type="datetime-local" className="input" value={String(value ?? '').slice(0, 16)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
      break;
    case 'boolean':
      input = (
        <label className="flex h-10 cursor-pointer items-center gap-3">
          <input {...common} type="checkbox" className="peer sr-only" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          <span className="relative h-6 w-11 rounded-full bg-slate-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-accent-green peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-accent-blue" />
          <span className="text-sm text-ink-primary">{value ? 'Yes' : 'No'}</span>
        </label>
      );
      break;
    case 'select':
      input = (
        <select {...common} className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Select…</option>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case 'ref':
      input = (
        <select {...common} className="input" value={String(value ?? '')} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{options.length ? 'Select…' : 'No records available'}</option>
          {options.map((r) => <option key={r.id} value={r.id}>{displayName(r)}</option>)}
          {Boolean(value) && !options.some((o) => o.id === value) && maps[f.ref as string]?.get(String(value)) && (
            <option value={String(value)}>{displayName(maps[f.ref as string].get(String(value)))}</option>
          )}
        </select>
      );
      break;
    case 'lines':
      input = <LinesEditor f={f} value={Array.isArray(value) ? value : []} onChange={onChange} maps={maps} disabled={disabled} />;
      break;
    case 'color':
      input = <input {...common} type="color" className="h-10 w-20 cursor-pointer rounded-lg border border-base-border" value={String(value ?? '#1E40AF')} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      input = (
        <input {...common} type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
          inputMode={f.type === 'phone' ? 'tel' : f.type === 'email' ? 'email' : undefined}
          autoComplete="off" className="input" value={String(value ?? '')} placeholder={f.placeholder} maxLength={f.maxLength}
          onChange={(e) => onChange(e.target.value)} />
      );
  }

  return (
    <div className={f.wide || f.type === 'lines' || f.type === 'textarea' ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="label">
        {f.label}{f.required && !f.readOnly && <span className="text-accent-red"> *</span>}
      </label>
      {f.scannable && !disabled ? (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">{input}</div>
          <button type="button" onClick={() => setScan(true)} className="flex h-10 w-11 shrink-0 items-center justify-center rounded-lg border border-base-border text-ink-muted hover:border-accent-blue hover:text-accent-blue" aria-label={`Scan ${f.label}`}>
            <ScanLine className="h-5 w-5" />
          </button>
        </div>
      ) : input}
      {f.help && !error && <p className="mt-1 text-xs text-ink-faint">{f.help}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs text-accent-red">{error}</p>}
      <ScannerDialog
        open={scan}
        onClose={() => setScan(false)}
        onResult={(code) => {
          setScan(false);
          if (f.type === 'ref') {
            const hit = resolveScan(code, [...(maps[f.ref as string]?.values() ?? [])]);
            if (hit) onChange(hit.id);
            else showToast(`No ${f.label.toLowerCase()} matches code "${code}"`, 'error');
          } else onChange(code);
        }}
      />
    </div>
  );
}

function LinesEditor({ f, value, onChange, maps, disabled }: { f: FieldDef; value: Record<string, unknown>[]; onChange: (v: unknown) => void; maps: Maps; disabled?: boolean }) {
  const cols = f.lineFields ?? [];
  const hasRate = cols.some((c) => c.key === 'rate') && cols.some((c) => c.key === 'qty');
  const set = (i: number, k: string, v: unknown) => {
    const next = value.map((l, j) => (j === i ? { ...l, [k]: v } : l));
    // Default the rate from the material master when a material is picked.
    if (k === 'material_id' && hasRate) {
      const m = maps.materials?.get(String(v));
      if (m && !next[i].rate) next[i].rate = Number(m.standard_cost ?? 0) || null;
    }
    onChange(next);
  };
  const add = () => onChange([...value, Object.fromEntries(cols.map((c) => [c.key, c.default ?? (c.type === 'number' || c.type === 'currency' ? null : '')]))]);
  const total = hasRate ? value.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0) : 0;

  const cell = (c: FieldDef, l: Record<string, unknown>, i: number) => {
    const v = l[c.key];
    if (c.type === 'ref') {
      const opts = refOptions(c, maps);
      return (
        <select disabled={disabled} aria-label={c.label} className="input min-w-0" value={String(v ?? '')} onChange={(e) => set(i, c.key, e.target.value || null)}>
          <option value="">Select…</option>
          {opts.map((r) => <option key={r.id} value={r.id}>{displayName(r)}</option>)}
        </select>
      );
    }
    if (c.type === 'number' || c.type === 'currency') {
      return <input disabled={disabled} aria-label={c.label} type="number" inputMode="decimal" step="any" min={c.min} className="input font-mono" value={v === null || v === undefined ? '' : String(v)} onChange={(e) => set(i, c.key, e.target.value === '' ? null : Number(e.target.value))} />;
    }
    return <input disabled={disabled} aria-label={c.label} className="input" value={String(v ?? '')} onChange={(e) => set(i, c.key, e.target.value)} />;
  };

  const tmpl = { '--cols': `${cols.map((c) => (c.type === 'ref' ? 'minmax(0,2.2fr)' : 'minmax(0,1fr)')).join(' ')}${hasRate ? ' minmax(0,1fr)' : ''} 36px` } as CSSProperties;

  return (
    <div className="rounded-lg border border-base-border">
      <div className="hidden gap-2 border-b border-base-border bg-base-subtle px-3 py-2 sm:grid sm:[grid-template-columns:var(--cols)]" style={tmpl}>
        {cols.map((c) => <span key={c.key} className="font-mono text-[10px] uppercase tracking-wider text-ink-muted">{c.label}</span>)}
        {hasRate && <span className="text-right font-mono text-[10px] uppercase tracking-wider text-ink-muted">Amount</span>}
        <span />
      </div>
      {value.length === 0 && <p className="px-3 py-4 text-center text-sm text-ink-muted">No items yet</p>}
      {value.map((l, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 border-b border-base-border p-3 last:border-b-0 sm:items-center sm:py-2 sm:[grid-template-columns:var(--cols)]" style={tmpl}>
          {cols.map((c) => (
            <div key={c.key} className={`min-w-0 ${c.type === 'ref' ? 'col-span-2 sm:col-span-1' : ''}`}>
              <span className="mb-1 block text-[11px] text-ink-muted sm:hidden">{c.label}</span>
              {cell(c, l, i)}
            </div>
          ))}
          {hasRate && (
            <div className="flex items-center gap-2 sm:block sm:text-right">
              <span className="text-[11px] text-ink-muted sm:hidden">Amount</span>
              <span className="font-mono text-sm">{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</span>
            </div>
          )}
          {!disabled && (
            <button type="button" aria-label={`Remove line ${i + 1}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="flex h-10 items-center justify-center justify-self-end rounded-lg px-2 text-ink-muted hover:bg-accent-red/5 hover:text-accent-red sm:justify-self-auto">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 bg-base-subtle px-3 py-2">
        {!disabled ? (
          <button type="button" onClick={add} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-blue hover:underline">
            <Plus className="h-4 w-4" /> Add item
          </button>
        ) : <span />}
        {hasRate && <span className="font-mono text-sm text-ink-primary">Total {money(total)}</span>}
      </div>
    </div>
  );
}

export function useRefTables(fields: FieldDef[]): TableName[] {
  return useMemo(() => {
    const s = new Set<TableName>();
    for (const f of fields) {
      if (f.type === 'ref' && f.ref) s.add(f.ref);
      for (const lf of f.lineFields ?? []) if (lf.type === 'ref' && lf.ref) s.add(lf.ref);
    }
    return [...s];
  }, [fields]);
}
