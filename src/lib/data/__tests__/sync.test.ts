import { describe, expect, it } from 'vitest';
import { BackendError, type Backend, type Session } from '../backend';
import { SyncEngine } from '../sync';

const session: Session = { userId: 'u1', email: 'a@b.c', name: 'A', companyId: 'c1', role: 'store_keeper' };

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

/** Fake server: records accepted inserts; can be switched offline or made to reject. */
function fakeBackend() {
  const rows = new Map<string, Record<string, unknown>>();
  const state = { offline: false, reject: null as string | null, calls: 0 };
  const backend = {
    kind: 'demo',
    async insert(_t: string, values: Record<string, unknown>) {
      state.calls++;
      if (state.offline) throw new BackendError('network', 'offline');
      if (state.reject && values.qty === state.reject) throw new BackendError('validation', 'Insufficient stock');
      if (rows.has(String(values.id))) throw new BackendError('conflict', 'exists');
      rows.set(String(values.id), values);
      return { ...values };
    },
    async select(_t: string, q: { where?: { id?: string } }) {
      const r = rows.get(String(q.where?.id));
      return { rows: r ? [r] : [], total: r ? 1 : 0 };
    },
  } as unknown as Backend;
  return { backend, rows, state };
}

describe('SyncEngine (offline queue)', () => {
  it('saves directly when online', async () => {
    const { backend, rows } = fakeBackend();
    const s = new SyncEngine(backend, memoryStorage(), () => true);
    const out = await s.mutate({ kind: 'insert', table: 'stock_movements', values: { qty: 5 }, label: 'IN' }, session);
    expect(out.status).toBe('saved');
    expect(rows.size).toBe(1);
  });

  it('queues while offline and never reports the write as saved', async () => {
    const { backend, rows } = fakeBackend();
    let online = false;
    const s = new SyncEngine(backend, memoryStorage(), () => online);
    const out = await s.mutate({ kind: 'insert', table: 'stock_movements', values: { qty: 5 }, label: 'IN' }, session);
    expect(out.status).toBe('queued');
    expect(rows.size).toBe(0);
    expect(s.pendingFor(session)).toHaveLength(1);
    online = true;
    const r = await s.flush(session);
    expect(r).toEqual({ synced: 1, failed: 0 });
    expect(rows.size).toBe(1);
    expect(s.pendingFor(session)).toHaveLength(0);
  });

  it('queues when the network fails mid-request', async () => {
    const { backend, state } = fakeBackend();
    const s = new SyncEngine(backend, memoryStorage(), () => true);
    state.offline = true;
    const out = await s.mutate({ kind: 'insert', table: 't' as never, values: { qty: 1 }, label: 'x' }, session);
    expect(out.status).toBe('queued');
  });

  it('keeps later writes behind earlier queued ones (ordering)', async () => {
    const { backend } = fakeBackend();
    let online = false;
    const s = new SyncEngine(backend, memoryStorage(), () => online);
    await s.mutate({ kind: 'insert', table: 't' as never, values: { qty: 1 }, label: 'first' }, session);
    online = true;
    const second = await s.mutate({ kind: 'insert', table: 't' as never, values: { qty: 2 }, label: 'second' }, session);
    expect(second.status).toBe('queued');
    expect(s.pendingFor(session).map((o) => o.label)).toEqual(['first', 'second']);
  });

  it('marks server rejections as failed for the user to retry or discard', async () => {
    const { backend, state } = fakeBackend();
    let online = false;
    const s = new SyncEngine(backend, memoryStorage(), () => online);
    await s.mutate({ kind: 'insert', table: 't' as never, values: { qty: 'BAD' }, label: 'too much' }, session);
    state.reject = 'BAD';
    online = true;
    const r = await s.flush(session);
    expect(r).toEqual({ synced: 0, failed: 1 });
    const [op] = s.pendingFor(session);
    expect(op.status).toBe('failed');
    expect(op.error).toBe('Insufficient stock');
    s.discard(op.id);
    expect(s.pendingFor(session)).toHaveLength(0);
  });

  it('replays idempotently if a previous attempt reached the server', async () => {
    const { backend, rows, state } = fakeBackend();
    let online = false;
    const s = new SyncEngine(backend, memoryStorage(), () => online);
    await s.mutate({ kind: 'insert', table: 't' as never, values: { qty: 1 }, label: 'x' }, session);
    const id = String(s.pendingFor(session)[0].values!.id);
    rows.set(id, { id, qty: 1 }); // server got it, but the response was lost
    online = true;
    const r = await s.flush(session);
    expect(r.synced).toBe(1);
    expect(rows.size).toBe(1);
    expect(state.calls).toBe(1);
  });

  it('persists the queue across reloads and only replays for the same user/company', async () => {
    const storage = memoryStorage();
    const { backend } = fakeBackend();
    const s1 = new SyncEngine(backend, storage, () => false);
    await s1.mutate({ kind: 'insert', table: 't' as never, values: { qty: 1 }, label: 'x' }, session);
    const s2 = new SyncEngine(backend, storage, () => true);
    expect(s2.pendingFor(session)).toHaveLength(1);
    expect(s2.pendingFor({ ...session, companyId: 'other' })).toHaveLength(0);
    expect((await s2.flush({ ...session, companyId: 'other' })).synced).toBe(0);
  });
});
