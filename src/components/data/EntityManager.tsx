import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Filter, History, Pencil, Plus, Search, Trash2, WifiOff } from 'lucide-react';
import { useApp } from '@/lib/app';
import { entity, statusDef, validateRecord, type EntityDef, type FieldDef } from '@/lib/data/entities';
import { useActions, useQuery, useRefMaps, displayName } from '@/lib/data/hooks';
import { BackendError, uuid } from '@/lib/data/backend';
import type { AuditEntry, BaseRow, TableName } from '@/lib/data/schema';
import { date, dateTime, humanize, money, pct, qty } from '@/lib/format';
import { exportCsv } from '@/lib/export';
import { setParam, useRoute } from '@/lib/router';
import { Badge, Button, EmptyState, Sheet, Spinner, useConfirm } from '@/components/ui';
import { FieldInput, useRefTables } from './FieldInput';
import { AttachmentList, FilePickers, PendingFiles } from './Attachments';

type RefName = (t: TableName, id: unknown) => string;

export function renderValue(f: FieldDef, v: unknown, refName: RefName): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-ink-faint">—</span>;
  switch (f.type) {
    case 'ref': return refName(f.ref!, v) || <span className="text-ink-faint">—</span>;
    case 'currency': return <span className="font-mono">{money(v)}</span>;
    case 'number': return <span className="font-mono">{qty(v)}</span>;
    case 'percent': return <span className="font-mono">{pct(Number(v))}</span>;
    case 'date': return date(v);
    case 'datetime': return dateTime(v);
    case 'boolean': return v ? 'Yes' : 'No';
    case 'select': return f.options?.find((o) => o.value === v)?.label ?? humanize(v);
    case 'lines': return Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : '—';
    case 'color': return <span className="inline-flex items-center gap-2"><span className="h-4 w-4 rounded" style={{ background: String(v) }} />{String(v)}</span>;
    default: return String(v);
  }
}

export function StatusBadge({ def, value }: { def: EntityDef; value: unknown }) {
  const s = statusDef(def, value);
  if (!s) return value ? <Badge variant="grey">{humanize(value)}</Badge> : null;
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function titleOf(def: EntityDef, r: BaseRow, refName: RefName) {
  const f = def.fields.find((x) => x.key === def.titleKey);
  if (f?.type === 'ref') return refName(f.ref!, r[f.key]);
  return String(r[def.titleKey] ?? displayName(r));
}

export interface EntityManagerProps {
  table: TableName;
  title?: string;
  fixedWhere?: Record<string, unknown>;
  initialValues?: Record<string, unknown>;
  columns?: string[];
  allowCreate?: boolean;
  createLabel?: string;
  pageSize?: number;
  detailExtra?: (row: BaseRow) => ReactNode;
  rowActions?: (row: BaseRow) => ReactNode;
  emptyHint?: string;
  toolbarExtra?: ReactNode;
}

const PAGE = 20;

export default function EntityManager(props: EntityManagerProps) {
  const { table, fixedWhere, columns, pageSize = PAGE } = props;
  const def = entity(table);
  const { can, company } = useApp();
  const route = useRoute();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(def.defaultSort ?? { key: 'created_at', dir: 'desc' as const });
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<BaseRow | 'new' | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const where = useMemo(() => ({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(fixedWhere ?? {}) }), [filters, fixedWhere]);
  const q = { where, search: debounced || undefined, searchKeys: def.searchKeys, orderBy: sort, limit: pageSize, offset: page * pageSize };
  const { rows, total, loading, error, stale, cachedAt } = useQuery(table, q);

  const refTables = useRefTables(def.fields);
  const { maps, name: refName } = useRefMaps(refTables);

  const colFields = useMemo(() => {
    const keys = columns ?? def.fields.filter((f) => f.table).map((f) => f.key);
    return keys.map((k) => def.fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f);
  }, [columns, def]);

  const filterFields = (def.filterKeys ?? []).filter((k) => k !== 'status' && !(fixedWhere && k in fixedWhere))
    .map((k) => def.fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f && (f.type === 'select' || f.type === 'ref'));
  const hasStatus = !!def.statuses && !(fixedWhere && 'status' in fixedWhere);
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const openId = route.params.get('id');
  const { rows: openRows } = useQuery(table, { where: { id: openId ?? '' } }, { enabled: !!openId });
  const openRow = openId ? rows.find((r) => r.id === openId) ?? openRows[0] : undefined;

  const canCreate = (props.allowCreate ?? table !== 'stock_balances') && can(def.module, 'create');
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const exportAll = () => {
    const cols = [
      ...def.fields.filter((f) => f.type !== 'lines').map((f) => ({
        label: f.label,
        value: (r: BaseRow) => {
          const v = r[f.key];
          if (f.type === 'ref') return refName(f.ref!, v);
          if (f.type === 'boolean') return v ? 'Yes' : 'No';
          return v as string | number | null;
        },
      })),
      ...(def.statuses ? [{ label: 'Status', value: (r: BaseRow) => statusDef(def, r.status)?.label ?? String(r.status ?? '') }] : []),
      { label: 'Created', value: (r: BaseRow) => r.created_at },
    ];
    exportCsv(`${company?.slug ?? 'export'}-${table}-${new Date().toISOString().slice(0, 10)}`, rows, cols);
  };

  const toggleSort = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-base-border bg-base-panel shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-base-border p-3 sm:px-4">
        {props.title !== '' && <h3 className="mr-auto hidden font-semibold text-ink-primary md:block">{props.title ?? def.plural}</h3>}
        <div className="relative min-w-0 flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${def.plural.toLowerCase()}…`} aria-label={`Search ${def.plural}`} className="input pl-9" />
        </div>
        {(hasStatus || filterFields.length > 0) && (
          <Button tone="secondary" icon={Filter} onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>
            <span className="hidden sm:inline">Filters</span>{activeFilters > 0 && <span className="rounded-full bg-accent-blue px-1.5 text-[10px] text-white">{activeFilters}</span>}
          </Button>
        )}
        <Button tone="secondary" icon={Download} onClick={exportAll} disabled={!rows.length} title="Export this page to Excel (CSV)"><span className="hidden sm:inline">Export</span></Button>
        {props.toolbarExtra}
        {canCreate && <Button icon={Plus} onClick={() => setEditing('new')}>{props.createLabel ?? `New ${def.label.toLowerCase()}`}</Button>}
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 gap-3 border-b border-base-border bg-base-subtle p-3 sm:grid-cols-2 sm:px-4 lg:grid-cols-4">
          {hasStatus && (
            <label className="block"><span className="label">Status</span>
              <select className="input" value={filters.status ?? ''} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(0); }}>
                <option value="">All statuses</option>
                {def.statuses!.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
          )}
          {filterFields.map((f) => (
            <label key={f.key} className="block"><span className="label">{f.label}</span>
              <select className="input" value={filters[f.key] ?? ''} onChange={(e) => { setFilters({ ...filters, [f.key]: e.target.value }); setPage(0); }}>
                <option value="">All</option>
                {f.type === 'select' ? f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
                  : [...(maps[f.ref!]?.values() ?? [])].map((r) => <option key={r.id} value={r.id}>{displayName(r)}</option>)}
              </select>
            </label>
          ))}
          <label className="block sm:hidden"><span className="label">Sort by</span>
            <select className="input" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(':'); setSort({ key, dir: dir as 'asc' | 'desc' }); }}>
              <option value="created_at:desc">Newest first</option>
              <option value="created_at:asc">Oldest first</option>
              {colFields.map((f) => <option key={f.key} value={`${f.key}:desc`}>{f.label} (high → low)</option>)}
            </select>
          </label>
          {activeFilters > 0 && <div className="flex items-end"><Button tone="ghost" onClick={() => setFilters({})}>Clear filters</Button></div>}
        </div>
      )}

      {stale && (
        <div className="flex items-center gap-2 border-b border-accent-amber/30 bg-accent-amber/5 px-4 py-2 text-xs text-accent-amber">
          <WifiOff className="h-3.5 w-3.5" /> Offline — showing data cached {cachedAt ? dateTime(cachedAt) : 'earlier'}. Changes you make will be queued.
        </div>
      )}

      {error ? (
        <EmptyState title="Could not load records">{error.message}</EmptyState>
      ) : loading && !rows.length ? (
        <Spinner />
      ) : !rows.length ? (
        <EmptyState title={debounced || activeFilters ? 'No matching records' : `No ${def.plural.toLowerCase()} yet`}
          action={canCreate && !debounced && !activeFilters ? <Button icon={Plus} onClick={() => setEditing('new')}>{props.createLabel ?? `New ${def.label.toLowerCase()}`}</Button> : undefined}>
          {debounced || activeFilters ? 'Try a different search or clear the filters.' : props.emptyHint}
        </EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-base-border bg-base-subtle">
                <tr>
                  {colFields.map((f) => (
                    <th key={f.key} className={`th ${['number', 'currency', 'percent'].includes(f.type) ? 'text-right' : ''}`}>
                      <button className="inline-flex items-center gap-1 hover:text-ink-primary" onClick={() => toggleSort(f.key)}>
                        {f.label}{sort.key === f.key && (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                      </button>
                    </th>
                  ))}
                  {def.statuses && <th className="th">Status</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setParam('id', r.id)} className="cursor-pointer border-b border-base-border last:border-b-0 hover:bg-base-hover">
                    {colFields.map((f, i) => (
                      <td key={f.key} className={`td ${i === 0 ? 'font-medium text-ink-primary' : 'text-ink-primary'} ${['number', 'currency', 'percent'].includes(f.type) ? 'text-right' : ''} max-w-[260px] truncate`}>
                        {renderValue(f, r[f.key], refName)}
                      </td>
                    ))}
                    {def.statuses && <td className="td"><StatusBadge def={def} value={r.status} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <ul className="divide-y divide-base-border md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => setParam('id', r.id)} className="w-full px-4 py-3 text-left active:bg-base-hover">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium text-ink-primary">{titleOf(def, r, refName)}</p>
                    {def.statuses && <StatusBadge def={def} value={r.status} />}
                  </div>
                  {def.subtitle && <p className="mt-0.5 truncate text-xs text-ink-muted">{def.subtitle(r, refName)}</p>}
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    {colFields.filter((f) => f.key !== def.titleKey).slice(0, 4).map((f) => (
                      <div key={f.key} className="min-w-0">
                        <dt className="text-ink-faint">{f.label}</dt>
                        <dd className="truncate text-ink-primary">{renderValue(f, r[f.key], refName)}</dd>
                      </div>
                    ))}
                  </dl>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-base-border px-4 py-2.5 text-xs text-ink-muted">
            <span>{page * pageSize + 1}–{Math.min(total, (page + 1) * pageSize)} of {total}</span>
            <div className="flex items-center gap-1">
              <button aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg p-2 hover:bg-base-hover disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="font-mono">{page + 1}/{pages}</span>
              <button aria-label="Next page" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg p-2 hover:bg-base-hover disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      )}

      {openRow && !editing && (
        <RecordDetail def={def} row={openRow} refName={refName} onClose={() => setParam('id', null)} onEdit={() => setEditing(openRow)}
          extra={props.detailExtra?.(openRow)} actions={props.rowActions?.(openRow)} />
      )}
      {editing && (
        <RecordForm def={def} row={editing === 'new' ? null : editing} maps={maps}
          initial={{ ...(fixedWhere ?? {}), ...(props.initialValues ?? {}) }}
          onClose={() => setEditing(null)}
          onSaved={(id) => { setEditing(null); if (id) setParam('id', id); }} />
      )}
    </div>
  );
}

// ─── Detail ───
export function RecordDetail({ def, row, refName, onClose, onEdit, extra, actions }: {
  def: EntityDef; row: BaseRow; refName: RefName; onClose: () => void; onEdit?: () => void; extra?: ReactNode; actions?: ReactNode;
}) {
  const { can } = useApp();
  const act = useActions();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'details' | 'history'>('details');
  const status = String(row.status ?? '');
  const transitions = (def.transitions ?? []).filter((t) => t.from.includes(status) && can(def.module, t.action));
  const editable = can(def.module, 'edit') && !def.immutable && (!def.editableIn || def.editableIn.includes(status));
  const deletable = can(def.module, 'delete') && !def.immutable && (!def.deletableIn || def.deletableIn.includes(status));
  const title = titleOf(def, row, refName);

  const doTransition = async (t: NonNullable<EntityDef['transitions']>[number]) => {
    const res = await confirm({
      title: `${t.label}?`, message: `${def.label} ${title} will move to “${statusDef(def, t.to)?.label ?? t.to}”.`,
      confirmLabel: t.label, tone: t.tone === 'danger' ? 'danger' : 'primary', requireComment: t.requireComment, commentLabel: 'Comment (recorded in audit trail)',
    });
    if (!res.ok) return;
    await act.transition(def.table, row.id, t.to, res.comment, `${title}: ${t.label}`).catch(() => undefined);
  };

  const doDelete = async () => {
    const res = await confirm({ title: `Delete ${def.label.toLowerCase()}?`, message: `${title} will be permanently deleted. This is recorded in the audit trail.`, confirmLabel: 'Delete', tone: 'danger' });
    if (!res.ok) return;
    const out = await act.remove(def.table, row.id, title).catch(() => null);
    if (out) onClose();
  };

  const fields = def.fields.filter((f) => f.key !== 'number' || def.titleKey !== 'number');
  return (
    <Sheet open onClose={onClose} wide={def.fields.some((f) => f.type === 'lines')}
      title={<span className="flex items-center gap-2">{title} {def.statuses && <StatusBadge def={def} value={row.status} />}</span>}
      subtitle={def.subtitle?.(row, refName)}
      footer={
        <>
          {deletable && <Button tone="danger" icon={Trash2} onClick={() => void doDelete()} className="mr-auto">Delete</Button>}
          {actions}
          {editable && onEdit && <Button tone="secondary" icon={Pencil} onClick={onEdit}>Edit</Button>}
          {transitions.map((t) => (
            <Button key={t.to + t.label} tone={t.tone === 'danger' ? 'danger' : t.tone === 'primary' ? 'primary' : 'secondary'} onClick={() => void doTransition(t)} loading={act.busy}>{t.label}</Button>
          ))}
        </>
      }>
      <div className="mb-4 flex gap-4 border-b border-base-border text-sm">
        {(['details', 'history'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 pb-2 font-medium ${tab === t ? 'border-accent-blue text-accent-blue' : 'border-transparent text-ink-muted'}`}>
            {t === 'details' ? 'Details' : 'Audit trail'}
          </button>
        ))}
      </div>
      {tab === 'details' ? (
        <div className="space-y-5">
          {extra}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.filter((f) => f.type !== 'lines').map((f) => (
              <div key={f.key} className={`min-w-0 ${f.wide || f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-muted">{f.label}</dt>
                <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm text-ink-primary">{renderValue(f, row[f.key], refName)}</dd>
              </div>
            ))}
          </dl>
          {fields.filter((f) => f.type === 'lines').map((f) => <LinesTable key={f.key} f={f} lines={row[f.key]} refName={refName} />)}
          {def.attachments && <AttachmentList table={def.table} recordId={row.id} canUpload={can(def.module, 'create') || can(def.module, 'edit')} />}
          <p className="text-xs text-ink-faint">Created {dateTime(row.created_at)} · Updated {dateTime(row.updated_at)}</p>
        </div>
      ) : (
        <AuditTrail table={def.table} recordId={row.id} />
      )}
    </Sheet>
  );
}

export function LinesTable({ f, lines, refName }: { f: FieldDef; lines: unknown; refName: RefName }) {
  const list = Array.isArray(lines) ? (lines as Record<string, unknown>[]) : [];
  const cols = f.lineFields ?? [];
  const extra = list.some((l) => l.received_qty !== undefined) && !cols.some((c) => c.key === 'received_qty');
  const hasAmt = cols.some((c) => c.key === 'rate');
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">{f.label}</p>
      {list.length === 0 ? <p className="text-sm text-ink-muted">None</p> : (
        <div className="overflow-x-auto rounded-lg border border-base-border">
          <table className="w-full text-sm">
            <thead className="bg-base-subtle"><tr>
              {cols.map((c) => <th key={c.key} className="th">{c.label}</th>)}
              {extra && <th className="th text-right">Received</th>}
              {hasAmt && <th className="th text-right">Amount</th>}
            </tr></thead>
            <tbody>
              {list.map((l, i) => (
                <tr key={i} className="border-t border-base-border">
                  {cols.map((c) => <td key={c.key} className="td">{renderValue(c, l[c.key], refName)}</td>)}
                  {extra && <td className="td text-right font-mono">{qty(l.received_qty ?? 0)}</td>}
                  {hasAmt && <td className="td text-right font-mono">{money((Number(l.qty) || 0) * (Number(l.rate) || 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AuditTrail({ table, recordId }: { table: TableName; recordId: string }) {
  const { rows, loading } = useQuery<AuditEntry>('audit_log', { where: { table_name: table, record_id: recordId }, orderBy: { key: 'created_at', dir: 'desc' }, limit: 100 });
  if (loading) return <Spinner />;
  if (!rows.length) return <EmptyState icon={History} title="No audit entries">Changes made through the app are recorded here.</EmptyState>;
  return (
    <ol className="relative space-y-4 border-l border-base-border pl-5">
      {rows.map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-accent-blue ring-4 ring-white" />
          <p className="text-sm text-ink-primary">
            <span className="font-medium">{a.actor_name ?? 'System'}</span>{' '}
            {a.action === 'transition' && a.changes?.status ? <>changed status <b>{humanize(a.changes.status.from)}</b> → <b>{humanize(a.changes.status.to)}</b></> : a.action === 'insert' ? 'created this record' : a.action === 'delete' ? 'deleted this record' : 'updated'}
          </p>
          {a.action === 'update' && a.changes && (
            <ul className="mt-1 space-y-0.5 text-xs text-ink-muted">
              {Object.entries(a.changes).slice(0, 8).map(([k, c]) => (
                <li key={k} className="break-words"><span className="font-mono">{k}</span>: {fmtChange(c.from)} → {fmtChange(c.to)}</li>
              ))}
            </ul>
          )}
          {a.note && <p className="mt-1 rounded bg-base-subtle px-2 py-1 text-xs text-ink-muted">“{a.note}”</p>}
          <p className="mt-0.5 text-xs text-ink-faint">{dateTime(a.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}

const fmtChange = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} items` : '{…}') : String(v).slice(0, 60));

// ─── Form ───
export function RecordForm({ def, row, maps, initial, onClose, onSaved, title, initialFiles, banner }: {
  def: EntityDef; row: BaseRow | null; maps: Record<string, Map<string, BaseRow>>; initial?: Record<string, unknown>;
  onClose: () => void; onSaved: (id: string | null) => void; title?: string; initialFiles?: File[]; banner?: ReactNode;
}) {
  const act = useActions();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    if (row) return { ...row };
    const v: Record<string, unknown> = { id: uuid() };
    for (const f of def.fields) {
      if (f.default !== undefined) v[f.key] = typeof f.default === 'function' ? (f.default as () => unknown)() : f.default;
      if (f.type === 'lines' && v[f.key] === undefined) v[f.key] = [];
    }
    return { ...v, ...(initial ?? {}) };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>(initialFiles ?? []);
  const computed = useMemo(() => ({ ...values, ...(def.compute?.(values) ?? {}) }), [values, def]);
  const formFields = def.fields.filter((f) => f.form !== false);

  const submit = async () => {
    const errs = validateRecord(def, computed);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const payload = Object.fromEntries(formFields.filter((f) => !f.readOnly).map((f) => [f.key, computed[f.key] ?? null]));
    try {
      const label = `${def.label} ${String(computed[def.titleKey] ?? '')}`.trim();
      const out = row
        ? await act.update(def.table, row.id, payload, label)
        : await act.insert(def.table, { ...payload, id: values.id }, def.label);
      if (!out) return;
      const id = row ? row.id : String(values.id);
      for (const f of files) await act.upload(f, def.table, id, f.name).catch(() => undefined);
      onSaved(out.status === 'saved' ? id : null);
    } catch (e) {
      if (e instanceof BackendError && e.fieldErrors) setErrors(e.fieldErrors);
    }
  };

  return (
    <Sheet open onClose={onClose} wide={def.fields.some((f) => f.type === 'lines')} title={title ?? (row ? `Edit ${def.label.toLowerCase()}` : `New ${def.label.toLowerCase()}`)}
      subtitle={row ? String(row.number ?? '') : def.numberPrefix ? `A ${def.numberPrefix} number is assigned when saved` : undefined}
      footer={<><Button tone="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} loading={act.busy}>{row ? 'Save changes' : `Create ${def.label.toLowerCase()}`}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {banner && <div className="sm:col-span-2">{banner}</div>}
        {Object.keys(errors).length > 0 && (
          <div role="alert" className="rounded-lg border border-accent-red/30 bg-accent-red/5 px-3 py-2 text-sm text-accent-red sm:col-span-2">
            Please fix {Object.keys(errors).length} field{Object.keys(errors).length > 1 ? 's' : ''}: {Object.values(errors)[0]}
          </div>
        )}
        {formFields.map((f) => (
          <FieldInput key={f.key} f={f} maps={maps} error={errors[f.key]}
            value={f.readOnly ? computed[f.key] : values[f.key]}
            onChange={(v) => { setValues((s) => ({ ...s, [f.key]: v })); if (errors[f.key]) setErrors(({ [f.key]: _, ...rest }) => rest); }} />
        ))}
        {def.attachments && !row && (
          <div className="sm:col-span-2">
            <span className="label">Supporting documents / photos</span>
            <FilePickers onFiles={(fs) => setFiles((x) => [...x, ...fs])} />
            <PendingFiles files={files} onRemove={(i) => setFiles((x) => x.filter((_, j) => j !== i))} />
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
