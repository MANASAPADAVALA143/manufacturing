import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useApp } from '@/lib/app';
import { ENTITIES } from '@/lib/data/entities';
import { displayName } from '@/lib/data/hooks';
import type { BaseRow, TableName } from '@/lib/data/schema';
import { routeFor } from '@/lib/routes';
import { navigate } from '@/lib/router';
import { navItems } from '@/lib/modules';

const SEARCHABLE: TableName[] = [
  'materials', 'suppliers', 'customers', 'machines', 'purchase_orders', 'invoices', 'sales_orders', 'rfqs',
  'quotations', 'work_orders', 'shipments', 'production_orders', 'purchase_requisitions', 'inspections', 'ncrs', 'employees',
];

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { backend, session, can } = useApp();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<{ table: TableName; rows: BaseRow[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTerm('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !session || term.trim().length < 2) {
      setResults([]);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const tables = SEARCHABLE.filter((t) => ENTITIES[t] && can(ENTITIES[t]!.module, 'view'));
      const res = await Promise.all(tables.map(async (table) => {
        try {
          const r = await backend.select(table, { search: term.trim(), searchKeys: ENTITIES[table]!.searchKeys, limit: 5 }, session);
          return { table, rows: r.rows };
        } catch {
          return { table, rows: [] };
        }
      }));
      if (alive) {
        setResults(res.filter((r) => r.rows.length));
        setLoading(false);
      }
    }, 200);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, open, session, backend, can]);

  if (!open) return null;
  const modules = term.trim() ? navItems.filter((m) => can(m.id, 'view') && m.label.toLowerCase().includes(term.trim().toLowerCase())) : [];
  const go = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center bg-navy-950/50 p-0 sm:p-4 sm:pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search" onClick={onClose}>
      <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-base-panel shadow-2xl sm:h-auto sm:max-h-[70vh] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-base-border px-4">
          <Search className="h-5 w-5 shrink-0 text-ink-faint" />
          <input ref={inputRef} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="Search POs, invoices, materials, machines, customers…" className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-faint" />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-ink-faint" />}
          <button onClick={onClose} aria-label="Close search" className="rounded-lg p-2 text-ink-muted hover:bg-base-hover"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {term.trim().length < 2 && <p className="px-3 py-6 text-center text-sm text-ink-muted">Type at least 2 characters. Tip: press <kbd className="rounded border px-1 font-mono text-xs">Ctrl</kbd> + <kbd className="rounded border px-1 font-mono text-xs">K</kbd> anywhere.</p>}
          {modules.length > 0 && (
            <div className="mb-2">
              <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">Modules</p>
              {modules.map((m) => (
                <button key={m.id} onClick={() => go(`/${m.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-hover">
                  <m.icon className="h-4 w-4 text-ink-muted" /> {m.label}
                </button>
              ))}
            </div>
          )}
          {results.map(({ table, rows }) => (
            <div key={table} className="mb-2">
              <p className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-ink-faint">{ENTITIES[table]!.plural}</p>
              {rows.map((r) => (
                <button key={r.id} onClick={() => go(routeFor(table, r.id))} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-base-hover">
                  <span className="truncate text-ink-primary">{displayName(r)}</span>
                  {r.status ? <span className="shrink-0 text-xs text-ink-muted">{String(r.status).replace(/_/g, ' ')}</span> : null}
                </button>
              ))}
            </div>
          ))}
          {term.trim().length >= 2 && !loading && !results.length && !modules.length && <p className="px-3 py-6 text-center text-sm text-ink-muted">No results for “{term}”.</p>}
        </div>
      </div>
    </div>
  );
}
