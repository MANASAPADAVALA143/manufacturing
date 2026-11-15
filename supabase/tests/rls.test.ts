import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createUser, freshDb, type Db } from './db';

const U = {
  alphaAdmin: '00000000-0000-4000-8000-00000000a001',
  alphaStore: '00000000-0000-4000-8000-00000000a002',
  alphaBuyer: '00000000-0000-4000-8000-00000000a003',
  alphaCeo: '00000000-0000-4000-8000-00000000a004',
  betaAdmin: '00000000-0000-4000-8000-00000000b001',
};

let db: Db;
let A: string; // Alpha company id
let B: string; // Beta company id
const ids: Record<string, string> = {};

type Row = Record<string, unknown>;
const one = async (sql: string, params: unknown[] = []) => (await db.query<Row>(sql, params)).rows[0];
const all = async (sql: string, params: unknown[] = []) => (await db.query<Row>(sql, params)).rows;
const fails = async (fn: () => Promise<unknown>, re: RegExp) => {
  await expect(fn()).rejects.toThrow(re);
};

beforeAll(async () => {
  db = await freshDb();
  await createUser(db, U.alphaAdmin, 'admin@alpha.test');
  await createUser(db, U.betaAdmin, 'admin@beta.test');
  A = String((await asUser(db, U.alphaAdmin, () => one(`select (register_company('Alpha Industries', null, 'Pune', '#123456', 'Alpha Plant 1', 'Asha')) ->> 'id' as id`))).id);
  B = String((await asUser(db, U.betaAdmin, () => one(`select (register_company('Beta Works', null, 'Chennai', '#654321', 'Beta Plant', 'Bala')) ->> 'id' as id`))).id);

  await asUser(db, U.alphaAdmin, async () => {
    ids.wh = String((await one(`select id from warehouses where company_id = $1`, [A])).id);
    ids.factory = String((await one(`select id from factories where company_id = $1`, [A])).id);
    ids.supplier = String((await one(`insert into suppliers (company_id, code, name, gstin, email) values ($1, 'S1', 'Steel Co', '27AATCS0447N1ZS', 'a@steel.test') returning id`, [A])).id);
    ids.material = String((await one(`insert into materials (company_id, code, name, type, uom, reorder_level, reorder_qty, min_stock, standard_cost, preferred_supplier_id) values ($1, 'RM1', 'Steel coil', 'raw', 'KG', 100, 500, 50, 60, $2) returning id`, [A, ids.supplier])).id);
    for (const [email, role] of [['store@alpha.test', 'store_keeper'], ['buyer@alpha.test', 'purchase_manager'], ['ceo@alpha.test', 'ceo']]) {
      await one(`insert into company_members (company_id, email, full_name, role) values ($1, $2, $3, $4)`, [A, email, email.split('@')[0], role]);
    }
  });
  // Invited users sign up afterwards; memberships link by email.
  await createUser(db, U.alphaStore, 'store@alpha.test');
  await createUser(db, U.alphaBuyer, 'buyer@alpha.test');
  await createUser(db, U.alphaCeo, 'ceo@alpha.test');
});

describe('company isolation (RLS)', () => {
  it('a company cannot read another company’s rows', async () => {
    const rows = await asUser(db, U.betaAdmin, () => all(`select id from materials`));
    expect(rows).toHaveLength(0);
    const suppliers = await asUser(db, U.betaAdmin, () => all(`select id from suppliers where id = $1`, [ids.supplier]));
    expect(suppliers).toHaveLength(0);
    const companies = await asUser(db, U.betaAdmin, () => all(`select id from companies`));
    expect(companies.map((c) => c.id)).toEqual([B]);
  });

  it('a company cannot insert rows into another company', async () => {
    await fails(() => asUser(db, U.betaAdmin, () => one(`insert into materials (company_id, code, name, type, uom) values ($1, 'X', 'Hack', 'raw', 'KG')`, [A])), /row-level security/);
  });

  it('updates and deletes against another company affect nothing', async () => {
    const upd = await asUser(db, U.betaAdmin, () => db.query(`update materials set name = 'pwned' where id = $1`, [ids.material]));
    expect(upd.affectedRows).toBe(0);
    const del = await asUser(db, U.betaAdmin, () => db.query(`delete from suppliers where id = $1`, [ids.supplier]));
    expect(del.affectedRows).toBe(0);
    expect((await one(`select name from materials where id = $1`, [ids.material])).name).toBe('Steel coil');
  });

  it('records cannot reference another company’s records (composite FKs)', async () => {
    const betaWh = String((await asUser(db, U.betaAdmin, () => one(`select id from warehouses where company_id = $1`, [B]))).id);
    await fails(() => asUser(db, U.alphaAdmin, () => one(
      `insert into purchase_orders (company_id, supplier_id, expected_date, delivery_warehouse_id, lines) values ($1, $2, current_date + 5, $3, '[]')`, [A, ids.supplier, betaWh])), /foreign key/);
  });

  it('RPCs refuse other companies', async () => {
    await fails(() => asUser(db, U.betaAdmin, () => one(`select transition_status($1, 'purchase_requisitions', gen_random_uuid(), 'approved')`, [A])), /not a member/);
    await fails(() => asUser(db, U.betaAdmin, () => one(`select mark_notifications_read($1, null)`, [A])), /Not a member/);
  });

  it('notifications and audit log are tenant-scoped', async () => {
    const n = await asUser(db, U.betaAdmin, () => all(`select company_id from notifications union all select company_id from audit_log`));
    expect(n.every((r) => r.company_id === B)).toBe(true);
  });

  it('storage paths are checked against company membership', async () => {
    const own = await asUser(db, U.alphaAdmin, () => one(`select app.storage_can($1, 'view') as ok`, [`${A}/invoices/${ids.material}/x.pdf`]));
    const other = await asUser(db, U.betaAdmin, () => one(`select app.storage_can($1, 'view') as ok`, [`${A}/invoices/${ids.material}/x.pdf`]));
    expect(own.ok).toBe(true);
    expect(other.ok).toBe(false);
  });
});

describe('role-based access', () => {
  it('invited users are linked to their membership on sign-up', async () => {
    const m = await one(`select user_id, role from company_members where email = 'store@alpha.test'`);
    expect(m).toMatchObject({ user_id: U.alphaStore, role: 'store_keeper' });
  });

  it('a store keeper cannot raise purchase orders or read invoices', async () => {
    await fails(() => asUser(db, U.alphaStore, () => one(
      `insert into purchase_orders (company_id, supplier_id, expected_date, delivery_warehouse_id, lines) values ($1, $2, current_date + 5, $3, '[]')`, [A, ids.supplier, ids.wh])), /row-level security/);
    const inv = await asUser(db, U.alphaStore, () => all(`select id from invoices`));
    expect(inv).toHaveLength(0);
  });

  it('a store keeper can read masters and post stock', async () => {
    const mats = await asUser(db, U.alphaStore, () => all(`select id from materials`));
    expect(mats).toHaveLength(1);
    await asUser(db, U.alphaStore, () => one(
      `insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, reason, batch_no) values ($1, 'in', $2, 1000, $3, 'opening_balance', 'B1')`, [A, ids.material, ids.wh]));
    expect(Number((await one(`select sum(qty) as q from stock_balances where material_id = $1`, [ids.material])).q)).toBe(1000);
  });

  it('only admins can grant roles; nobody can escalate to super admin', async () => {
    const r = await asUser(db, U.alphaStore, () => db.query(`update company_members set role = 'company_admin' where user_id = $1`, [U.alphaStore]));
    expect(r.affectedRows).toBe(0);
    expect((await one(`select role from company_members where user_id = $1`, [U.alphaStore])).role).toBe('store_keeper');
    await fails(() => asUser(db, U.alphaAdmin, () => one(`insert into company_members (company_id, email, full_name, role) values ($1, 'x@alpha.test', 'X', 'super_admin')`, [A])), /Super Admin/);
  });

  it('the last company admin cannot be removed or demoted', async () => {
    await fails(() => asUser(db, U.alphaAdmin, () => one(`update company_members set role = 'ceo' where user_id = $1`, [U.alphaAdmin])), /own role/);
  });
});

describe('server-side business rules', () => {
  it('stock cannot go negative', async () => {
    await fails(() => asUser(db, U.alphaStore, () => one(
      `insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, reason) values ($1, 'out', $2, 5000, $3, 'production_issue')`, [A, ids.material, ids.wh])), /Insufficient stock/);
    expect(Number((await one(`select sum(qty) as q from stock_balances where material_id = $1`, [ids.material])).q)).toBe(1000);
  });

  it('stock movements are immutable and append-only', async () => {
    const r = await asUser(db, U.alphaAdmin, () => db.query(`update stock_movements set qty = 1 where company_id = $1`, [A]));
    expect(r.affectedRows).toBe(0);
  });

  it('low stock triggers a notification and an outbox message per preference', async () => {
    await asUser(db, U.alphaBuyer, () => one(`select set_notification_preference($1, 'low_stock', true, false)`, [A]));
    await asUser(db, U.alphaStore, () => one(
      `insert into stock_movements (company_id, movement_type, material_id, qty, warehouse_id, reason) values ($1, 'out', $2, 950, $3, 'production_issue')`, [A, ids.material, ids.wh]));
    const n = await asUser(db, U.alphaBuyer, () => all(`select title from notifications where event_type = 'low_stock'`));
    expect(n[0]?.title).toMatch(/Low stock: Steel coil/);
    const ob = await one(`select channel, recipient, status from notification_outbox where company_id = $1 and event_type = 'low_stock'`, [A]);
    expect(ob).toMatchObject({ channel: 'email', recipient: 'buyer@alpha.test', status: 'pending' });
  });

  it('server-managed fields and initial status cannot be forged by clients', async () => {
    const po = await asUser(db, U.alphaBuyer, () => one(
      `insert into purchase_orders (company_id, supplier_id, expected_date, delivery_warehouse_id, lines, status, total, number)
       values ($1, $2, current_date + 7, $3, $4, 'approved', 1, 'FAKE-1') returning id, status, total, number`,
      [A, ids.supplier, ids.wh, JSON.stringify([{ material_id: ids.material, qty: 500, rate: 60 }])]));
    expect(po.status).toBe('draft');
    expect(Number(po.total)).toBe(35400);
    expect(String(po.number)).toMatch(/^PO-\d{4}-0001$/);
    ids.po = String(po.id);
    await fails(() => asUser(db, U.alphaBuyer, () => one(`update purchase_orders set status = 'approved' where id = $1`, [ids.po])), /transition_status/);
  });

  it('enforces maker-checker and amount-based approval rules', async () => {
    await asUser(db, U.alphaBuyer, () => one(`select transition_status($1, 'purchase_orders', $2, 'pending_approval')`, [A, ids.po]));
    await fails(() => asUser(db, U.alphaBuyer, () => one(`select transition_status($1, 'purchase_orders', $2, 'approved')`, [A, ids.po])), /Maker-checker/);
    await asUser(db, U.alphaAdmin, () => one(`insert into approval_rules (company_id, entity, min_amount, approver_role) values ($1, 'purchase_orders', 10000, 'ceo')`, [A]));
    // Store keeper has no procurement approve permission at all.
    await fails(() => asUser(db, U.alphaStore, () => one(`select transition_status($1, 'purchase_orders', $2, 'approved')`, [A, ids.po])), /cannot perform/);
    const ok = await asUser(db, U.alphaCeo, () => one(`select transition_status($1, 'purchase_orders', $2, 'approved') ->> 'status' as s`, [A, ids.po]));
    expect(ok.s).toBe('approved');
    const audit = await one(`select actor_name, changes from audit_log where record_id = $1 and action = 'transition' order by created_at desc limit 1`, [ids.po]);
    expect(audit.changes).toEqual({ status: { from: 'pending_approval', to: 'approved' } });
  });

  it('rejects invalid transitions and requires comments where configured', async () => {
    await fails(() => asUser(db, U.alphaBuyer, () => one(`select transition_status($1, 'purchase_orders', $2, 'received')`, [A, ids.po])), /Cannot move/);
    await fails(() => asUser(db, U.alphaCeo, () => one(`select transition_status($1, 'purchase_orders', $2, 'cancelled')`, [A, ids.po])), /comment is required/);
  });

  it('posting a GRN books stock, updates the PO and requests inspection', async () => {
    await asUser(db, U.alphaBuyer, () => one(`select transition_status($1, 'purchase_orders', $2, 'sent')`, [A, ids.po]));
    const g = await asUser(db, U.alphaStore, () => one(
      `insert into grns (company_id, po_id, supplier_id, warehouse_id, lines) values ($1, $2, $3, $4, $5) returning id`,
      [A, ids.po, ids.supplier, ids.wh, JSON.stringify([{ material_id: ids.material, qty: 300, rejected_qty: 10, rate: 60, batch_no: 'G1' }])]));
    ids.grn = String(g.id);
    await asUser(db, U.alphaStore, () => one(`select transition_status($1, 'grns', $2, 'posted')`, [A, ids.grn]));
    const po = await one(`select status, lines from purchase_orders where id = $1`, [ids.po]);
    expect(po.status).toBe('partially_received');
    expect(Number((po.lines as Row[])[0].received_qty)).toBe(290);
    expect(Number((await one(`select qty from stock_balances where material_id = $1 and batch_no = 'G1'`, [ids.material])).qty)).toBe(290);
    expect(await all(`select id from inspections where grn_id = $1 and status = 'requested'`, [ids.grn])).toHaveLength(1);
  });

  it('three-way match flags price variance and over-billing; exact duplicates are blocked', async () => {
    const inv = await asUser(db, U.alphaAdmin, () => one(
      `insert into invoices (company_id, invoice_no, supplier_id, invoice_date, due_date, po_id, lines) values ($1, 'SC/001', $2, current_date, current_date + 30, $3, $4)
       returning id, status, match_status, exceptions, paid_amount`,
      [A, ids.supplier, ids.po, JSON.stringify([{ material_id: ids.material, qty: 300, rate: 70 }])]));
    ids.badInvoice = String(inv.id);
    expect(Number(inv.paid_amount)).toBe(0);
    expect(inv.match_status).toBe('exception');
    const exc = (inv.exceptions as string[]).join(' | ');
    expect(exc).toMatch(/Price variance \+16\.7%/);
    expect(exc).toMatch(/exceeds accepted GRN qty 290/);
    await fails(() => asUser(db, U.alphaAdmin, () => one(
      `insert into invoices (company_id, invoice_no, supplier_id, invoice_date, due_date, po_id, lines) values ($1, 'SC-001', $2, current_date, current_date + 30, $3, '[]')`, [A, ids.supplier, ids.po])), /Duplicate/);
  });

  it('a matched invoice can be approved and paid, never overpaid', async () => {
    await fails(() => asUser(db, U.alphaAdmin, () => one(`select transition_status($1, 'invoices', $2, 'rejected', 'Over-billed')`, [A, ids.badInvoice])), /Maker-checker/);
    await asUser(db, U.alphaCeo, () => one(`select transition_status($1, 'invoices', $2, 'rejected', 'Over-billed at wrong rate')`, [A, ids.badInvoice]));
    const inv = await asUser(db, U.alphaAdmin, () => one(
      `insert into invoices (company_id, invoice_no, supplier_id, invoice_date, due_date, po_id, lines) values ($1, 'SC/002', $2, current_date - 40, current_date - 10, $3, $4) returning id, status, total, exceptions`,
      [A, ids.supplier, ids.po, JSON.stringify([{ material_id: ids.material, qty: 290, rate: 60 }])]));
    expect(inv.exceptions).toEqual([]);
    expect(inv.status).toBe('matched');
    await asUser(db, U.alphaAdmin, () => one(`select transition_status($1, 'invoices', $2, 'pending_approval')`, [A, inv.id]));
    await asUser(db, U.alphaCeo, () => one(`select transition_status($1, 'invoices', $2, 'approved')`, [A, inv.id]));
    await fails(() => asUser(db, U.alphaAdmin, () => one(`insert into payments (company_id, invoice_id, amount, mode, reference_no) values ($1, $2, $3, 'neft', 'U1')`, [A, inv.id, Number(inv.total) + 1])), /exceeds outstanding/);
    await asUser(db, U.alphaAdmin, () => one(`insert into payments (company_id, invoice_id, amount, mode, reference_no) values ($1, $2, 20000, 'neft', 'U2')`, [A, inv.id]));
    expect((await one(`select status, paid_amount from invoices where id = $1`, [inv.id]))).toMatchObject({ status: 'partially_paid' });
    await asUser(db, U.alphaAdmin, () => one(`insert into payments (company_id, invoice_id, amount, mode, reference_no) values ($1, $2, $3, 'neft', 'U3')`, [A, inv.id, Number(inv.total) - 20000]));
    expect((await one(`select status from invoices where id = $1`, [inv.id])).status).toBe('paid');
    // Payments are an append-only ledger.
    const upd = await asUser(db, U.alphaAdmin, () => db.query(`update payments set amount = 1 where invoice_id = $1`, [inv.id]));
    expect(upd.affectedRows).toBe(0);
  });

  it('shift reports update production orders, post FG stock and raise alerts', async () => {
    const ctx = await asUser(db, U.alphaAdmin, async () => {
      const line = await one(`insert into production_lines (company_id, code, name, factory_id) values ($1, 'L1', 'Line 1', $2) returning id`, [A, ids.factory]);
      const mc = await one(`insert into machines (company_id, code, name, factory_id, line_id, ideal_cycle_time_sec) values ($1, 'M1', 'Press', $2, $3, 60) returning id`, [A, ids.factory, line.id]);
      const fg = await one(`insert into materials (company_id, code, name, type, uom) values ($1, 'FG1', 'Bracket', 'fg', 'NOS') returning id`, [A]);
      const order = await one(`insert into production_orders (company_id, product_id, line_id, planned_qty, planned_end, output_warehouse_id) values ($1, $2, $3, 1000, current_date + 5, $4) returning id`, [A, fg.id, line.id, ids.wh]);
      await one(`select transition_status($1, 'production_orders', $2, 'released')`, [A, order.id]);
      const shift = await one(`select id from shifts where company_id = $1`, [A]);
      await one(`insert into shift_reports (company_id, shift_id, line_id, machine_id, production_order_id, target_qty, actual_qty, rejected_qty, planned_minutes, downtime_minutes, downtime_reason)
                 values ($1, $2, $3, $4, $5, 400, 300, 30, 480, 60, 'breakdown')`, [A, shift.id, line.id, mc.id, order.id]);
      return { order: String(order.id), fg: String(fg.id), shift: String(shift.id), line: String(line.id), mc: String(mc.id) };
    });
    const o = await one(`select status, produced_qty, rejected_qty from production_orders where id = $1`, [ctx.order]);
    expect(o).toMatchObject({ status: 'in_progress' });
    expect(Number(o.produced_qty)).toBe(270);
    expect(Number((await one(`select sum(qty) as q from stock_balances where material_id = $1`, [ctx.fg])).q)).toBe(270);
    const events = (await all(`select event_type from notifications where company_id = $1`, [A])).map((r) => r.event_type);
    expect(events).toEqual(expect.arrayContaining(['shift_update', 'below_target', 'high_rejection']));
    await fails(() => asUser(db, U.alphaAdmin, () => one(
      `insert into shift_reports (company_id, shift_id, line_id, machine_id, target_qty, actual_qty) values ($1, $2, $3, $4, 1, 1)`, [A, ctx.shift, ctx.line, ctx.mc])), /duplicate key|unique/);
  });

  it('failed inspections raise an NCR', async () => {
    const ins = await one(`select id from inspections where grn_id = $1`, [ids.grn]);
    await asUser(db, U.alphaAdmin, () => one(`update inspections set rejected_qty = 40, accepted_qty = 260, findings = 'Thickness out of spec' where id = $1`, [ins.id]));
    await asUser(db, U.alphaAdmin, () => one(`select transition_status($1, 'inspections', $2, 'failed', 'Thickness out of spec')`, [A, ins.id]));
    const ncr = await one(`select qty_affected, status from ncrs where inspection_id = $1`, [ins.id]);
    expect(ncr).toMatchObject({ status: 'open' });
    expect(Number(ncr.qty_affected)).toBe(40);
  });
});

describe('notification outbox retries', () => {
  it('claims due messages, backs off on failure and dead-letters after 5 attempts', async () => {
    const id = String((await one(`select id from notification_outbox where company_id = $1 limit 1`, [A])).id);
    for (let i = 1; i <= 5; i++) {
      await db.query(`update notification_outbox set next_attempt_at = now() - interval '1 second' where id = $1`, [id]);
      const claimed = await asService(db, () => all(`select id, attempts from claim_outbox(10)`));
      expect(claimed.find((c) => c.id === id)?.attempts).toBe(i);
      await asService(db, () => one(`select complete_outbox($1, false, 'WhatsApp API 401')`, [id]));
      const m = await one(`select status, last_error, next_attempt_at > now() as later from notification_outbox where id = $1`, [id]);
      expect(m.status).toBe(i < 5 ? 'failed' : 'dead');
      expect(m.later).toBe(true);
    }
    await asUser(db, U.alphaAdmin, () => one(`select retry_outbox($1, $2)`, [A, id]));
    expect((await one(`select status, attempts from notification_outbox where id = $1`, [id]))).toMatchObject({ status: 'pending', attempts: 0 });
    await fails(() => asUser(db, U.alphaStore, () => one(`select retry_outbox($1, $2)`, [A, id])), /Only admins/);
  });

  it('clients cannot call the service-role dispatcher functions', async () => {
    await fails(() => asUser(db, U.alphaAdmin, () => one(`select * from claim_outbox(1)`)), /permission denied/);
  });
});
