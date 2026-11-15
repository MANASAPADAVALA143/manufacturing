import { applyQuery, BackendError, uuid, type Backend, type Membership, type Query, type RegisterCompanyInput, type Session } from './backend';
import { DEMO_KEY, DemoEngine, freshMemberRow, type DemoDB } from './demoEngine';
import { buildDemoDB } from './seed';
import { clearFiles, getFile, putFile } from './fileStore';
import { DEFAULT_COMPANY_SETTINGS, type AppNotification, type Attachment, type BaseRow, type Company, type Member, type TableName } from './schema';

const MAX_DEMO_FILE = 8 * 1024 * 1024;

function load(): DemoDB {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (raw) {
      const db = JSON.parse(raw) as DemoDB;
      if (db.version === 3) return db;
    }
  } catch {
    /* corrupted — reseed */
  }
  const db = buildDemoDB();
  localStorage.setItem(DEMO_KEY, JSON.stringify(db));
  return db;
}

export class DemoBackend implements Backend {
  kind = 'demo' as const;
  engine: DemoEngine;

  constructor() {
    this.engine = new DemoEngine(load());
    // Keep multiple tabs consistent.
    window.addEventListener('storage', (ev) => {
      if (ev.key === DEMO_KEY && ev.newValue) {
        this.engine.db = JSON.parse(ev.newValue) as DemoDB;
        window.dispatchEvent(new CustomEvent('gnanova:data-changed', { detail: { table: '*' } }));
      }
    });
    this.engine.onChange((table) => window.dispatchEvent(new CustomEvent('gnanova:data-changed', { detail: { table } })));
  }

  /** Runs a mutation atomically: on any error, the in-memory DB is restored. */
  private tx<T>(fn: () => T): T {
    const snapshot = JSON.stringify(this.engine.db);
    try {
      const out = fn();
      this.engine.save();
      return out;
    } catch (e) {
      this.engine.db = JSON.parse(snapshot) as DemoDB;
      throw e;
    }
  }

  users() {
    return this.engine.db.users;
  }

  async select<T extends BaseRow = BaseRow>(table: TableName, q: Query, s: Session) {
    const actor = this.engine.resolveActor(s.userId, s.companyId);
    this.engine.assertCan(actor, table, 'view');
    let rows = this.engine.rows(table, s.companyId);
    if (table === 'notifications') {
      rows = rows.filter((n) => {
        const x = n as AppNotification;
        return x.target_user_id ? x.target_user_id === s.userId : x.target_roles.includes(actor.role) || actor.role === 'super_admin';
      });
    }
    if (table === 'notification_preferences') rows = rows.filter((p) => p.user_id === s.userId);
    return applyQuery(rows as T[], q);
  }

  async insert(table: TableName, values: Record<string, unknown>, s: Session) {
    return this.tx(() => structuredClone(this.engine.insert(this.engine.resolveActor(s.userId, s.companyId), table, values)));
  }

  async update(table: TableName, id: string, patch: Record<string, unknown>, s: Session) {
    return this.tx(() => structuredClone(this.engine.update(this.engine.resolveActor(s.userId, s.companyId), table, id, patch)));
  }

  async remove(table: TableName, id: string, s: Session) {
    this.tx(() => this.engine.remove(this.engine.resolveActor(s.userId, s.companyId), table, id));
  }

  async rpc<T = unknown>(name: string, args: Record<string, unknown>, s: Session) {
    return this.tx(() => structuredClone(this.engine.rpc(this.engine.resolveActor(s.userId, s.companyId), name, args)) as T);
  }

  async upload(file: Blob, meta: { entity: TableName; recordId: string; fileName: string }, s: Session): Promise<Attachment> {
    const actor = this.engine.resolveActor(s.userId, s.companyId);
    try {
      this.engine.assertCan(actor, meta.entity, 'create');
    } catch {
      this.engine.assertCan(actor, meta.entity, 'edit');
    }
    if (file.size > MAX_DEMO_FILE) throw new BackendError('validation', 'Files over 8 MB are not supported in demo mode');
    const path = `${s.companyId}/${meta.entity}/${meta.recordId}/${uuid()}-${meta.fileName}`;
    await putFile(path, file);
    return this.tx(() => this.engine.insert(actor, 'attachments', {
      entity: meta.entity, record_id: meta.recordId, file_name: meta.fileName, mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size, storage_path: path,
    }, { trusted: true }) as unknown as Attachment);
  }

  async fileUrl(att: Attachment) {
    const blob = await getFile(att.storage_path);
    if (!blob) throw new BackendError('not_found', 'File is not available on this device (demo files are stored locally)');
    return URL.createObjectURL(blob);
  }

  async getCompany(id: string) {
    return structuredClone(this.engine.company(id));
  }

  async updateCompany(id: string, patch: Partial<Company>, s: Session) {
    return this.tx(() => {
      const actor = this.engine.resolveActor(s.userId, id);
      if (!['company_admin', 'super_admin'].includes(actor.role)) throw new BackendError('forbidden', 'Only Company Admins can change company settings');
      const c = this.engine.company(id);
      const { id: _i, is_demo: _d, created_at: _c, ...safe } = patch;
      Object.assign(c, safe, { settings: { ...c.settings, ...(patch.settings ?? {}) } });
      this.engine.audit(actor, 'company_members', id, 'update', { company: { from: null, to: Object.keys(safe) } }, 'Company settings updated');
      return structuredClone(c);
    });
  }

  async memberships(userId: string): Promise<Membership[]> {
    const ms = (this.engine.t('company_members') as Member[]).filter((m) => m.user_id === userId && m.active !== false);
    return ms.map((member) => ({ member: structuredClone(member), company: structuredClone(this.engine.company(member.company_id)) }));
  }

  async registerCompany(input: RegisterCompanyInput, user: { id: string; email: string }) {
    return this.tx(() => {
      const name = input.name.trim();
      if (name.length < 3) throw new BackendError('validation', 'Company name must be at least 3 characters');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (this.engine.db.companies.some((c) => c.slug === slug)) throw new BackendError('conflict', 'A company with this name already exists');
      const company: Company = {
        id: uuid(), name, slug, gstin: input.gstin || null, address: input.city || null, brand_color: input.brandColor || '#1E40AF',
        logo_url: null, currency: 'INR', timezone: 'Asia/Kolkata', is_demo: false, settings: { ...DEFAULT_COMPANY_SETTINGS }, created_at: new Date().toISOString(),
      };
      this.engine.db.companies.push(company);
      let u = this.engine.db.users.find((x) => x.id === user.id);
      if (!u) {
        u = { id: user.id, email: user.email, name: input.adminName };
        this.engine.db.users.push(u);
      }
      this.engine.t('company_members').push(freshMemberRow(company.id, u, 'company_admin'));
      const actor = this.engine.resolveActor(u.id, company.id);
      const f = this.engine.insert(actor, 'factories', { code: 'F1', name: input.factoryName, city: input.city ?? '', active: true });
      this.engine.insert(actor, 'shifts', { code: 'G', name: 'General', start_time: '09:00', end_time: '17:30', planned_minutes: 480 });
      for (const [code, n, d] of [['NOS', 'Numbers', 0], ['KG', 'Kilogram', 2], ['L', 'Litre', 1]] as const) this.engine.insert(actor, 'uoms', { code, name: n, decimals: d });
      this.engine.insert(actor, 'warehouses', { code: 'MAIN', name: 'Main Store', factory_id: f.id, kind: 'general', active: true });
      return structuredClone(company);
    });
  }

  /** Demo-only: create a local persona (no password — demo data is not secured). */
  createDemoUser(email: string, name: string) {
    return this.tx(() => {
      const e = email.trim().toLowerCase();
      let u = this.engine.db.users.find((x) => x.email === e);
      if (!u) {
        u = { id: uuid(), email: e, name };
        this.engine.db.users.push(u);
      }
      return u;
    });
  }

  async reset() {
    localStorage.removeItem(DEMO_KEY);
    await clearFiles();
    this.engine.db = load();
    window.dispatchEvent(new CustomEvent('gnanova:data-changed', { detail: { table: '*' } }));
  }
}
