import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/app';
import { useToast } from '@/components/Toast';
import { BackendError, type Query, type QueryResult, type Session } from './backend';
import type { MutationOutcome } from './sync';
import type { BaseRow, TableName } from './schema';

// ─── Query cache shared by all components ───
type Entry = { promise?: Promise<QueryResult<BaseRow>>; result?: QueryResult<BaseRow>; error?: BackendError; table: TableName };
const cache = new Map<string, Entry>();
const subscribers = new Map<string, Set<() => void>>();

function invalidate(table: string) {
  for (const [key, entry] of cache) {
    if (table === '*' || entry.table === table) {
      cache.delete(key);
      subscribers.get(key)?.forEach((fn) => fn());
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('gnanova:data-changed', (e) => invalidate((e as CustomEvent<{ table: string }>).detail.table));
}

export function invalidateAll() {
  invalidate('*');
}

function fetchCached(key: string, table: TableName, run: () => Promise<QueryResult<BaseRow>>) {
  const hit = cache.get(key);
  if (hit?.promise) return hit.promise;
  const entry: Entry = { table };
  entry.promise = run()
    .then((r) => {
      entry.result = r;
      return r;
    })
    .catch((e) => {
      entry.error = e instanceof BackendError ? e : new BackendError('unknown', String(e?.message ?? e));
      cache.delete(key);
      throw entry.error;
    });
  cache.set(key, entry);
  return entry.promise;
}

export interface QueryState<T> {
  rows: T[];
  total: number;
  loading: boolean;
  error: BackendError | null;
  stale: boolean;
  cachedAt?: string;
  refetch: () => void;
}

export function useQuery<T extends BaseRow = BaseRow>(table: TableName | null, q: Query = {}, opts: { enabled?: boolean } = {}): QueryState<T> {
  const { backend, session } = useApp();
  const enabled = opts.enabled !== false && !!table && !!session;
  const qKey = JSON.stringify(q);
  const key = enabled ? `${session!.companyId}|${session!.userId}|${table}|${qKey}` : '';
  const [state, setState] = useState<{ result?: QueryResult<T>; error: BackendError | null; loading: boolean }>(() => {
    const hit = key ? cache.get(key)?.result : undefined;
    return { result: hit as QueryResult<T> | undefined, error: null, loading: !hit };
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return;
    const set = subscribers.get(key) ?? new Set();
    const fn = () => setTick((t) => t + 1);
    set.add(fn);
    subscribers.set(key, set);
    return () => {
      set.delete(fn);
    };
  }, [key]);

  useEffect(() => {
    if (!enabled) {
      setState({ result: undefined, error: null, loading: false });
      return;
    }
    let alive = true;
    const hit = cache.get(key)?.result;
    if (hit) setState({ result: hit as QueryResult<T>, error: null, loading: false });
    else setState((s) => ({ ...s, loading: true }));
    fetchCached(key, table!, () => backend.select(table!, JSON.parse(qKey) as Query, session as Session))
      .then((r) => alive && setState({ result: r as QueryResult<T>, error: null, loading: false }))
      .catch((e: BackendError) => alive && setState((s) => ({ ...s, error: e, loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const refetch = useCallback(() => {
    if (key) {
      cache.delete(key);
      setTick((t) => t + 1);
    }
  }, [key]);

  return {
    rows: state.result?.rows ?? [],
    total: state.result?.total ?? 0,
    loading: state.loading,
    error: state.error,
    stale: !!state.result?.stale,
    cachedAt: state.result?.cachedAt,
    refetch,
  };
}

/** All rows of a (small) table, plus an id → row map. */
export function useLookup<T extends BaseRow = BaseRow>(table: TableName | null | undefined, enabled = true) {
  const q = useQuery<T>(table ?? null, { limit: 2000 }, { enabled: enabled && !!table });
  const map = useMemo(() => new Map(q.rows.map((r) => [r.id, r])), [q.rows]);
  return { ...q, map };
}

/** Loads several small tables at once and returns id → row maps plus a name resolver. */
export function useRefMaps(tables: TableName[]) {
  const { backend, session } = useApp();
  const tKey = [...new Set(tables)].sort().join(',');
  const [maps, setMaps] = useState<Record<string, Map<string, BaseRow>>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<{ table: string }>).detail.table;
      if (t === '*' || tKey.split(',').includes(t)) setTick((x) => x + 1);
    };
    window.addEventListener('gnanova:data-changed', on);
    return () => window.removeEventListener('gnanova:data-changed', on);
  }, [tKey]);

  useEffect(() => {
    if (!session || !tKey) return;
    let alive = true;
    const list = tKey.split(',') as TableName[];
    const q: Query = { limit: 2000 };
    Promise.all(list.map((t) => {
      const key = `${session.companyId}|${session.userId}|${t}|${JSON.stringify(q)}`;
      return fetchCached(key, t, () => backend.select(t, q, session)).then((r) => [t, r.rows] as const).catch(() => [t, [] as BaseRow[]] as const);
    })).then((res) => {
      if (alive) setMaps(Object.fromEntries(res.map(([t, rows]) => [t, new Map(rows.map((r) => [r.id, r]))])));
    });
    return () => {
      alive = false;
    };
  }, [backend, session, tKey, tick]);

  const name = useCallback((t: TableName, id: unknown) => (id ? shortName(maps[t]?.get(String(id))) : ''), [maps]);
  return { maps, name };
}

export function displayName(r: BaseRow | undefined | null): string {
  if (!r) return '';
  const code = r.code ?? r.number ?? r.registration_no;
  const name = r.name ?? r.full_name ?? r.task ?? r.invoice_no;
  if (code && name && code !== name) return `${code} · ${name}`;
  return String(name ?? code ?? r.id.slice(0, 8));
}

export function shortName(r: BaseRow | undefined | null): string {
  if (!r) return '—';
  return String(r.name ?? r.full_name ?? r.number ?? r.code ?? r.registration_no ?? r.invoice_no ?? r.task ?? '—');
}

// ─── Mutations ───
export function useActions() {
  const { sync, session } = useApp();
  const { showToast } = useToast();
  const busyRef = useRef(0);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T,>(fn: (s: Session) => Promise<MutationOutcome<T>>, labels: { saved: string; queued?: string }, quiet = false): Promise<MutationOutcome<T> | null> => {
      if (!session) {
        showToast('Your session has ended. Sign in again.', 'error');
        return null;
      }
      busyRef.current++;
      setBusy(true);
      try {
        const out = await fn(session);
        if (!quiet) {
          if (out.status === 'saved') showToast(labels.saved, 'success');
          else showToast(labels.queued ?? 'Saved on this device only — it will sync when you are back online.', 'warning');
        }
        return out;
      } catch (e) {
        const err = e instanceof BackendError ? e : new BackendError('unknown', String((e as Error)?.message ?? e));
        showToast(err.message, 'error');
        throw err;
      } finally {
        busyRef.current--;
        if (!busyRef.current) setBusy(false);
      }
    },
    [session, showToast],
  );

  return useMemo(() => ({
    busy,
    insert: (table: TableName, values: Record<string, unknown>, label: string, quiet = false) =>
      run<BaseRow>((s) => sync.mutate({ kind: 'insert', table, values, label }, s), { saved: `${label} saved` }, quiet),
    update: (table: TableName, id: string, values: Record<string, unknown>, label: string, quiet = false) =>
      run<BaseRow>((s) => sync.mutate({ kind: 'update', table, recordId: id, values, label }, s), { saved: `${label} updated` }, quiet),
    remove: (table: TableName, id: string, label: string) =>
      run<void>((s) => sync.mutate({ kind: 'remove', table, recordId: id, label }, s), { saved: `${label} deleted` }),
    transition: (table: TableName, id: string, to: string, comment: string | undefined, label: string) =>
      run<BaseRow>((s) => sync.mutate({ kind: 'rpc', name: 'transition_status', args: { p_table: table, p_id: id, p_to: to, p_comment: comment ?? null }, label }, s), { saved: label }),
    rpc: <T,>(name: string, args: Record<string, unknown>, label: string, quiet = false) =>
      run<T>((s) => sync.mutate<T>({ kind: 'rpc', name, args, label }, s), { saved: label }, quiet),
    upload: (file: Blob, table: TableName, recordId: string, fileName: string) =>
      run((s) => sync.upload(file, { table, recordId, fileName, label: `Upload ${fileName}` }, s), { saved: `${fileName} uploaded`, queued: `${fileName} stored on this device — it will upload when you are back online.` }),
  }), [busy, run, sync]);
}
