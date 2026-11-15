import { can, type Role } from '@/lib/rbac';
import { AUTOMATION_EVENTS, MAX_ATTEMPTS, nextAttemptDelayMs } from '@/lib/automation';
import { computeOee, matchInvoice, planConsumption, round } from '@/lib/domain';
import { addDays, daysAgo, ymd } from '@/lib/dates';
import { BackendError, uuid } from './backend';
import { ENTITIES, entity, validateRecord, type EntityDef } from './entities';
import {
  DEFAULT_COMPANY_SETTINGS,
  type AppNotification, type BaseRow, type Company, type CompanySettings, type LineItem,
  type Material, type Member, type TableName,
} from './schema';

/**
 * In-browser simulation of the server. Implements the same rules as the
 * Postgres triggers / RPCs in `supabase/migrations` so demo mode behaves
 * like production. It is NOT a security boundary — in production, RLS is.
 */

export const DEMO_KEY = 'gnanova.demo.v3';

export interface DemoUser { id: string; email: string; name: string }

export interface DemoDB {
  version: number;
  seededAt: string;
  companies: Company[];
  users: DemoUser[];
  tables: Partial<Record<TableName, BaseRow[]>>;
  seq: Record<string, number>;
}

export interface Actor { userId: string; name: string; companyId: string; role: Role }

interface WriteOpts { at?: string; silent?: boolean; trusted?: boolean }

/** Tables every member of a company may read (master data). */
export const MASTER_TABLES: TableName[] = [
  'factories', 'production_lines', 'warehouses', 'bins', 'shifts', 'uoms', 'employees', 'materials',
  'customers', 'suppliers', 'machines', 'transporters', 'vehicles', 'quality_parameters', 'defect_codes',
];

const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const todayStr = () => ymd();
const nowIso = () => new Date().toISOString();

export function moduleOf(table: TableName): string | null {
  const def = ENTITIES[table];
  if (def) return def.module;
  if (table === 'notification_outbox') return 'settings';
  if (table === 'report_runs') return 'reports';
  return null;
}

export class DemoEngine {
  db: DemoDB;
  private listeners = new Set<(table: TableName) => void>();

  constructor(db: DemoDB) {
    this.db = db;
  }

  // ─── persistence ───
  save() {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(this.db));
    } catch (e) {
      throw new BackendError('unknown', `Demo storage is full (${(e as Error).message}). Reset demo data in Settings.`);
    }
  }

  onChange(fn: (table: TableName) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(table: TableName) {
    this.listeners.forEach((fn) => fn(table));
  }

  t(table: TableName): BaseRow[] {
    return (this.db.tables[table] ??= []);
  }

  rows<T extends BaseRow = BaseRow>(table: TableName, companyId: string): T[] {
    return this.t(table).filter((r) => r.company_id === companyId) as T[];
  }

  find<T extends BaseRow = BaseRow>(table: TableName, id: unknown, companyId: string): T | undefined {
    return this.t(table).find((r) => r.id === id && r.company_id === companyId) as T | undefined;
  }

  company(id: string): Company {
    const c = this.db.companies.find((x) => x.id === id);
    if (!c) throw new BackendError('not_found', 'Company not found');
    return c;
  }

  settings(companyId: string): CompanySettings {
    return { ...DEFAULT_COMPANY_SETTINGS, ...this.company(companyId).settings };
  }

  /** Role is always re-read from the membership table, never trusted from the client. */
  resolveActor(userId: string, companyId: string): Actor {
    const m = this.t('company_members').find(
      (r) => r.company_id === companyId && r.user_id === userId && r.active !== false,
    ) as Member | undefined;
    if (!m) throw new BackendError('forbidden', 'You are not a member of this company');
    return { userId, name: m.full_name, companyId, role: m.role };
  }

  nextNumber(companyId: string, prefix: string, at?: string): string {
    const year = (at ?? nowIso()).slice(0, 4);
    const key = `${companyId}:${prefix}:${year}`;
    const n = (this.db.seq[key] ?? 0) + 1;
    this.db.seq[key] = n;
    return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  }

  // ─── permission checks (mirror RLS) ───
  assertCan(actor: Actor, table: TableName, action: 'view' | 'create' | 'edit' | 'delete' | 'approve') {
    if (action === 'view' && MASTER_TABLES.includes(table)) return;
    const mod = moduleOf(table);
    if (mod && !can(actor.role, mod as never, action)) {
      throw new BackendError('forbidden', `Your role does not allow ${action} on ${ENTITIES[table]?.plural ?? table}`);
    }
  }

  // ─── audit & notifications ───
  audit(actor: Actor, table: TableName, recordId: string, action: string, changes: Record<string, { from: unknown; to: unknown }> | null, note?: string, at?: string) {
    this.t('audit_log').push({
      id: uuid(), company_id: actor.companyId, created_at: at ?? nowIso(), updated_at: at ?? nowIso(), created_by: actor.userId,
      table_name: table, record_id: recordId, action, actor_id: actor.userId, actor_name: actor.name, changes, note: note ?? null,
    });
  }

  notify(companyId: string, n: { event_type: string; title: string; body: string; severity: AppNotification['severity']; link?: string; ref_id?: string; target_user_id?: string }, at?: string) {
    const ev = AUTOMATION_EVENTS.find((e) => e.id === n.event_type);
    const roles = ev?.roles ?? ['company_admin'];
    const id = uuid();
    this.t('notifications').push({
      id, company_id: companyId, created_at: at ?? nowIso(), updated_at: at ?? nowIso(),
      event_type: n.event_type, title: n.title, body: n.body, severity: n.severity, target_roles: roles,
      target_user_id: n.target_user_id ?? null, link: n.link ?? null, ref_id: n.ref_id ?? null, read_by: [],
    });
    // Fan out to external channels according to member preferences.
    const members = this.rows<Member>('company_members', companyId).filter((m) => m.active !== false && roles.includes(m.role));
    const prefs = this.rows('notification_preferences', companyId);
    for (const m of members) {
      const p = prefs.find((x) => x.user_id === m.user_id && x.event_type === n.event_type);
      if (!p) continue;
      const base = {
        company_id: companyId, created_at: at ?? nowIso(), updated_at: at ?? nowIso(), event_type: n.event_type,
        payload: { title: n.title, body: n.body, link: n.link ?? null, notification_id: id },
        status: 'pending', attempts: 0, next_attempt_at: at ?? nowIso(), last_error: null, provider_message_id: null,
      };
      if (p.whatsapp && m.phone) this.t('notification_outbox').push({ id: uuid(), ...base, channel: 'whatsapp', recipient: m.phone });
      if (p.email && m.email) this.t('notification_outbox').push({ id: uuid(), ...base, channel: 'email', recipient: m.email });
    }
    this.emit('notifications');
  }

  private recentlyNotified(companyId: string, event: string, refId: string, hours = 24) {
    const since = Date.now() - hours * 3_600_000;
    return this.rows<AppNotification>('notifications', companyId).some(
      (n) => n.event_type === event && n.ref_id === refId && Date.parse(n.created_at) > since,
    );
  }

  // ─── generic writes ───
  private stripServerFields(def: EntityDef | undefined, values: Record<string, unknown>) {
    const out = { ...values };
    delete out.company_id;
    delete out.created_at;
    delete out.updated_at;
    delete out.created_by;
    if (def) for (const f of def.fields) if (f.form === false) delete out[f.key];
    return out;
  }

  private applyDefaults(def: EntityDef, values: Record<string, unknown>) {
    const out = { ...values };
    for (const f of def.fields) {
      if (out[f.key] === undefined && f.default !== undefined) {
        out[f.key] = typeof f.default === 'function' ? (f.default as () => unknown)() : f.default;
      }
    }
    return out;
  }

  insert(actor: Actor, table: TableName, input: Record<string, unknown>, opts: WriteOpts = {}): BaseRow {
    const def = ENTITIES[table];
    if (!opts.trusted) {
      this.assertCan(actor, table, 'create');
      if (def?.immutable && table !== 'stock_movements' && table !== 'payments') {
        throw new BackendError('forbidden', `${def.plural} are maintained by the system`);
      }
    }
    let v = opts.trusted ? { ...input } : this.stripServerFields(def, input);
    if (def) {
      v = this.applyDefaults(def, v);
      if (def.compute) v = { ...v, ...def.compute(v) };
      if (!opts.trusted) {
        const errors = validateRecord(def, v);
        if (Object.keys(errors).length) throw new BackendError('validation', Object.values(errors)[0], errors);
      }
      if (def.statuses && def.transitions && !opts.trusted) v.status = def.initialStatus;
      else if (def.initialStatus && v.status === undefined) v.status = def.initialStatus;
      if (def.numberPrefix && !v.number) v.number = this.nextNumber(actor.companyId, def.numberPrefix, opts.at);
    }
    if (!opts.trusted) this.validateRefs(actor.companyId, def, v);
    const at = opts.at ?? nowIso();
    const id = typeof v.id === 'string' && v.id ? v.id : uuid();
    if (this.t(table).some((r) => r.id === id)) {
      throw new BackendError('conflict', 'Record already exists');
    }
    let row: BaseRow = { ...v, id, company_id: actor.companyId, created_at: at, updated_at: at, created_by: actor.userId };
    row = this.beforeInsert(actor, table, row, opts);
    this.t(table).push(row);
    if (!opts.silent) this.audit(actor, table, row.id, 'insert', null, undefined, at);
    this.afterInsert(actor, table, row, opts);
    this.emit(table);
    return row;
  }

  /** Foreign keys must point at rows of the same company (mirrors FK + RLS). */
  private validateRefs(companyId: string, def: EntityDef | undefined, v: Record<string, unknown>) {
    if (!def) return;
    for (const f of def.fields) {
      const refs: [string, unknown][] = [];
      if (f.type === 'ref' && v[f.key]) refs.push([f.ref!, v[f.key]]);
      if (f.type === 'lines' && Array.isArray(v[f.key])) {
        for (const lf of f.lineFields ?? []) if (lf.type === 'ref') for (const l of v[f.key] as LineItem[]) if (l[lf.key]) refs.push([lf.ref!, l[lf.key]]);
      }
      for (const [t, id] of refs) {
        if (!this.find(t as TableName, id, companyId)) {
          throw new BackendError('validation', `${f.label}: referenced record does not exist in this company`, { [f.key]: 'Invalid reference' });
        }
      }
    }
  }

  update(actor: Actor, table: TableName, id: string, input: Record<string, unknown>, opts: WriteOpts = {}): BaseRow {
    const def = ENTITIES[table];
    const before = this.find(table, id, actor.companyId);
    if (!before) throw new BackendError('not_found', 'Record not found');
    if (!opts.trusted) {
      this.assertCan(actor, table, 'edit');
      if (def?.immutable) throw new BackendError('forbidden', `${def.plural} cannot be edited. Post a reversing entry instead.`);
      if (def?.editableIn && !def.editableIn.includes(String(before.status))) {
        throw new BackendError('validation', `A ${def.label.toLowerCase()} in status "${String(before.status).replace(/_/g, ' ')}" can no longer be edited`);
      }
    }
    const patch = opts.trusted ? { ...input } : this.stripServerFields(def, input);
    delete patch.id;
    if (!opts.trusted && def?.transitions) delete patch.status; // status changes only via transition()
    let merged: Record<string, unknown> = { ...before, ...patch };
    if (def?.compute) merged = { ...merged, ...def.compute(merged) };
    if (def && !opts.trusted) {
      const errors = validateRecord(def, merged);
      if (Object.keys(errors).length) throw new BackendError('validation', Object.values(errors)[0], errors);
      this.validateRefs(actor.companyId, def, merged);
    }
    const after = { ...merged, updated_at: opts.at ?? nowIso() } as BaseRow;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(after)) {
      if (k === 'updated_at') continue;
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changes[k] = { from: before[k], to: after[k] };
    }
    const finalRow = this.beforeUpdate(actor, table, before, after);
    Object.assign(before, finalRow);
    if (!opts.silent && Object.keys(changes).length) this.audit(actor, table, id, 'update', changes, undefined, opts.at);
    this.emit(table);
    return before;
  }

  remove(actor: Actor, table: TableName, id: string) {
    const def = ENTITIES[table];
    const row = this.find(table, id, actor.companyId);
    if (!row) throw new BackendError('not_found', 'Record not found');
    this.assertCan(actor, table, 'delete');
    if (def?.immutable) throw new BackendError('forbidden', `${def.plural} cannot be deleted`);
    if (def?.deletableIn && !def.deletableIn.includes(String(row.status))) {
      throw new BackendError('validation', `Only records in status ${def.deletableIn.join(', ') || '(none)'} can be deleted`);
    }
    if (table === 'company_members') {
      if (row.user_id === actor.userId) throw new BackendError('forbidden', 'You cannot remove yourself');
      this.assertKeepsAdmin(actor.companyId, row, true);
    }
    const usage = this.referencesTo(actor.companyId, table, id);
    if (usage) throw new BackendError('conflict', `Cannot delete: used by ${usage}`);
    this.db.tables[table] = this.t(table).filter((r) => r !== row);
    this.audit(actor, table, id, 'delete', null, `Deleted ${String(row.number ?? row.name ?? row.code ?? id)}`);
    this.emit(table);
  }

  private referencesTo(companyId: string, table: TableName, id: string): string | null {
    for (const def of Object.values(ENTITIES)) {
      if (!def) continue;
      for (const f of def.fields) {
        const hits = this.rows(def.table, companyId).filter((r) =>
          (f.type === 'ref' && f.ref === table && r[f.key] === id) ||
          (f.type === 'lines' && Array.isArray(r[f.key]) && (f.lineFields ?? []).some((lf) => lf.ref === table && (r[f.key] as LineItem[]).some((l) => l[lf.key] === id))),
        ).length;
        if (hits) return `${hits} ${def.plural.toLowerCase()}`;
      }
    }
    if (table === 'materials' && this.rows('stock_balances', companyId).some((b) => b.material_id === id && num(b.qty) !== 0)) return 'stock on hand';
    return null;
  }

  // ─── status transitions (mirrors SQL transition_status) ───
  transition(actor: Actor, table: TableName, id: string, to: string, comment?: string, opts: WriteOpts = {}): BaseRow {
    const def = entity(table);
    const row = this.find(table, id, actor.companyId);
    if (!row) throw new BackendError('not_found', 'Record not found');
    const tr = def.transitions?.find((t) => t.to === to && t.from.includes(String(row.status)));
    if (!tr) throw new BackendError('validation', `Cannot move a ${def.label.toLowerCase()} from "${row.status}" to "${to}"`);
    if (!opts.trusted) {
      if (!can(actor.role, def.module, tr.action)) throw new BackendError('forbidden', `Your role cannot "${tr.label}" ${def.plural.toLowerCase()}`);
      if (tr.requireComment && !comment?.trim()) throw new BackendError('validation', 'A comment is required for this action');
      if (tr.action === 'approve') this.assertApprover(actor, def, row);
    }
    const from = String(row.status);
    const at = opts.at ?? nowIso();
    this.beforeTransition(actor, table, row, to, comment, at, opts);
    row.status = to;
    row.updated_at = at;
    this.audit(actor, table, id, 'transition', { status: { from, to } }, comment, at);
    this.afterTransition(actor, table, row, from, comment, at, opts);
    this.emit(table);
    return row;
  }

  private assertApprover(actor: Actor, def: EntityDef, row: BaseRow) {
    const settings = this.settings(actor.companyId);
    if (settings.maker_checker && row.created_by === actor.userId && actor.role !== 'super_admin') {
      throw new BackendError('forbidden', 'Maker-checker: you cannot approve a document you created');
    }
    if (!def.amountKey) return;
    const amount = num(row[def.amountKey]);
    const rules = this.rows('approval_rules', actor.companyId)
      .filter((r) => r.entity === def.table && r.active !== false && num(r.min_amount) <= amount)
      .sort((a, b) => num(b.min_amount) - num(a.min_amount));
    if (!rules.length) return;
    const required = rules[0].approver_role as Role;
    const allowed: Role[] = [required, 'company_admin', 'super_admin', 'ceo'];
    if (!allowed.includes(actor.role)) {
      throw new BackendError('forbidden', `Approval rule: ${def.plural.toLowerCase()} of ${amount.toLocaleString('en-IN')} or more need approval by ${required.replace(/_/g, ' ')}`);
    }
  }

  // ─── table rules ───
  private beforeInsert(actor: Actor, table: TableName, row: BaseRow, opts: WriteOpts): BaseRow {
    switch (table) {
      case 'invoices': {
        const m = this.runMatch(actor.companyId, row);
        if (m.hardDuplicate && !opts.trusted) throw new BackendError('conflict', m.exceptions[0]);
        const keep = opts.trusted && row.status && row.status !== 'received';
        return { ...row, paid_amount: num(row.paid_amount), match_status: m.match_status, exceptions: m.exceptions, duplicate_of: m.duplicate_of, status: keep ? row.status : m.match_status };
      }
      case 'company_members': {
        const email = String(row.email).trim().toLowerCase();
        if (this.rows('company_members', actor.companyId).some((m) => String(m.email).toLowerCase() === email)) {
          throw new BackendError('conflict', `${email} is already a member of this company`);
        }
        if (row.role === 'super_admin' && actor.role !== 'super_admin') throw new BackendError('forbidden', 'Only platform admins can grant Super Admin');
        let user = this.db.users.find((u) => u.email === email);
        if (!user) {
          user = { id: uuid(), email, name: String(row.full_name) };
          this.db.users.push(user);
        }
        return { ...row, email, user_id: user.id };
      }
      case 'stock_audits': {
        const sys = this.rows('stock_balances', actor.companyId)
          .filter((b) => b.material_id === row.material_id && b.warehouse_id === row.warehouse_id && (!row.batch_no || b.batch_no === row.batch_no))
          .reduce((s, b) => s + num(b.qty), 0);
        return { ...row, system_qty: round(sys, 3), variance_qty: round(num(row.counted_qty) - sys, 3) };
      }
      case 'payments': {
        const inv = this.find('invoices', row.invoice_id, actor.companyId);
        if (!inv) throw new BackendError('validation', 'Invoice not found');
        if (!['approved', 'partially_paid'].includes(String(inv.status))) throw new BackendError('validation', 'Only approved invoices can be paid');
        const outstanding = round(num(inv.total) - num(inv.paid_amount));
        if (num(row.amount) > outstanding + 0.005) throw new BackendError('validation', `Amount exceeds outstanding balance of ${outstanding}`);
        return row;
      }
      case 'production_orders':
        return { ...row, produced_qty: 0, rejected_qty: 0 };
      case 'shift_reports':
        if (this.rows('shift_reports', actor.companyId).some((r) => r.report_date === row.report_date && r.shift_id === row.shift_id && r.machine_id === row.machine_id)) {
          throw new BackendError('conflict', 'A shift report for this machine, shift and date already exists');
        }
        return row;
      default:
        return row;
    }
  }

  private afterInsert(actor: Actor, table: TableName, row: BaseRow, opts: WriteOpts) {
    const silent = !!opts.silent;
    switch (table) {
      case 'stock_movements':
        try {
          this.applyMovement(actor, row, opts);
        } catch (e) {
          this.db.tables.stock_movements = this.t('stock_movements').filter((r) => r !== row);
          throw new BackendError('validation', (e as Error).message);
        }
        break;
      case 'shift_reports':
        this.onShiftReport(actor, row, opts);
        break;
      case 'work_orders':
        if (row.wo_type === 'breakdown') {
          const m = this.find('machines', row.machine_id, actor.companyId);
          if (m) { m.status = 'breakdown'; m.updated_at = row.created_at; this.emit('machines'); }
          if (!silent) this.notify(actor.companyId, {
            event_type: 'machine_breakdown', severity: 'critical', ref_id: row.id, link: `/maintenance/work_orders?id=${row.id}`,
            title: `Breakdown: ${m?.name ?? 'machine'}`, body: `${row.number} raised by ${actor.name}: ${row.description}`,
          });
        }
        break;
      case 'purchase_requisitions':
        if (!silent && row.status === 'submitted') this.notifyPR(actor, row);
        break;
      case 'payments': {
        const inv = this.find('invoices', row.invoice_id, actor.companyId)!;
        inv.paid_amount = round(num(inv.paid_amount) + num(row.amount));
        inv.status = num(inv.paid_amount) + 0.005 >= num(inv.total) ? 'paid' : 'partially_paid';
        inv.updated_at = row.created_at;
        this.audit(actor, 'invoices', inv.id, 'update', { paid_amount: { from: round(num(inv.paid_amount) - num(row.amount)), to: inv.paid_amount } }, `Payment ${row.number}`, row.created_at);
        this.emit('invoices');
        break;
      }
    }
  }

  private assertKeepsAdmin(cid: string, member: BaseRow, removing: boolean, after?: BaseRow) {
    if (member.role !== 'company_admin') return;
    if (!removing && after?.role === 'company_admin' && after.active !== false) return;
    const others = this.rows('company_members', cid).filter((m) => m.id !== member.id && m.role === 'company_admin' && m.active !== false);
    if (!others.length) throw new BackendError('validation', 'A company must keep at least one active Company Admin');
  }

  private beforeUpdate(actor: Actor, table: TableName, before: BaseRow, after: BaseRow): BaseRow {
    if (table === 'company_members') {
      if (before.user_id === actor.userId && before.role !== after.role) throw new BackendError('forbidden', 'You cannot change your own role');
      if (after.role === 'super_admin' && actor.role !== 'super_admin') throw new BackendError('forbidden', 'Only platform admins can grant Super Admin');
      this.assertKeepsAdmin(actor.companyId, before, false, after);
      return { ...after, email: before.email, user_id: before.user_id };
    }
    if (table === 'invoices' && ['received', 'matched', 'exception'].includes(String(after.status))) {
      const m = this.runMatch(actor.companyId, after);
      if (m.hardDuplicate) throw new BackendError('conflict', m.exceptions[0]);
      return { ...after, match_status: m.match_status, exceptions: m.exceptions, duplicate_of: m.duplicate_of, status: m.match_status };
    }
    if (table === 'stock_audits') {
      return { ...after, variance_qty: round(num(after.counted_qty) - num(before.system_qty), 3), status: after.status === 'rejected' ? 'counted' : after.status };
    }
    return after;
  }

  private beforeTransition(actor: Actor, table: TableName, row: BaseRow, to: string, _comment: string | undefined, at: string, opts: WriteOpts) {
    if (table === 'work_orders' && to === 'completed') {
      const parts = (row.parts_used as LineItem[] | undefined) ?? [];
      if (parts.length && !row.parts_warehouse_id) throw new BackendError('validation', 'Select the warehouse spare parts were issued from');
      for (const p of parts) {
        this.insert(actor, 'stock_movements', {
          movement_type: 'out', material_id: p.material_id, qty: num(p.qty), warehouse_id: row.parts_warehouse_id,
          reason: 'maintenance_issue', reference: row.number, unit_cost: num(p.rate) || null, movement_date: ymd(new Date(at)),
        }, { trusted: true, at, silent: opts.silent });
      }
    }
    if (table === 'shipments' && to === 'dispatched') {
      const lines = (row.lines as LineItem[] | undefined) ?? [];
      if (lines.length && !row.from_warehouse_id) throw new BackendError('validation', 'Select the warehouse goods are dispatched from');
      for (const l of lines) {
        this.insert(actor, 'stock_movements', {
          movement_type: 'out', material_id: l.material_id, qty: num(l.qty), warehouse_id: row.from_warehouse_id,
          reason: 'sales_dispatch', reference: row.number, movement_date: ymd(new Date(at)),
        }, { trusted: true, at, silent: opts.silent });
      }
    }
    if (table === 'stock_audits' && to === 'approved' && num(row.variance_qty) !== 0) {
      this.insert(actor, 'stock_movements', {
        movement_type: 'adjust', material_id: row.material_id, qty: num(row.variance_qty), warehouse_id: row.warehouse_id,
        batch_no: row.batch_no || null, reason: 'stock_audit', reference: row.number, movement_date: ymd(new Date(at)),
      }, { trusted: true, at });
    }
  }

  private afterTransition(actor: Actor, table: TableName, row: BaseRow, _from: string, _comment: string | undefined, at: string, opts: WriteOpts) {
    const cid = actor.companyId;
    const silent = !!opts.silent;
    const link = (mod: string) => `/${mod}/${table}?id=${row.id}`;
    switch (`${table}:${row.status}`) {
      case 'grns:posted':
        this.postGrn(actor, row, at, opts);
        break;
      case 'purchase_requisitions:submitted':
        if (!silent) this.notifyPR(actor, row);
        break;
      case 'purchase_orders:pending_approval':
        if (!silent) this.notify(cid, { event_type: 'purchase_approval', severity: 'warning', ref_id: row.id, link: link('procurement'), title: `PO ${row.number} awaiting approval`, body: `${this.name('suppliers', row.supplier_id, cid)} · ₹${num(row.total).toLocaleString('en-IN')}` }, at);
        break;
      case 'purchase_orders:approved':
        if (!silent) this.notify(cid, { event_type: 'purchase_approval', severity: 'success', ref_id: row.id, link: link('procurement'), title: `PO ${row.number} approved`, body: `Approved by ${actor.name}` }, at);
        break;
      case 'quotations:pending_approval':
        if (!silent) this.notify(cid, { event_type: 'purchase_approval', severity: 'info', ref_id: row.id, link: link('sales'), title: `Quotation ${row.number} awaiting approval`, body: `₹${num(row.total).toLocaleString('en-IN')} for ${this.name('customers', row.customer_id, cid)}` }, at);
        break;
      case 'quotations:sent': {
        const rfq = this.find('rfqs', row.rfq_id, cid);
        if (rfq && ['new', 'under_review'].includes(String(rfq.status))) { rfq.status = 'quoted'; rfq.updated_at = at; this.emit('rfqs'); }
        break;
      }
      case 'invoices:pending_approval':
        if (!silent) this.notify(cid, { event_type: 'invoice_approval', severity: 'warning', ref_id: row.id, link: link('ap'), title: `Invoice ${row.invoice_no} awaiting approval`, body: `${this.name('suppliers', row.supplier_id, cid)} · ₹${num(row.total).toLocaleString('en-IN')}` }, at);
        break;
      case 'work_orders:in_progress': {
        row.started_at ??= at;
        const m = this.find('machines', row.machine_id, cid);
        if (m && row.wo_type === 'preventive' && m.status !== 'breakdown') { m.status = 'maintenance'; this.emit('machines'); }
        break;
      }
      case 'work_orders:completed': {
        row.completed_at = at;
        const m = this.find('machines', row.machine_id, cid);
        const otherOpen = this.rows('work_orders', cid).some((w) => w.id !== row.id && w.machine_id === row.machine_id && w.wo_type === 'breakdown' && ['open', 'assigned', 'in_progress', 'on_hold'].includes(String(w.status)));
        if (m && !otherOpen && ['breakdown', 'maintenance'].includes(String(m.status))) { m.status = 'running'; m.updated_at = at; this.emit('machines'); }
        const pm = this.find('pm_schedules', row.pm_schedule_id, cid);
        if (pm) {
          pm.last_done = ymd(new Date(at));
          pm.next_due = addDays(new Date(at), num(pm.frequency_days));
          this.emit('pm_schedules');
        }
        break;
      }
      case 'inspections:passed':
      case 'inspections:conditional':
      case 'inspections:failed':
        this.onInspectionDecision(actor, row, at, opts);
        break;
      case 'shipments:dispatched':
      case 'shipments:delivered':
      case 'shipments:pod_received':
        if (row.status === 'delivered' && !row.delivered_on) row.delivered_on = ymd(new Date(at));
        this.syncSalesOrderFromShipments(cid, row.sales_order_id as string | undefined, at);
        break;
      case 'shipments:delayed':
        if (!silent) this.notify(cid, { event_type: 'shipment_delay', severity: 'warning', ref_id: row.id, link: link('logistics'), title: `Shipment ${row.number} delayed`, body: `${this.name('customers', row.customer_id, cid)} · ${row.destination} · ETA ${row.eta}` }, at);
        break;
    }
  }

  name(table: TableName, id: unknown, companyId: string): string {
    const r = this.find(table, id, companyId);
    return r ? String(r.name ?? r.number ?? r.code ?? '') : '—';
  }

  private notifyPR(actor: Actor, row: BaseRow) {
    this.notify(actor.companyId, {
      event_type: 'purchase_requisition', severity: row.priority === 'urgent' ? 'warning' : 'info', ref_id: row.id,
      link: `/procurement/purchase_requisitions?id=${row.id}`,
      title: `Requisition ${row.number} submitted`,
      body: `${this.name('materials', row.material_id, actor.companyId)} × ${row.qty} by ${actor.name}`,
    }, String(row.created_at));
  }

  // ─── stock ───
  private applyMovement(actor: Actor, mv: BaseRow, opts: WriteOpts) {
    const cid = actor.companyId;
    const qty = num(mv.qty);
    const material = mv.material_id as string;
    const batch = (mv.batch_no as string) || '';
    const at = String(mv.created_at);
    const add = (warehouse: unknown, bin: unknown, b: string, q: number) => {
      const slot = this.rows('stock_balances', cid).find((s) => s.material_id === material && s.warehouse_id === warehouse && (s.bin_id ?? null) === (bin ?? null) && s.batch_no === b);
      if (slot) { slot.qty = round(num(slot.qty) + q, 3); slot.updated_at = at; }
      else this.t('stock_balances').push({ id: uuid(), company_id: cid, created_at: at, updated_at: at, material_id: material, warehouse_id: warehouse, bin_id: bin ?? null, batch_no: b, qty: round(q, 3) });
    };
    const take = (warehouse: unknown, q: number) => {
      const slots = this.rows('stock_balances', cid)
        .filter((s) => s.material_id === material && s.warehouse_id === warehouse && (!mv.bin_id || s.bin_id === mv.bin_id))
        .map((s) => ({ id: s.id, batch_no: String(s.batch_no), bin_id: s.bin_id as string | null, qty: num(s.qty), created_at: s.created_at }));
      const plan = planConsumption(slots, q, batch || null);
      const taken: { batch: string; qty: number }[] = [];
      for (const p of plan) {
        const s = this.t('stock_balances').find((x) => x.id === p.id)!;
        s.qty = round(num(s.qty) - p.take, 3);
        s.updated_at = at;
        taken.push({ batch: String(s.batch_no), qty: p.take });
      }
      return taken;
    };
    switch (mv.movement_type) {
      case 'in': add(mv.warehouse_id, mv.bin_id, batch, qty); break;
      case 'out': take(mv.warehouse_id, qty); break;
      case 'transfer': for (const t of take(mv.warehouse_id, qty)) add(mv.to_warehouse_id, null, t.batch, t.qty); break;
      case 'adjust': if (qty >= 0) add(mv.warehouse_id, mv.bin_id, batch, qty); else take(mv.warehouse_id, -qty); break;
      default: throw new Error('Unknown movement type');
    }
    this.db.tables.stock_balances = this.t('stock_balances').filter((s) => Math.abs(num(s.qty)) > 1e-9);
    this.emit('stock_balances');
    if (!opts.silent && ['out', 'transfer', 'adjust'].includes(String(mv.movement_type))) this.checkLowStock(cid, material, at);
  }

  checkLowStock(cid: string, materialId: string, at?: string) {
    if (!this.settings(cid).low_stock_alerts) return;
    const m = this.find<Material>('materials', materialId, cid);
    if (!m || !m.reorder_level) return;
    const onHand = this.rows('stock_balances', cid).filter((b) => b.material_id === materialId).reduce((s, b) => s + num(b.qty), 0);
    if (onHand >= m.reorder_level || this.recentlyNotified(cid, 'low_stock', materialId)) return;
    this.notify(cid, {
      event_type: 'low_stock', severity: onHand < m.min_stock ? 'critical' : 'warning', ref_id: materialId,
      link: `/inventory/reorder`, title: `Low stock: ${m.name}`,
      body: `On hand ${round(onHand, 2)} ${m.uom} is below reorder level ${m.reorder_level} ${m.uom}. Suggested reorder ${m.reorder_qty} ${m.uom}.`,
    }, at);
  }

  private postGrn(actor: Actor, grn: BaseRow, at: string, opts: WriteOpts) {
    const cid = actor.companyId;
    const po = this.find('purchase_orders', grn.po_id, cid);
    if (!po) throw new BackendError('validation', 'GRN must reference a purchase order');
    if (!['approved', 'sent', 'partially_received'].includes(String(po.status))) throw new BackendError('validation', `PO ${po.number} is ${po.status}; goods cannot be received against it`);
    const lines = (grn.lines as LineItem[]) ?? [];
    for (const l of lines) {
      const accepted = num(l.qty) - num(l.rejected_qty);
      const poLine = (po.lines as LineItem[]).find((p) => p.material_id === l.material_id);
      if (!poLine) throw new BackendError('validation', `${this.name('materials', l.material_id, cid)} is not on ${po.number}`);
      if (accepted > 0) {
        this.insert(actor, 'stock_movements', {
          movement_type: 'in', material_id: l.material_id, qty: accepted, warehouse_id: grn.warehouse_id, batch_no: l.batch_no || grn.number,
          reason: 'purchase_receipt', reference: grn.number, unit_cost: num(l.rate) || poLine.rate, movement_date: String(grn.received_date ?? ymd(new Date(at))),
        }, { trusted: true, at, silent: true });
      }
      poLine.received_qty = round(num(poLine.received_qty) + accepted, 3);
      this.insert(actor, 'inspections', {
        stage: 'incoming', inspection_date: String(grn.received_date ?? ymd(new Date(at))), material_id: l.material_id, supplier_id: grn.supplier_id,
        grn_id: grn.id, batch_no: l.batch_no || grn.number, lot_qty: num(l.qty), accepted_qty: 0, rejected_qty: num(l.rejected_qty),
        findings: num(l.rejected_qty) ? `${l.rejected_qty} rejected at receipt` : null,
      }, { trusted: true, at, silent: opts.silent });
    }
    const all = (po.lines as LineItem[]).every((p) => num(p.received_qty) + 1e-9 >= num(p.qty));
    po.status = all ? 'received' : 'partially_received';
    po.updated_at = at;
    this.audit(actor, 'purchase_orders', po.id, 'transition', { status: { from: 'sent', to: po.status } }, `Via ${grn.number}`, at);
    this.emit('purchase_orders');
    // Rematch open invoices waiting on this PO's GRN.
    for (const inv of this.rows('invoices', cid).filter((i) => i.po_id === po.id && ['received', 'matched', 'exception'].includes(String(i.status)))) {
      const m = this.runMatch(cid, inv);
      Object.assign(inv, { match_status: m.match_status, exceptions: m.exceptions, status: m.match_status, grn_id: inv.grn_id ?? grn.id });
    }
    this.emit('invoices');
  }

  runMatch(cid: string, inv: BaseRow) {
    const po = inv.po_id ? this.find('purchase_orders', inv.po_id, cid) : null;
    const grns = po ? this.rows('grns', cid).filter((g) => g.po_id === po.id && g.status === 'posted') : [];
    const others = this.rows('invoices', cid).filter((o) => o.id !== inv.id && o.supplier_id === inv.supplier_id && o.status !== 'rejected');
    const billedElsewhere: Record<string, number> = {};
    for (const o of others.filter((o) => po && o.po_id === po.id)) for (const l of (o.lines as LineItem[]) ?? []) billedElsewhere[l.material_id] = (billedElsewhere[l.material_id] ?? 0) + num(l.qty);
    return matchInvoice({
      invoice: { id: inv.id, supplier_id: String(inv.supplier_id), invoice_no: String(inv.invoice_no), invoice_date: String(inv.invoice_date), total: num(inv.total), lines: (inv.lines as LineItem[]) ?? [], po_id: inv.po_id as string | null },
      po: po ? { id: po.id, supplier_id: String(po.supplier_id), lines: po.lines as LineItem[], status: String(po.status) } : null,
      grns: grns.map((g) => ({ lines: g.lines as LineItem[] })),
      otherInvoices: others.map((o) => ({ id: o.id, number: String(o.number), invoice_no: String(o.invoice_no), invoice_date: String(o.invoice_date), total: num(o.total) })),
      billedElsewhere,
      settings: this.settings(cid),
    });
  }

  // ─── production ───
  private onShiftReport(actor: Actor, r: BaseRow, opts: WriteOpts) {
    const cid = actor.companyId;
    const settings = this.settings(cid);
    const good = num(r.actual_qty) - num(r.rejected_qty);
    const order = this.find('production_orders', r.production_order_id, cid);
    if (order) {
      order.produced_qty = round(num(order.produced_qty) + good, 3);
      order.rejected_qty = round(num(order.rejected_qty) + num(r.rejected_qty), 3);
      if (order.status === 'released') order.status = 'in_progress';
      order.updated_at = String(r.created_at);
      if (!r.product_id) r.product_id = order.product_id;
      if (order.output_warehouse_id && good > 0) {
        this.insert(actor, 'stock_movements', {
          movement_type: 'in', material_id: order.product_id, qty: good, warehouse_id: order.output_warehouse_id, batch_no: String(order.number),
          reason: 'production_output', reference: String(r.number), movement_date: String(r.report_date),
        }, { trusted: true, at: String(r.created_at), silent: true });
      }
      this.emit('production_orders');
    }
    if (opts.silent) return;
    const machine = this.find('machines', r.machine_id, cid);
    const mName = machine?.name ?? 'Machine';
    const shift = this.name('shifts', r.shift_id, cid);
    const pctTarget = num(r.target_qty) > 0 ? (num(r.actual_qty) / num(r.target_qty)) * 100 : 100;
    const rejPct = num(r.actual_qty) > 0 ? (num(r.rejected_qty) / num(r.actual_qty)) * 100 : 0;
    const oee = computeOee([{ planned_minutes: num(r.planned_minutes), downtime_minutes: num(r.downtime_minutes), actual_qty: num(r.actual_qty), rejected_qty: num(r.rejected_qty), ideal_cycle_time_sec: num(machine?.ideal_cycle_time_sec) }]);
    const link = `/production/shift_reports?id=${r.id}`;
    this.notify(cid, {
      event_type: 'shift_update', severity: 'info', ref_id: r.id, link,
      title: `${shift} report · ${mName}`,
      body: `Output ${r.actual_qty}/${r.target_qty} (${pctTarget.toFixed(0)}%), rejected ${r.rejected_qty}, downtime ${r.downtime_minutes} min${oee ? `, OEE ${(oee.oee * 100).toFixed(1)}%` : ''}. By ${actor.name}.`,
    }, String(r.created_at));
    if (pctTarget < settings.below_target_alert_pct) {
      this.notify(cid, { event_type: 'below_target', severity: 'warning', ref_id: r.id, link, title: `Below target: ${mName} (${shift})`, body: `${r.actual_qty} of ${r.target_qty} (${pctTarget.toFixed(0)}%). Downtime ${r.downtime_minutes} min — ${String(r.downtime_reason ?? 'n/a').replace(/_/g, ' ')}.` }, String(r.created_at));
    }
    if (rejPct > settings.rejection_alert_pct) {
      this.notify(cid, { event_type: 'high_rejection', severity: 'critical', ref_id: r.id, link, title: `High rejection: ${mName} ${rejPct.toFixed(1)}%`, body: `${r.rejected_qty} of ${r.actual_qty} rejected in ${shift}. Threshold ${settings.rejection_alert_pct}%.` }, String(r.created_at));
    }
  }

  // ─── quality ───
  private onInspectionDecision(actor: Actor, ins: BaseRow, at: string, opts: WriteOpts) {
    const cid = actor.companyId;
    const lot = num(ins.lot_qty);
    if (ins.status === 'passed' && !num(ins.accepted_qty)) ins.accepted_qty = lot - num(ins.rejected_qty);
    if (ins.status === 'failed' && !num(ins.rejected_qty)) ins.rejected_qty = lot - num(ins.accepted_qty);
    if (ins.status === 'conditional' && !num(ins.accepted_qty)) ins.accepted_qty = lot - num(ins.rejected_qty);
    const rej = num(ins.rejected_qty);
    if (ins.status === 'failed' || rej > 0) {
      const sev = this.find('defect_codes', ins.defect_code_id, cid)?.severity ?? (ins.status === 'failed' ? 'major' : 'minor');
      this.insert(actor, 'ncrs', {
        inspection_id: ins.id, material_id: ins.material_id, supplier_id: ins.supplier_id ?? null, qty_affected: rej || lot,
        severity: sev, disposition: 'pending',
        description: `Raised from ${ins.number} (${String(ins.stage).replace('_', '-')}): ${ins.findings ?? (ins.status === 'failed' ? 'inspection failed' : 'rejections recorded')}`,
      }, { trusted: true, at, silent: opts.silent });
    }
    const pct = lot > 0 ? (rej / lot) * 100 : 0;
    if (!opts.silent && pct > this.settings(cid).rejection_alert_pct) {
      this.notify(cid, {
        event_type: 'high_rejection', severity: 'critical', ref_id: ins.id, link: `/quality/inspections?id=${ins.id}`,
        title: `Inspection ${ins.number}: ${pct.toFixed(1)}% rejected`,
        body: `${this.name('materials', ins.material_id, cid)} · batch ${ins.batch_no ?? '—'} · ${String(ins.status)}`,
      }, at);
    }
  }

  private syncSalesOrderFromShipments(cid: string, soId: string | undefined, at: string) {
    const so = soId ? this.find('sales_orders', soId, cid) : undefined;
    if (!so) return;
    const ships = this.rows('shipments', cid).filter((s) => s.sales_order_id === so.id && s.status !== 'cancelled');
    if (ships.length && ships.every((s) => ['delivered', 'pod_received'].includes(String(s.status)))) so.status = 'delivered';
    else if (ships.some((s) => ['dispatched', 'in_transit', 'delayed', 'delivered', 'pod_received'].includes(String(s.status)))) so.status = 'dispatched';
    so.updated_at = at;
    this.emit('sales_orders');
  }

  // ─── RPCs (mirror SQL functions) ───
  rpc(actor: Actor, name: string, args: Record<string, unknown>): unknown {
    const cid = actor.companyId;
    switch (name) {
      case 'transition_status':
        return this.transition(actor, args.p_table as TableName, String(args.p_id), String(args.p_to), args.p_comment as string | undefined);
      case 'convert_quotation': {
        this.assertCan(actor, 'sales_orders', 'create');
        const q = this.find('quotations', args.p_quotation_id, cid);
        if (!q) throw new BackendError('not_found', 'Quotation not found');
        if (q.status !== 'accepted') throw new BackendError('validation', 'Only customer-accepted quotations can be converted');
        const so = this.insert(actor, 'sales_orders', {
          customer_id: q.customer_id, quotation_id: q.id, order_date: todayStr(),
          delivery_date: String(args.p_delivery_date ?? addDays(new Date(), 21)),
          lines: q.lines, tax_pct: q.tax_pct, customer_po: args.p_customer_po ?? null,
        });
        q.status = 'converted';
        this.audit(actor, 'quotations', q.id, 'transition', { status: { from: 'accepted', to: 'converted' } }, `Converted to ${so.number}`);
        const rfq = this.find('rfqs', q.rfq_id, cid);
        if (rfq) rfq.status = 'won';
        this.emit('quotations');
        return so;
      }
      case 'create_po_from_requisition': {
        this.assertCan(actor, 'purchase_orders', 'create');
        const pr = this.find('purchase_requisitions', args.p_requisition_id, cid);
        if (!pr) throw new BackendError('not_found', 'Requisition not found');
        if (pr.status !== 'approved') throw new BackendError('validation', 'Requisition must be approved before raising a PO');
        const sq = args.p_supplier_quotation_id ? this.find('supplier_quotations', args.p_supplier_quotation_id, cid) : undefined;
        const supplier = sq?.supplier_id ?? args.p_supplier_id;
        if (!supplier) throw new BackendError('validation', 'Choose a supplier or supplier quotation');
        const wh = args.p_warehouse_id ?? this.rows('warehouses', cid).find((w) => w.kind === 'raw_material')?.id ?? this.rows('warehouses', cid)[0]?.id;
        const rate = num(sq?.rate ?? args.p_rate ?? pr.estimated_rate);
        const lead = num(sq?.lead_time_days ?? this.find<Material>('materials', pr.material_id, cid)?.lead_time_days ?? 7);
        const po = this.insert(actor, 'purchase_orders', {
          supplier_id: supplier, requisition_id: pr.id, po_date: todayStr(),
          expected_date: addDays(new Date(), lead), delivery_warehouse_id: wh,
          lines: [{ material_id: pr.material_id, qty: num(pr.qty), rate, received_qty: 0 }], tax_pct: 18,
        });
        if (sq) for (const o of this.rows('supplier_quotations', cid).filter((x) => x.requisition_id === pr.id)) o.status = o.id === sq.id ? 'selected' : 'not_selected';
        pr.status = 'ordered';
        this.audit(actor, 'purchase_requisitions', pr.id, 'transition', { status: { from: 'approved', to: 'ordered' } }, `PO ${po.number}`);
        this.emit('purchase_requisitions');
        this.emit('supplier_quotations');
        return po;
      }
      case 'create_production_orders_from_so': {
        this.assertCan(actor, 'production_orders', 'create');
        const so = this.find('sales_orders', args.p_sales_order_id, cid);
        if (!so) throw new BackendError('not_found', 'Sales order not found');
        if (so.status !== 'confirmed') throw new BackendError('validation', 'Only confirmed orders can be released to production');
        const line = args.p_line_id ?? this.rows('production_lines', cid)[0]?.id;
        const fg = this.rows('warehouses', cid).find((w) => w.kind === 'finished_goods')?.id ?? null;
        const created = (so.lines as LineItem[]).map((l) => this.insert(actor, 'production_orders', {
          product_id: l.material_id, sales_order_id: so.id, line_id: line, planned_qty: num(l.qty),
          planned_start: todayStr(), planned_end: String(so.delivery_date), output_warehouse_id: fg, priority: 'normal',
        }));
        this.transitionTrusted(actor, 'sales_orders', so, 'in_production');
        return created;
      }
      case 'create_shipment_from_so': {
        this.assertCan(actor, 'shipments', 'create');
        const so = this.find('sales_orders', args.p_sales_order_id, cid);
        if (!so) throw new BackendError('not_found', 'Sales order not found');
        if (!['ready_to_dispatch', 'in_production', 'confirmed'].includes(String(so.status))) throw new BackendError('validation', `Order is ${so.status}`);
        const cust = this.find('customers', so.customer_id, cid);
        const fg = this.rows('warehouses', cid).find((w) => w.kind === 'finished_goods')?.id ?? null;
        return this.insert(actor, 'shipments', {
          sales_order_id: so.id, customer_id: so.customer_id, destination: String(cust?.city ?? ''), dispatch_date: todayStr(),
          eta: addDays(new Date(), 3), from_warehouse_id: fg,
          lines: (so.lines as LineItem[]).map((l) => ({ material_id: l.material_id, qty: l.qty, rate: l.rate })),
        });
      }
      case 'mark_notifications_read': {
        const ids = args.p_ids as string[] | null;
        for (const n of this.rows<AppNotification>('notifications', cid)) {
          if ((ids === null || ids.includes(n.id)) && !n.read_by.includes(actor.userId)) n.read_by.push(actor.userId);
        }
        this.emit('notifications');
        return null;
      }
      case 'set_notification_preference': {
        const existing = this.rows('notification_preferences', cid).find((p) => p.user_id === actor.userId && p.event_type === args.p_event_type);
        const vals = { in_app: true, email: !!args.p_email, whatsapp: !!args.p_whatsapp };
        if (existing) Object.assign(existing, vals, { updated_at: nowIso() });
        else this.t('notification_preferences').push({ id: uuid(), company_id: cid, created_at: nowIso(), updated_at: nowIso(), user_id: actor.userId, event_type: args.p_event_type, ...vals });
        this.emit('notification_preferences');
        return null;
      }
      case 'process_outbox':
        this.assertCan(actor, 'notification_outbox', 'edit');
        return this.processOutbox(cid);
      case 'retry_outbox': {
        this.assertCan(actor, 'notification_outbox', 'edit');
        const m = this.find('notification_outbox', args.p_id, cid);
        if (!m) throw new BackendError('not_found', 'Message not found');
        Object.assign(m, { status: 'pending', attempts: 0, next_attempt_at: nowIso(), last_error: null });
        this.audit(actor, 'notification_outbox', m.id, 'update', { status: { from: 'dead', to: 'pending' } }, 'Manual retry');
        this.emit('notification_outbox');
        return m;
      }
      case 'run_scheduled_jobs':
        this.assertCan(actor, 'notification_outbox', 'edit');
        return this.runScheduledJobs(actor);
      default:
        throw new BackendError('not_found', `Unknown operation ${name}`);
    }
  }

  private transitionTrusted(actor: Actor, table: TableName, row: BaseRow, to: string) {
    const from = row.status;
    row.status = to;
    row.updated_at = nowIso();
    this.audit(actor, table, row.id, 'transition', { status: { from, to } });
    this.emit(table);
  }

  /**
   * Demo mode has no WhatsApp / email provider, so every attempt fails honestly
   * and the retry/backoff/dead-letter path is exercised exactly as in production.
   */
  private processOutbox(cid: string) {
    const now = Date.now();
    let attempted = 0;
    for (const m of this.rows('notification_outbox', cid)) {
      if (!['pending', 'failed'].includes(String(m.status)) || Date.parse(String(m.next_attempt_at)) > now) continue;
      attempted++;
      m.attempts = num(m.attempts) + 1;
      m.last_error = `${m.channel === 'whatsapp' ? 'WhatsApp Cloud API' : 'Email provider'} not configured (demo mode)`;
      m.status = num(m.attempts) >= MAX_ATTEMPTS ? 'dead' : 'failed';
      m.next_attempt_at = new Date(now + nextAttemptDelayMs(num(m.attempts))).toISOString();
      m.updated_at = new Date(now).toISOString();
    }
    this.emit('notification_outbox');
    return { attempted, delivered: 0 };
  }

  private runScheduledJobs(actor: Actor) {
    const cid = actor.companyId;
    const days = this.settings(cid).pm_reminder_days;
    const horizon = addDays(new Date(), days);
    let reminders = 0;
    for (const pm of this.rows('pm_schedules', cid).filter((p) => p.active !== false && String(p.next_due) <= horizon)) {
      if (this.recentlyNotified(cid, 'pm_reminder', pm.id, 20)) continue;
      const overdue = String(pm.next_due) < todayStr();
      this.notify(cid, {
        event_type: 'pm_reminder', severity: overdue ? 'warning' : 'info', ref_id: pm.id, link: `/maintenance/pm_schedules?id=${pm.id}`,
        title: `${overdue ? 'Overdue' : 'Due soon'}: ${pm.task}`, body: `${this.name('machines', pm.machine_id, cid)} · due ${pm.next_due}`,
      });
      reminders++;
      const open = this.rows('work_orders', cid).some((w) => w.pm_schedule_id === pm.id && !['completed', 'closed', 'cancelled'].includes(String(w.status)));
      if (!open) {
        this.insert(actor, 'work_orders', {
          machine_id: pm.machine_id, wo_type: 'preventive', priority: overdue ? 'high' : 'medium', description: String(pm.task),
          assigned_to: pm.technician_id ?? null, due_date: pm.next_due, pm_schedule_id: pm.id,
        }, { trusted: true });
      }
    }
    const y = daysAgo(1);
    const rep = this.rows('shift_reports', cid).filter((r) => r.report_date === y);
    const out = rep.reduce((s, r) => s + num(r.actual_qty) - num(r.rejected_qty), 0);
    const tgt = rep.reduce((s, r) => s + num(r.target_qty), 0);
    const rej = rep.reduce((s, r) => s + num(r.rejected_qty), 0);
    const tot = rep.reduce((s, r) => s + num(r.actual_qty), 0);
    this.notify(cid, {
      event_type: 'daily_digest', severity: 'info', link: '/overview',
      title: `Daily digest · ${y}`,
      body: rep.length
        ? `Good output ${out.toLocaleString('en-IN')} vs target ${tgt.toLocaleString('en-IN')} (${tgt ? ((out / tgt) * 100).toFixed(0) : 0}%). Rejection ${tot ? ((rej / tot) * 100).toFixed(1) : 0}%. ${rep.length} shift reports.`
        : 'No shift reports were submitted yesterday.',
    });
    return { reminders, digest: true };
  }
}

export function freshMemberRow(companyId: string, user: DemoUser, role: Role, extra: Partial<Member> = {}): BaseRow {
  return {
    id: uuid(), company_id: companyId, created_at: nowIso(), updated_at: nowIso(),
    user_id: user.id, email: user.email, full_name: user.name, role, active: true, ...extra,
  };
}