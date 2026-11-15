import { BackendError, uuid, type Backend, type Session } from './backend';
import { getFile, putFile } from './fileStore';
import type { TableName } from './schema';

export type OpKind = 'insert' | 'update' | 'remove' | 'rpc' | 'upload';

export interface QueuedOp {
  id: string;
  kind: OpKind;
  label: string;
  table?: TableName;
  recordId?: string;
  values?: Record<string, unknown>;
  name?: string;
  args?: Record<string, unknown>;
  fileName?: string;
  companyId: string;
  userId: string;
  createdAt: string;
  status: 'queued' | 'syncing' | 'failed';
  attempts: number;
  error?: string;
}

export type MutationOutcome<T> = { status: 'saved'; result: T } | { status: 'queued'; opId: string };

const KEY = 'gnanova.sync-queue.v1';

/**
 * Write path for the whole app. Online writes go straight to the backend.
 * Offline (or network-failed) writes are persisted and replayed in order on
 * reconnect. Server rejections are kept as `failed` for the user to resolve —
 * nothing is ever reported as saved until the server has accepted it.
 */
export class SyncEngine {
  ops: QueuedOp[] = [];
  private listeners = new Set<() => void>();
  private flushing = false;

  constructor(private backend: Backend, private storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage, private online: () => boolean = () => navigator.onLine) {
    try {
      this.ops = JSON.parse(storage.getItem(KEY) ?? '[]') as QueuedOp[];
      for (const op of this.ops) if (op.status === 'syncing') op.status = 'queued';
    } catch {
      this.ops = [];
    }
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private persist() {
    this.storage.setItem(KEY, JSON.stringify(this.ops));
    this.listeners.forEach((fn) => fn());
  }

  pendingFor(s: Session | null) {
    return s ? this.ops.filter((o) => o.companyId === s.companyId && o.userId === s.userId) : [];
  }

  private async exec(op: QueuedOp, s: Session): Promise<unknown> {
    switch (op.kind) {
      case 'insert':
        try {
          return await this.backend.insert(op.table!, op.values!, s);
        } catch (e) {
          // Idempotent replay: if a previous attempt reached the server, the row exists.
          if (e instanceof BackendError && e.code === 'conflict' && op.values?.id) {
            const existing = await this.backend.select(op.table!, { where: { id: op.values.id }, limit: 1 }, s);
            if (existing.rows.length) return existing.rows[0];
          }
          throw e;
        }
      case 'update':
        return this.backend.update(op.table!, op.recordId!, op.values!, s);
      case 'remove':
        return this.backend.remove(op.table!, op.recordId!, s);
      case 'rpc':
        return this.backend.rpc(op.name!, op.args ?? {}, s);
      case 'upload': {
        const blob = await getFile(`queue:${op.id}`);
        if (!blob) throw new BackendError('validation', 'Queued file is no longer available on this device');
        return this.backend.upload(blob, { entity: op.table!, recordId: op.recordId!, fileName: op.fileName! }, s);
      }
    }
  }

  async mutate<T = unknown>(op: Omit<QueuedOp, 'id' | 'companyId' | 'userId' | 'createdAt' | 'status' | 'attempts'>, s: Session): Promise<MutationOutcome<T>> {
    if (op.kind === 'upload') throw new BackendError('validation', 'Use upload() for files');
    const full: QueuedOp = {
      ...op, id: uuid(), companyId: s.companyId, userId: s.userId, createdAt: new Date().toISOString(), status: 'queued', attempts: 0,
    };
    if (full.kind === 'insert') full.values = { id: uuid(), ...full.values };
    // Preserve ordering: if earlier writes are still queued, this one must wait behind them.
    const mustQueue = !this.online() || this.pendingFor(s).some((o) => o.status !== 'failed');
    if (!mustQueue) {
      try {
        const result = (await this.exec(full, s)) as T;
        this.notifyChange();
        return { status: 'saved', result };
      } catch (e) {
        if (!(e instanceof BackendError && e.code === 'network')) throw e;
      }
    }
    this.ops.push(full);
    this.persist();
    return { status: 'queued', opId: full.id };
  }

  async upload(file: Blob, meta: { table: TableName; recordId: string; fileName: string; label: string }, s: Session) {
    if (this.online() && !this.pendingFor(s).some((o) => o.status !== 'failed')) {
      try {
        const res = await this.backend.upload(file, { entity: meta.table, recordId: meta.recordId, fileName: meta.fileName }, s);
        this.notifyChange();
        return { status: 'saved' as const, result: res };
      } catch (e) {
        if (!(e instanceof BackendError && e.code === 'network')) throw e;
      }
    }
    const op: QueuedOp = {
      id: uuid(), kind: 'upload', label: meta.label, table: meta.table, recordId: meta.recordId, fileName: meta.fileName,
      companyId: s.companyId, userId: s.userId, createdAt: new Date().toISOString(), status: 'queued', attempts: 0,
    };
    await putFile(`queue:${op.id}`, file);
    this.ops.push(op);
    this.persist();
    return { status: 'queued' as const, opId: op.id };
  }

  private notifyChange(force = false) {
    if ((force || this.backend.kind === 'supabase') && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gnanova:data-changed', { detail: { table: '*' } }));
    }
  }

  /** Replays queued ops in order. Stops at the first network failure. */
  async flush(s: Session | null): Promise<{ synced: number; failed: number }> {
    if (!s || this.flushing || !this.online()) return { synced: 0, failed: 0 };
    this.flushing = true;
    let synced = 0, failed = 0;
    try {
      for (const op of this.pendingFor(s).filter((o) => o.status === 'queued')) {
        op.status = 'syncing';
        op.attempts++;
        this.persist();
        try {
          await this.exec(op, s);
          this.ops = this.ops.filter((o) => o.id !== op.id);
          synced++;
          this.persist();
        } catch (e) {
          const err = e instanceof BackendError ? e : new BackendError('unknown', String((e as Error)?.message ?? e));
          if (err.code === 'network') {
            op.status = 'queued';
            this.persist();
            break;
          }
          op.status = 'failed';
          op.error = err.message;
          failed++;
          this.persist();
        }
      }
    } finally {
      this.flushing = false;
      if (synced) this.notifyChange(true);
    }
    return { synced, failed };
  }

  retry(id: string) {
    const op = this.ops.find((o) => o.id === id);
    if (op) {
      op.status = 'queued';
      op.error = undefined;
      this.persist();
    }
  }

  discard(id: string) {
    this.ops = this.ops.filter((o) => o.id !== id);
    this.persist();
  }
}
