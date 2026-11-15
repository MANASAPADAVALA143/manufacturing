import { beforeEach, describe, expect, it } from 'vitest';
import { buildDemoDB } from '../seed';
import { DemoEngine, type Actor } from '../demoEngine';
import { answer } from '../../assistant';
import { DEFAULT_COMPANY_SETTINGS, type Member } from '../schema';
import type { Dataset } from '../../analytics';

let e: DemoEngine;
let apex: string;
let lakshmi: string;
const actor = (companyId: string, email: string): Actor => {
  const m = (e.t('company_members') as Member[]).find((x) => x.company_id === companyId && x.email === email)!;
  return e.resolveActor(m.user_id, companyId);
};

beforeEach(() => {
  e = new DemoEngine(buildDemoDB());
  apex = e.db.companies[0].id;
  lakshmi = e.db.companies[1].id;
});

describe('demo engine mirrors server rules', () => {
  it('derives role from membership, not from the client', () => {
    const store = actor(apex, 'store@apex.demo');
    expect(store.role).toBe('store_keeper');
    expect(() => e.resolveActor(store.userId, lakshmi)).toThrow(/not a member/);
  });

  it('enforces module permissions', () => {
    const store = actor(apex, 'store@apex.demo');
    expect(() => e.insert(store, 'purchase_orders', {})).toThrow(/does not allow create/);
    expect(() => e.assertCan(store, 'invoices', 'view')).toThrow();
    expect(() => e.assertCan(store, 'materials', 'view')).not.toThrow();
  });

  it('rejects references to another company’s records', () => {
    const admin = actor(apex, 'admin@apex.demo');
    const otherWh = e.rows('warehouses', lakshmi)[0];
    const mat = e.rows('materials', apex)[0];
    expect(() => e.insert(admin, 'stock_movements', { movement_type: 'in', material_id: mat.id, warehouse_id: otherWh.id, qty: 1, reason: 'other', movement_date: '2026-11-01' })).toThrow(/does not exist in this company/);
  });

  it('forces initial status and ignores server-managed fields on create', () => {
    const buyer = actor(apex, 'purchase@apex.demo');
    const sup = e.rows('suppliers', apex)[0];
    const mat = e.rows('materials', apex)[0];
    const wh = e.rows('warehouses', apex)[0];
    const po = e.insert(buyer, 'purchase_orders', { supplier_id: sup.id, po_date: '2026-11-01', expected_date: '2026-11-10', delivery_warehouse_id: wh.id, lines: [{ material_id: mat.id, qty: 10, rate: 5 }], status: 'approved', number: 'FAKE', total: 1 });
    expect(po.status).toBe('draft');
    expect(po.number).toMatch(/^PO-\d{4}-\d{4}$/);
    expect(po.total).toBe(59);
    expect(() => e.update(buyer, 'purchase_orders', po.id, { status: 'approved' })).not.toThrow();
    expect(e.find('purchase_orders', po.id, apex)!.status).toBe('draft');
    e.transition(buyer, 'purchase_orders', po.id, 'pending_approval');
    expect(() => e.transition(buyer, 'purchase_orders', po.id, 'approved')).toThrow(/Maker-checker/);
  });

  it('blocks a second shift report for the same machine, shift and date', () => {
    const sup = actor(apex, 'supervisor@apex.demo');
    const existing = e.rows('shift_reports', apex)[0];
    expect(() => e.insert(sup, 'shift_reports', { ...existing, id: undefined, number: undefined })).toThrow(/already exists/);
  });
});

describe('AI assistant (rule-based)', () => {
  const ds = (): Dataset => ({
    factories: e.rows('factories', apex), lines: e.rows('production_lines', apex), machines: e.rows('machines', apex), shifts: e.rows('shifts', apex),
    materials: e.rows('materials', apex), warehouses: e.rows('warehouses', apex), shiftReports: e.rows('shift_reports', apex), balances: e.rows('stock_balances', apex),
    movements: e.rows('stock_movements', apex), purchaseOrders: e.rows('purchase_orders', apex), requisitions: e.rows('purchase_requisitions', apex),
    invoices: e.rows('invoices', apex), inspections: e.rows('inspections', apex), workOrders: e.rows('work_orders', apex), pmSchedules: e.rows('pm_schedules', apex),
    shipments: e.rows('shipments', apex), productionOrders: e.rows('production_orders', apex), suppliers: e.rows('suppliers', apex), grns: e.rows('grns', apex),
    salesOrders: e.rows('sales_orders', apex), customers: e.rows('customers', apex), loading: false, stale: false,
  });

  it.each([
    ['What is today’s production?', 'production'],
    ['Which machine has the highest downtime?', 'downtime'],
    ['Which raw material will run out first?', 'stockout'],
    ['Which purchase orders are delayed?', 'delayed_po'],
    ['What is the rejection percentage?', 'rejection'],
    ['What is the manufacturing cost per unit?', 'cost'],
    ['Which machines require maintenance?', 'maintenance'],
    ['Which products are below production targets?', 'below_target'],
  ])('answers “%s” from data with sources', (q, intent) => {
    const a = answer(q, ds(), DEFAULT_COMPANY_SETTINGS);
    expect(a.intent).toBe(intent);
    expect(a.sources.length).toBeGreaterThan(0);
  });

  it('identifies the real worst machine and the real first stock-out', () => {
    expect(answer('Which machine has the highest downtime?', ds(), DEFAULT_COMPANY_SETTINGS).summary).toMatch(/Motor M2/);
    expect(answer('Which raw material will run out first?', ds(), DEFAULT_COMPANY_SETTINGS).summary).toMatch(/^(Aluminium|Bearing|Steel Coil)/);
  });

  it('refuses to make things up', () => {
    const a = answer('What will the share price be next year?', ds(), DEFAULT_COMPANY_SETTINGS);
    expect(a.intent).toBe('unknown');
    expect(a.sources).toEqual([]);
  });
});
