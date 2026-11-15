import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/config';
import { BackendError, uuid, type Backend, type Membership, type Query, type QueryResult, type RegisterCompanyInput, type Session } from './backend';
import type { Attachment, BaseRow, Company, Member, TableName } from './schema';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}

const BUCKET = 'documents';
const CACHE_PREFIX = 'gnanova.cache:';

function isNetworkError(e: unknown) {
  const msg = String((e as { message?: string })?.message ?? e);
  return (typeof navigator !== 'undefined' && !navigator.onLine) || /Failed to fetch|NetworkError|Load failed|fetch failed|ERR_INTERNET/i.test(msg);
}

/** Maps PostgREST / Postgres errors to app error codes. */
export function mapError(e: unknown): BackendError {
  if (e instanceof BackendError) return e;
  if (isNetworkError(e)) return new BackendError('network', 'You are offline or the server is unreachable');
  const err = e as { code?: string; message?: string; details?: string; hint?: string };
  const msg = err.message ?? 'Unexpected error';
  switch (err.code) {
    case '42501': return new BackendError('forbidden', 'Permission denied by company access policy');
    case 'PGRST116': return new BackendError('not_found', 'Record not found or not visible to you');
    case '23505': return new BackendError('conflict', err.details || 'A record with these values already exists');
    case '23503': return new BackendError('conflict', 'This record is referenced by other records');
    case '23514':
    case '22P02':
    case 'P0001': return new BackendError('validation', msg);
    case 'P0002': return new BackendError('not_found', msg);
    case 'P0003': return new BackendError('forbidden', msg);
    default: return new BackendError('unknown', msg);
  }
}

const cacheKey = (s: Session, table: string, q: Query) => `${CACHE_PREFIX}${s.companyId}:${table}:${JSON.stringify(q)}`;

function escapeIlike(v: string) {
  return v.replace(/[%_,()]/g, ' ').trim();
}

export class SupabaseBackend implements Backend {
  kind = 'supabase' as const;
  private sb = supabase();

  async select<T extends BaseRow = BaseRow>(table: TableName, q: Query, s: Session): Promise<QueryResult<T>> {
    const key = cacheKey(s, table, q);
    try {
      let query = this.sb.from(table).select('*', { count: 'exact' }).eq('company_id', s.companyId);
      for (const [k, v] of Object.entries(q.where ?? {})) {
        if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
        query = Array.isArray(v) ? query.in(k, v) : v === null ? query.is(k, null) : query.eq(k, v);
      }
      for (const [k, v] of Object.entries(q.gte ?? {})) query = query.gte(k, v);
      for (const [k, v] of Object.entries(q.lte ?? {})) query = query.lte(k, v);
      if (q.search && q.searchKeys?.length) {
        const term = escapeIlike(q.search);
        if (term) query = query.or(q.searchKeys.map((k) => `${k}.ilike.%${term}%`).join(','));
      }
      if (q.orderBy) query = query.order(q.orderBy.key, { ascending: q.orderBy.dir === 'asc', nullsFirst: false });
      const from = q.offset ?? 0;
      query = query.range(from, from + (q.limit ?? 1000) - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      const result = { rows: (data ?? []) as T[], total: count ?? data?.length ?? 0 };
      try {
        localStorage.setItem(key, JSON.stringify({ ...result, cachedAt: new Date().toISOString() }));
      } catch {
        /* cache is best-effort */
      }
      return result;
    } catch (e) {
      const err = mapError(e);
      if (err.code === 'network') {
        const cached = localStorage.getItem(key);
        if (cached) return { ...(JSON.parse(cached) as QueryResult<T>), stale: true };
      }
      throw err;
    }
  }

  async insert(table: TableName, values: Record<string, unknown>, s: Session) {
    const { data, error } = await this.sb.from(table).insert({ ...values, company_id: s.companyId }).select().single();
    if (error) throw mapError(error);
    return data as BaseRow;
  }

  async update(table: TableName, id: string, patch: Record<string, unknown>, s: Session) {
    const { data, error } = await this.sb.from(table).update(patch).eq('id', id).eq('company_id', s.companyId).select().single();
    if (error) throw mapError(error);
    return data as BaseRow;
  }

  async remove(table: TableName, id: string, s: Session) {
    const { error, count } = await this.sb.from(table).delete({ count: 'exact' }).eq('id', id).eq('company_id', s.companyId);
    if (error) throw mapError(error);
    if (count === 0) throw new BackendError('forbidden', 'Record could not be deleted (not found or not permitted)');
  }

  async rpc<T = unknown>(name: string, args: Record<string, unknown>, s: Session) {
    const { data, error } = await this.sb.rpc(name, { ...args, p_company_id: s.companyId });
    if (error) throw mapError(error);
    return data as T;
  }

  async upload(file: Blob, meta: { entity: TableName; recordId: string; fileName: string }, s: Session): Promise<Attachment> {
    const safe = meta.fileName.replace(/[^\w.-]+/g, '_').slice(-120);
    const path = `${s.companyId}/${meta.entity}/${meta.recordId}/${uuid()}-${safe}`;
    const up = await this.sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (up.error) throw mapError(up.error);
    try {
      return (await this.insert('attachments', {
        entity: meta.entity, record_id: meta.recordId, file_name: meta.fileName, mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size, storage_path: path,
      }, s)) as unknown as Attachment;
    } catch (e) {
      await this.sb.storage.from(BUCKET).remove([path]);
      throw e;
    }
  }

  async fileUrl(att: Attachment) {
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(att.storage_path, 600);
    if (error) throw mapError(error);
    return data.signedUrl;
  }

  async getCompany(id: string) {
    const { data, error } = await this.sb.from('companies').select('*').eq('id', id).single();
    if (error) throw mapError(error);
    return data as Company;
  }

  async updateCompany(id: string, patch: Partial<Company>) {
    const { id: _i, is_demo: _d, created_at: _c, ...safe } = patch;
    const { data, error } = await this.sb.from('companies').update(safe).eq('id', id).select().single();
    if (error) throw mapError(error);
    return data as Company;
  }

  async memberships(userId: string): Promise<Membership[]> {
    const { data, error } = await this.sb.from('company_members').select('*, company:companies(*)').eq('user_id', userId).eq('active', true);
    if (error) throw mapError(error);
    return (data ?? []).map((r) => {
      const { company, ...member } = r as Member & { company: Company };
      return { company, member: member as Member };
    });
  }

  async registerCompany(input: RegisterCompanyInput) {
    const { data, error } = await this.sb.rpc('register_company', {
      p_name: input.name, p_gstin: input.gstin ?? null, p_city: input.city ?? null,
      p_brand_color: input.brandColor ?? '#1E40AF', p_factory_name: input.factoryName, p_admin_name: input.adminName,
    });
    if (error) throw mapError(error);
    return data as Company;
  }

  /** Calls a deployed Edge Function with the user's JWT (RLS applies inside). */
  async invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.sb.functions.invoke(fn, { body });
    if (error) throw mapError(error);
    return data as T;
  }
}
