import type { Role } from '@/lib/rbac';
import type { Attachment, BaseRow, Company, Member, TableName } from './schema';

export interface Query {
  search?: string;
  searchKeys?: string[];
  /** Equality filter; an array value means "in". */
  where?: Record<string, unknown>;
  gte?: Record<string, string | number>;
  lte?: Record<string, string | number>;
  orderBy?: { key: string; dir: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

export interface QueryResult<T> {
  rows: T[];
  total: number;
  /** True when served from the offline cache rather than the server. */
  stale?: boolean;
  cachedAt?: string;
}

export interface Session {
  userId: string;
  email: string;
  name: string;
  companyId: string;
  role: Role;
}

export interface Membership {
  company: Company;
  member: Member;
}

export type BackendErrorCode = 'network' | 'forbidden' | 'validation' | 'conflict' | 'not_found' | 'auth' | 'unknown';

export class BackendError extends Error {
  constructor(
    public code: BackendErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export interface UploadMeta {
  entity: TableName;
  recordId: string;
  fileName: string;
}

export interface RegisterCompanyInput {
  name: string;
  gstin?: string;
  city?: string;
  brandColor?: string;
  factoryName: string;
  adminName: string;
}

export interface Backend {
  kind: 'demo' | 'supabase';
  // data
  select<T extends BaseRow = BaseRow>(table: TableName, q: Query, s: Session): Promise<QueryResult<T>>;
  insert(table: TableName, values: Record<string, unknown>, s: Session): Promise<BaseRow>;
  update(table: TableName, id: string, patch: Record<string, unknown>, s: Session): Promise<BaseRow>;
  remove(table: TableName, id: string, s: Session): Promise<void>;
  rpc<T = unknown>(name: string, args: Record<string, unknown>, s: Session): Promise<T>;
  upload(file: Blob, meta: UploadMeta, s: Session): Promise<Attachment>;
  fileUrl(att: Attachment): Promise<string>;
  // tenancy
  getCompany(id: string): Promise<Company>;
  updateCompany(id: string, patch: Partial<Company>, s: Session): Promise<Company>;
  memberships(userId: string): Promise<Membership[]>;
  registerCompany(input: RegisterCompanyInput, user: { id: string; email: string }): Promise<Company>;
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      /* insecure context (http on LAN) — fall through */
    }
  }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** In-memory implementation of `Query`, used by the demo backend and the offline cache. */
export function applyQuery<T extends Record<string, unknown>>(rows: T[], q: Query): QueryResult<T> {
  let out = rows;
  if (q.where) {
    for (const [k, v] of Object.entries(q.where)) {
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
      out = Array.isArray(v) ? out.filter((r) => v.includes(r[k])) : out.filter((r) => r[k] === v);
    }
  }
  if (q.gte) for (const [k, v] of Object.entries(q.gte)) out = out.filter((r) => r[k] != null && (r[k] as string | number) >= v);
  if (q.lte) for (const [k, v] of Object.entries(q.lte)) out = out.filter((r) => r[k] != null && (r[k] as string | number) <= v);
  if (q.search && q.searchKeys?.length) {
    const s = q.search.toLowerCase();
    out = out.filter((r) => q.searchKeys!.some((k) => String(r[k] ?? '').toLowerCase().includes(s)));
  }
  if (q.orderBy) {
    const { key, dir } = q.orderBy;
    const m = dir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const x = a[key] as string | number | null | undefined;
      const y = b[key] as string | number | null | undefined;
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return x < y ? -m : x > y ? m : 0;
    });
  }
  const total = out.length;
  if (q.offset || q.limit) out = out.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? out.length));
  return { rows: out, total };
}
