import type { Role } from '@/lib/rbac';
import { addDays } from '@/lib/dates';
import { uuid } from './backend';
import { DemoEngine, freshMemberRow, type Actor, type DemoDB, type DemoUser } from './demoEngine';
import { DEFAULT_COMPANY_SETTINGS, type BaseRow, type Company, type TableName } from './schema';

/**
 * Deterministic demo data. Everything after the masters is generated through
 * the engine's business rules (GRN posting, stock FIFO, invoice matching,
 * shift-report effects), so balances and alerts are computed, not hard-coded.
 */

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ISO timestamp `daysAgo` days back at local hour:minute, never later than now. */
const at = (daysAgo: number, h = 9, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return new Date(Math.min(d.getTime(), Date.now() - 60_000)).toISOString();
};
const day = (daysAgo: number) => addDays(new Date(), -daysAgo);

export const DEMO_PASSWORD_NOTE = 'Demo personas do not use passwords. Production uses Supabase Auth.';

interface Ctx {
  e: DemoEngine;
  cid: string;
  actors: Record<string, Actor>;
}

function ins(c: Ctx, who: string, table: TableName, v: Record<string, unknown>, when: string, silent = true): BaseRow {
  return c.e.insert(c.actors[who], table, v, { trusted: true, at: when, silent });
}
function tr(c: Ctx, who: string, table: TableName, row: BaseRow, to: string, when: string, comment?: string, silent = true) {
  return c.e.transition(c.actors[who], table, row.id, to, comment, { trusted: true, at: when, silent });
}

function company(id: string, name: string, slug: string, brand: string, gstin: string, address: string): Company {
  return {
    id, name, slug, gstin, address, brand_color: brand, logo_url: null, currency: 'INR', timezone: 'Asia/Kolkata',
    is_demo: true, settings: { ...DEFAULT_COMPANY_SETTINGS }, created_at: at(60),
  };
}

export function buildDemoDB(): DemoDB {
  const db: DemoDB = { version: 3, seededAt: new Date().toISOString(), companies: [], users: [], tables: {}, seq: {} };
  const e = new DemoEngine(db);
  const superUser: DemoUser = { id: uuid(), email: 'super@gnanova.demo', name: 'GNANOVA Platform Admin' };
  db.users.push(superUser);
  seedApex(e, superUser);
  seedLakshmi(e, superUser);
  return db;
}

function addMembers(e: DemoEngine, cid: string, domain: string, people: [Role, string, string, string?][], superUser: DemoUser) {
  const actors: Record<string, Actor> = {};
  for (const [role, key, name, phone] of people) {
    const user: DemoUser = { id: uuid(), email: `${key}@${domain}`, name };
    e.db.users.push(user);
    e.t('company_members').push(freshMemberRow(cid, user, role, { phone: phone ?? null }));
    actors[key] = { userId: user.id, name, companyId: cid, role };
  }
  e.t('company_members').push(freshMemberRow(cid, superUser, 'super_admin'));
  return actors;
}

// ════════════════════════════════════════════════════════════════════
// Company 1 — Apex Precision Components (full dataset)
// ════════════════════════════════════════════════════════════════════
function seedApex(e: DemoEngine, superUser: DemoUser) {
  const cid = uuid();
  e.db.companies.push(company(cid, 'Apex Precision Components Pvt Ltd', 'apex', '#1E40AF', '36AABCA1234F1Z5', 'Plot 42, IDA Patancheru, Hyderabad 502319'));
  const actors = addMembers(e, cid, 'apex.demo', [
    ['company_admin', 'admin', 'Priya Sharma', '+919800000001'],
    ['ceo', 'ceo', 'Rajesh Reddy', '+919800000002'],
    ['plant_manager', 'plant', 'Srinivas Rao', '+919800000003'],
    ['production_manager', 'production', 'Kavitha Nair', '+919800000004'],
    ['purchase_manager', 'purchase', 'Arjun Mehta', '+919800000005'],
    ['finance_manager', 'finance', 'Neha Gupta', '+919800000006'],
    ['store_keeper', 'store', 'Ramesh Babu'],
    ['production_supervisor', 'supervisor', 'Venkat Rao'],
    ['maintenance_technician', 'tech', 'Ravi Kumar'],
    ['quality_inspector', 'quality', 'Divya S'],
    ['warehouse_operator', 'warehouse', 'Imran Khan'],
  ], superUser);
  const c: Ctx = { e, cid, actors };
  const r = rng(42);
  const T0 = at(45);
  const m = (t: TableName, v: Record<string, unknown>) => ins(c, 'admin', t, v, T0);

  // ── Masters ──
  const f1 = m('factories', { code: 'P1', name: 'Plant 1 — Patancheru', city: 'Hyderabad', active: true });
  const f2 = m('factories', { code: 'P2', name: 'Plant 2 — Medchal', city: 'Hyderabad', active: true });
  const L1 = m('production_lines', { code: 'L1', name: 'Line 1 — Machining', factory_id: f1.id, capacity_per_shift: 320, active: true });
  const L2 = m('production_lines', { code: 'L2', name: 'Line 2 — Fabrication', factory_id: f1.id, capacity_per_shift: 130, active: true });
  const L3 = m('production_lines', { code: 'L3', name: 'Line 3 — Assembly', factory_id: f1.id, capacity_per_shift: 320, active: true });
  const L4 = m('production_lines', { code: 'L4', name: 'Line 4 — Press Shop', factory_id: f2.id, capacity_per_shift: 220, active: true });
  const whRM = m('warehouses', { code: 'RM1', name: 'Raw Material Store — P1', factory_id: f1.id, kind: 'raw_material', active: true });
  const whFG = m('warehouses', { code: 'FG1', name: 'Finished Goods — P1', factory_id: f1.id, kind: 'finished_goods', active: true });
  const whSP = m('warehouses', { code: 'SP1', name: 'Maintenance Spares — P1', factory_id: f1.id, kind: 'spares', active: true });
  const whP2 = m('warehouses', { code: 'GW2', name: 'General Store — P2', factory_id: f2.id, kind: 'general', active: true });
  const whFG2 = m('warehouses', { code: 'FG2', name: 'Finished Goods — P2', factory_id: f2.id, kind: 'finished_goods', active: true });
  for (const [code, wh, d] of [['RM1-A-01', whRM, 'Coil bay A'], ['RM1-A-02', whRM, 'Plate rack'], ['RM1-B-01', whRM, 'Bar stock'], ['FG1-01', whFG, 'Dispatch bay'], ['SP1-R1', whSP, 'Rack 1 — bearings']] as const) {
    m('bins', { code, warehouse_id: wh.id, description: d });
  }
  const sA = m('shifts', { code: 'A', name: 'Shift A', start_time: '06:00', end_time: '14:00', planned_minutes: 450 });
  const sB = m('shifts', { code: 'B', name: 'Shift B', start_time: '14:00', end_time: '22:00', planned_minutes: 450 });
  const sC = m('shifts', { code: 'C', name: 'Shift C', start_time: '22:00', end_time: '06:00', planned_minutes: 420 });
  for (const [code, name, decimals] of [['KG', 'Kilogram', 2], ['NOS', 'Numbers', 0], ['L', 'Litre', 1], ['MT', 'Metric tonne', 3], ['SET', 'Set', 0]] as const) m('uoms', { code, name, decimals });

  const emp = (code: string, name: string, skill: string, f = f1.id, cost = 220) => m('employees', { code, name, skill, factory_id: f, hourly_cost: cost, active: true });
  const eRavi = emp('E101', 'Ravi Kumar', 'technician', f1.id, 320);
  const eSuresh = emp('E102', 'Suresh T', 'technician', f1.id, 300);
  const eKiran = emp('E103', 'Kiran M', 'technician', f2.id, 300);
  const operators = [emp('E201', 'Anil Kumar', 'operator'), emp('E202', 'Prakash G', 'operator'), emp('E203', 'Meena R', 'operator'), emp('E204', 'Raju P', 'operator'), emp('E205', 'Lakshmi V', 'operator', f2.id), emp('E206', 'Sanjay D', 'operator')];
  const eDivya = emp('E301', 'Divya S', 'inspector', f1.id, 260);
  const eFarhan = emp('E302', 'Farhan Ali', 'inspector', f2.id, 260);
  emp('E401', 'Venkat Rao', 'supervisor', f1.id, 280);
  emp('E501', 'Ramesh Babu', 'storekeeper', f1.id, 200);

  const sup = (code: string, name: string, category: string, gstin: string, phone: string, status = 'active', terms = 30) =>
    m('suppliers', { code, name, category, gstin, phone, email: `accounts@${name.toLowerCase().replace(/[^a-z]/g, '')}.example`, status, payment_terms_days: terms });
  const tata = sup('S001', 'Tata Steel Ltd', 'Raw material', '27AATCS0447N1ZS', '+912266658282', 'preferred', 45);
  const skf = sup('S002', 'SKF India Ltd', 'Bearings', '27AABCS1681G1ZN', '+912066112500');
  const greaves = sup('S003', 'Greaves Cotton Ltd', 'Components', '27AABCG0569P1ZX', '+912233411000');
  const asian = sup('S004', 'Asian Paints Ltd', 'Consumables', '27AAACA9929L1Z5', '+912262181000');
  const bosch = sup('S005', 'Bosch India Ltd', 'Filters & spares', '29AABCB2690N1ZA', '+918067521000', 'preferred');
  const hindalco = sup('S006', 'Hindalco Industries', 'Raw material', '27AAACH1201R1ZJ', '+912266626666', 'active', 30);
  const jindal = sup('S007', 'Jindal Stainless', 'Raw material', '06AAACJ3546N1Z0', '+911244494100', 'active', 30);

  const mat = (code: string, name: string, type: string, uom: string, o: Record<string, unknown> = {}) =>
    m('materials', { code, name, type, uom, min_stock: 0, reorder_level: 0, reorder_qty: 0, standard_cost: 0, lead_time_days: 7, ...o });
  const coil = mat('RM-HRC-2', 'Steel Coil A — HR 2mm', 'raw', 'KG', { category: 'Steel', barcode: '8901000000011', hsn_code: '7208', min_stock: 8000, reorder_level: 15000, reorder_qty: 30000, standard_cost: 62, lead_time_days: 12, preferred_supplier_id: tata.id });
  const plate = mat('RM-MSP-10', 'MS Plate 10mm', 'raw', 'KG', { category: 'Steel', barcode: '8901000000028', hsn_code: '7208', min_stock: 4000, reorder_level: 8000, reorder_qty: 20000, standard_cost: 58, lead_time_days: 10, preferred_supplier_id: tata.id });
  const alu = mat('RM-ALU-IG', 'Aluminium Ingot LM6', 'raw', 'KG', { category: 'Non-ferrous', barcode: '8901000000035', hsn_code: '7601', min_stock: 4000, reorder_level: 8000, reorder_qty: 15000, standard_cost: 238, lead_time_days: 8, preferred_supplier_id: hindalco.id });
  const bar = mat('RM-ASB-40', 'Alloy Steel Bar EN19 40mm', 'raw', 'KG', { category: 'Steel', barcode: '8901000000042', hsn_code: '7228', min_stock: 5000, reorder_level: 9000, reorder_qty: 15000, standard_cost: 96, lead_time_days: 10, preferred_supplier_id: jindal.id });
  const brg = mat('CP-SKF-6204', 'Bearing SKF-6204', 'raw', 'NOS', { category: 'Bearings', barcode: '7316570000017', hsn_code: '8482', min_stock: 3000, reorder_level: 8000, reorder_qty: 10000, standard_cost: 310, lead_time_days: 14, preferred_supplier_id: skf.id });
  const primer = mat('CN-PRM-RD', 'Red Oxide Primer', 'consumable', 'L', { category: 'Paint', hsn_code: '3208', min_stock: 200, reorder_level: 400, reorder_qty: 1000, standard_cost: 185, lead_time_days: 5, preferred_supplier_id: asian.id });
  const motorB = mat('CP-MTR-B', 'Motor B — 2HP', 'raw', 'NOS', { category: 'Components', hsn_code: '8501', min_stock: 10, reorder_level: 20, reorder_qty: 40, standard_cost: 21000, lead_time_days: 21, preferred_supplier_id: greaves.id });
  const filt = mat('SP-FLT-HY', 'Hydraulic Filter HF-35', 'spare', 'NOS', { category: 'Filters', hsn_code: '8421', min_stock: 10, reorder_level: 20, reorder_qty: 50, standard_cost: 950, lead_time_days: 7, preferred_supplier_id: bosch.id });
  const oil = mat('SP-OIL-68', 'Hydraulic Oil ISO VG 68', 'consumable', 'L', { category: 'Lubricants', hsn_code: '2710', min_stock: 200, reorder_level: 400, reorder_qty: 1000, standard_cost: 165, lead_time_days: 5 });
  const brgSp = mat('SP-BRG-6305', 'Motor Bearing 6305 (spare)', 'spare', 'NOS', { category: 'Bearings', hsn_code: '8482', min_stock: 6, reorder_level: 10, reorder_qty: 20, standard_cost: 640, lead_time_days: 7, preferred_supplier_id: skf.id });
  const belt = mat('SP-VBT-B52', 'V-Belt B52', 'spare', 'NOS', { category: 'Transmission', hsn_code: '4010', min_stock: 8, reorder_level: 12, reorder_qty: 24, standard_cost: 420, lead_time_days: 4 });
  const coolant = mat('CN-CLT-01', 'Cutting Coolant Concentrate', 'consumable', 'L', { category: 'Lubricants', hsn_code: '3403', min_stock: 100, reorder_level: 200, reorder_qty: 600, standard_cost: 310, lead_time_days: 5 });
  const fgFrame = mat('FG-SFA12', 'Steel Frame A12', 'fg', 'NOS', { category: 'Frames', barcode: '8909990000126', hsn_code: '7308', standard_cost: 980, selling_price: 1450 });
  const fgBracket = mat('FG-BAB7', 'Bracket Assembly B7', 'fg', 'NOS', { category: 'Brackets', barcode: '8909990000072', hsn_code: '7326', standard_cost: 145, selling_price: 215 });
  const fgHousing = mat('FG-MHC3', 'Motor Housing C3', 'fg', 'NOS', { category: 'Castings', barcode: '8909990000033', hsn_code: '7616', standard_cost: 720, selling_price: 1080 });
  const fgGear = mat('FG-GUD5', 'Gear Unit D5', 'fg', 'NOS', { category: 'Gears', barcode: '8909990000055', hsn_code: '8483', standard_cost: 640, selling_price: 960 });

  const cust = (code: string, name: string, city: string, gstin: string, terms = 45) =>
    m('customers', { code, name, city, gstin, payment_terms_days: terms, email: `purchase@${name.toLowerCase().replace(/[^a-z]/g, '')}.example`, contact_name: 'Purchase Head' });
  const meridian = cust('C001', 'Meridian Steel Co.', 'Hyderabad', '36AAECM1234K1Z2');
  const delta = cust('C002', 'Delta Agro Industries', 'Guntur', '37AAFCD5678L1Z9', 30);
  const vantage = cust('C003', 'Vantage Fabricators', 'Pune', '27AAGCV9012M1Z4', 60);
  const krishna = cust('C004', 'Krishna Industries', 'Vijayawada', '37AAHCK3456N1Z1');
  const orion = cust('C005', 'Orion Components', 'Chennai', '33AAICO7890P1Z6');

  const mach = (code: string, name: string, line: BaseRow, type: string, ict: number, crit = 'medium', fac = f1.id) =>
    m('machines', { code, name, factory_id: fac, line_id: line.id, machine_type: type, criticality: crit, status: 'running', ideal_cycle_time_sec: ict, make: 'Various', install_date: '2021-04-01' });
  const cnc1 = mach('M-L1-CNC1', 'CNC Lathe L1-01', L1, 'CNC lathe', 80, 'high');
  const cnc2 = mach('M-L1-CNC2', 'CNC Lathe L1-02', L1, 'CNC lathe', 80, 'high');
  const weld = mach('M-L2-WLD1', 'Line 2 Motor M2 — Robotic Welder', L2, 'Welding cell', 200, 'high');
  const paint = mach('M-L2-PNT1', 'Paint Booth L2', L2, 'Paint booth', 90, 'medium');
  const asm = mach('M-L3-ASM1', 'Assembly Station L3', L3, 'Assembly', 80, 'medium');
  const press = mach('M-L4-PRS1', 'Hydraulic Press P-01', L4, 'Hydraulic press', 120, 'high', f2.id);
  const comp = mach('M-UT-CU03', 'Compressor Unit CU-03', L1, 'Utility', 1, 'medium');
  const conv = mach('M-L1-CB1', 'Conveyor CB-Line1', L1, 'Conveyor', 1, 'low');

  const transp = (code: string, name: string, phone: string) => m('transporters', { code, name, phone, contact_name: 'Dispatch desk' });
  const blueDart = transp('T01', 'BlueDart', '+918001233003');
  const dtdc = transp('T02', 'DTDC', '+917305770577');
  const tci = transp('T03', 'TCI Freight', '+911242381603');
  const fedex = transp('T04', 'FedEx', '+918002096161');
  const v1 = m('vehicles', { registration_no: 'TS09UB4521', vehicle_type: 'truck', capacity_kg: 9000, transporter_id: tci.id, driver_name: 'Mahesh', status: 'available' });
  m('vehicles', { registration_no: 'TS08EK1190', vehicle_type: 'tempo', capacity_kg: 2500, transporter_id: null, driver_name: 'Own fleet — Yusuf', status: 'available' });
  const v3 = m('vehicles', { registration_no: 'AP16TY7788', vehicle_type: 'container', capacity_kg: 16000, transporter_id: dtdc.id, driver_name: 'Naresh', status: 'on_trip' });

  for (const [mtl, name, stage, unit, mn, mx] of [
    [coil, 'Thickness', 'incoming', 'mm', 1.9, 2.1], [coil, 'Tensile strength', 'incoming', 'MPa', 410, 520],
    [fgFrame, 'Weld bead width', 'in_process', 'mm', 5, 7], [fgFrame, 'Surface finish Ra', 'final', 'µm', 0, 3.2],
    [fgGear, 'Bore diameter', 'final', 'mm', 39.98, 40.02], [brg, 'Radial play', 'incoming', 'µm', 5, 20],
  ] as const) m('quality_parameters', { material_id: mtl.id, name, stage, unit, min_value: mn, max_value: mx });
  const dSurface = m('defect_codes', { code: 'D-SRF', name: 'Surface finish defect', category: 'surface', severity: 'major' });
  const dDim = m('defect_codes', { code: 'D-DIM', name: 'Dimensional variance', category: 'dimensional', severity: 'major' });
  m('defect_codes', { code: 'D-WLD', name: 'Weld porosity', category: 'functional', severity: 'critical' });
  const dFunc = m('defect_codes', { code: 'D-FUN', name: 'Functional failure', category: 'functional', severity: 'critical' });
  m('defect_codes', { code: 'D-PKG', name: 'Packaging damage', category: 'packaging', severity: 'minor' });
  m('defect_codes', { code: 'D-MAT', name: 'Material composition', category: 'material', severity: 'critical' });

  m('approval_rules', { entity: 'purchase_orders', min_amount: 0, approver_role: 'purchase_manager', active: true });
  m('approval_rules', { entity: 'purchase_orders', min_amount: 1000000, approver_role: 'ceo', active: true });
  m('approval_rules', { entity: 'purchase_requisitions', min_amount: 0, approver_role: 'plant_manager', active: true });
  m('approval_rules', { entity: 'invoices', min_amount: 0, approver_role: 'finance_manager', active: true });
  m('approval_rules', { entity: 'invoices', min_amount: 1500000, approver_role: 'ceo', active: true });
  m('approval_rules', { entity: 'quotations', min_amount: 0, approver_role: 'plant_manager', active: true });
  m('report_schedules', { name: 'Daily production digest', report_type: 'production', frequency: 'daily', send_time: '07:30', channel: 'email', recipients: 'ceo@apex.demo, plant@apex.demo', active: true });
  m('report_schedules', { name: 'Weekly management pack', report_type: 'oee', frequency: 'weekly', send_time: '08:00', channel: 'email', recipients: 'ceo@apex.demo', active: true });
  m('report_schedules', { name: 'AP ageing to finance', report_type: 'ap_ageing', frequency: 'weekly', send_time: '09:00', channel: 'whatsapp', recipients: '+919800000006', active: true });
  for (const [who, ev, wa, em] of [['purchase', 'low_stock', true, true], ['purchase', 'purchase_requisition', true, false], ['finance', 'invoice_approval', false, true], ['plant', 'machine_breakdown', true, true], ['ceo', 'daily_digest', true, true], ['production', 'below_target', true, false]] as const) {
    e.t('notification_preferences').push({ id: uuid(), company_id: cid, created_at: T0, updated_at: T0, user_id: actors[who].userId, event_type: ev, in_app: true, whatsapp: wa, email: em });
  }

  // ── Opening stock (day -40) ──
  const open = (mt: BaseRow, wh: BaseRow, qty: number, cost: number, batch = 'OPENING') =>
    ins(c, 'store', 'stock_movements', { movement_type: 'in', material_id: mt.id, qty, warehouse_id: wh.id, batch_no: batch, reason: 'opening_balance', reference: 'Opening', unit_cost: cost, movement_date: day(40) }, at(40, 8));
  open(coil, whRM, 36000, 61); open(plate, whRM, 25000, 57); open(bar, whRM, 30000, 95); open(brg, whRM, 32000, 305);
  open(primer, whRM, 2000, 182); open(motorB, whRM, 26, 20800); open(alu, whP2, 20000, 236);
  open(filt, whSP, 30, 940); open(oil, whSP, 900, 162); open(brgSp, whSP, 16, 630); open(belt, whSP, 20, 410); open(coolant, whRM, 500, 305);
  open(fgGear, whFG, 1800, 640, 'FG-OPEN'); open(fgFrame, whFG, 600, 980, 'FG-OPEN'); open(fgBracket, whFG, 3000, 145, 'FG-OPEN'); open(fgHousing, whFG2, 900, 720, 'FG-OPEN');

  // ── Purchasing history ──
  const po = (who: string, supplier: BaseRow, wh: BaseRow, lines: [BaseRow, number, number][], d: number, lead: number, path: string[]) => {
    let row = ins(c, who, 'purchase_orders', {
      supplier_id: supplier.id, po_date: day(d), expected_date: day(d - lead), delivery_warehouse_id: wh.id, tax_pct: 18, payment_terms_days: 30,
      lines: lines.map(([mt, qty, rate]) => ({ material_id: mt.id, qty, rate, received_qty: 0 })), status: 'draft',
    }, at(d, 10));
    for (const [i, s] of path.entries()) row = tr(c, s === 'approved' ? 'plant' : 'purchase', 'purchase_orders', row, s, at(d, 11 + i));
    return row;
  };
  const grn = (pOrder: BaseRow, supplier: BaseRow, wh: BaseRow, lines: [BaseRow, number, number, number, string][], d: number) => {
    const g = ins(c, 'store', 'grns', {
      po_id: pOrder.id, supplier_id: supplier.id, received_date: day(d), warehouse_id: wh.id, supplier_challan_no: `DC-${Math.floor(r() * 90000 + 10000)}`, vehicle_no: 'TS07UA' + Math.floor(r() * 9000 + 1000),
      lines: lines.map(([mt, qty, rej, rate, batch]) => ({ material_id: mt.id, qty, rejected_qty: rej, rate, batch_no: batch })), status: 'draft',
    }, at(d, 9));
    return tr(c, 'store', 'grns', g, 'posted', at(d, 15));
  };
  const SENT = ['pending_approval', 'approved', 'sent'];

  const poCoil = po('purchase', tata, whRM, [[coil, 30000, 62]], 30, 12, SENT);
  const poPlate = po('purchase', tata, whRM, [[plate, 20000, 58]], 26, 10, SENT);
  const poBar = po('purchase', jindal, whRM, [[bar, 15000, 96]], 24, 10, SENT);
  const poAlu = po('purchase', hindalco, whP2, [[alu, 15000, 238]], 22, 8, SENT);
  const poSkf = po('purchase', skf, whRM, [[brg, 15000, 310]], 20, 14, SENT);
  const poGreaves = po('purchase', greaves, whRM, [[motorB, 20, 21000]], 19, 14, SENT);
  const poPaint = po('purchase', asian, whRM, [[primer, 1000, 185], [coolant, 300, 310]], 12, 5, SENT);
  const poBosch = po('purchase', bosch, whSP, [[filt, 100, 950]], 6, 7, SENT);
  po('purchase', skf, whSP, [[brgSp, 20, 640]], 2, 7, ['pending_approval']);
  po('purchase', tata, whRM, [[coil, 25000, 63]], 1, 12, []);

  // GRNs interleaved chronologically with consumption below.
  const grnPlan: { d: number; run: () => BaseRow }[] = [
    { d: 18, run: () => grn(poCoil, tata, whRM, [[coil, 30000, 0, 62, 'TS-HR-2409']], 18) },
    { d: 16, run: () => grn(poPlate, tata, whRM, [[plate, 20000, 0, 58, 'TS-PL-1187']], 16) },
    { d: 14, run: () => grn(poBar, jindal, whRM, [[bar, 15000, 0, 96, 'JS-EN19-552']], 14) },
    { d: 14, run: () => grn(poAlu, hindalco, whP2, [[alu, 15000, 0, 238, 'HD-LM6-0912']], 14) },
    { d: 6, run: () => grn(poSkf, skf, whRM, [[brg, 10000, 0, 310, 'SKF-6204-B77']], 6) },
    { d: 5, run: () => grn(poGreaves, greaves, whRM, [[motorB, 20, 2, 21000, 'GC-MB-311']], 5) },
    { d: 7, run: () => grn(poPaint, asian, whRM, [[primer, 1000, 0, 185, 'AP-RO-77'], [coolant, 300, 0, 310, 'AP-CL-12']], 7) },
  ];
  const grnRows: Record<string, BaseRow> = {};

  // ── Production orders ──
  const prod = (product: BaseRow, line: BaseRow, machine: BaseRow, qty: number, d0: number, d1: number, wh: BaseRow, so?: BaseRow) => {
    let o = ins(c, 'production', 'production_orders', { product_id: product.id, line_id: line.id, machine_id: machine.id, planned_qty: qty, planned_start: day(d0), planned_end: day(d1), output_warehouse_id: wh.id, priority: 'normal', sales_order_id: so?.id ?? null, status: 'planned' }, at(d0, 7));
    o = tr(c, 'production', 'production_orders', o, 'released', at(d0, 7, 30));
    return o;
  };

  // ── Sales ──
  const so1 = ins(c, 'admin', 'sales_orders', { customer_id: vantage.id, order_date: day(34), delivery_date: day(4), customer_po: 'VF/PO/2291', lines: [{ material_id: fgGear.id, qty: 9000, rate: 955 }], tax_pct: 18, status: 'confirmed' }, at(34));
  const so2 = ins(c, 'admin', 'sales_orders', { customer_id: meridian.id, order_date: day(33), delivery_date: day(2), customer_po: 'MSC-7781', lines: [{ material_id: fgFrame.id, qty: 4500, rate: 1440 }], tax_pct: 18, status: 'confirmed' }, at(33));
  const so3 = ins(c, 'admin', 'sales_orders', { customer_id: delta.id, order_date: day(32), delivery_date: day(-3), customer_po: 'DAI/24/118', lines: [{ material_id: fgBracket.id, qty: 22000, rate: 212 }], tax_pct: 18, status: 'confirmed' }, at(32));
  const so4 = ins(c, 'admin', 'sales_orders', { customer_id: krishna.id, order_date: day(31), delivery_date: day(-6), lines: [{ material_id: fgHousing.id, qty: 9000, rate: 1075 }], tax_pct: 18, status: 'confirmed' }, at(31));
  const so5 = ins(c, 'admin', 'sales_orders', { customer_id: orion.id, order_date: day(3), delivery_date: day(-20), lines: [{ material_id: fgGear.id, qty: 2500, rate: 960 }, { material_id: fgBracket.id, qty: 5000, rate: 214 }], tax_pct: 18, status: 'confirmed' }, at(3));
  for (const s of [so1, so2, so3, so4]) tr(c, 'production', 'sales_orders', s, 'in_production', at(30, 8));

  const poGear = prod(fgGear, L1, cnc1, 18000, 30, -2, whFG, so1);
  const poFrame = prod(fgFrame, L2, weld, 7200, 30, -2, whFG, so2);
  const poBrkt = prod(fgBracket, L3, asm, 27000, 30, -2, whFG, so3);
  const poHous = prod(fgHousing, L4, press, 12000, 30, -2, whFG2, so4);
  prod(fgGear, L1, cnc2, 2500, -1, -8, whFG, so5);

  // ── 30 days of shifts, consumption and receipts ──
  const plan = [
    { machine: cnc1, line: L1, order: poGear, shifts: [sA, sB], target: 300, bom: [[bar, 0.9], [brg, 1]] as [BaseRow, number][], wh: whRM },
    { machine: cnc2, line: L1, order: poGear, shifts: [sA, sB], target: 300, bom: [[bar, 0.9], [brg, 1]] as [BaseRow, number][], wh: whRM },
    { machine: weld, line: L2, order: poFrame, shifts: [sA, sB], target: 120, bom: [[coil, 8], [primer, 0.2]] as [BaseRow, number][], wh: whRM },
    { machine: asm, line: L3, order: poBrkt, shifts: [sA, sB, sC], target: 300, bom: [[plate, 1.2]] as [BaseRow, number][], wh: whRM },
    { machine: press, line: L4, order: poHous, shifts: [sA, sB], target: 200, bom: [[alu, 2.5]] as [BaseRow, number][], wh: whP2 },
  ];
  const opsByShift: Record<string, BaseRow> = { [sA.id]: operators[0], [sB.id]: operators[1], [sC.id]: operators[2] };
  const reasons = ['changeover', 'material_shortage', 'quality_issue', 'power_failure', 'breakdown'];

  for (let d = 30; d >= 0; d--) {
    for (const g of grnPlan.filter((x) => x.d === d)) { const row = g.run(); grnRows[String(row.number)] = row; }
    const usage = new Map<string, { mt: BaseRow; wh: BaseRow; qty: number }>();
    for (const p of plan) {
      // Today: only Shift A, and only once it has ended (14:00).
      const shiftsToday = d === 0 ? (new Date().getHours() >= 14 ? p.shifts.slice(0, 1) : []) : p.shifts;
      for (const sh of shiftsToday) {
        const isL2 = p.machine.id === weld.id;
        const isPress = p.machine.id === press.id;
        // Line 2 welder degrades over the last 10 days (vibration on Motor M2).
        const degrade = isL2 && d <= 10 ? (10 - d) * 0.012 : 0;
        const breakdownDay = isPress && d === 6 && sh.id === sA.id;
        const planned = Number(sh.planned_minutes);
        let downtime = Math.round(10 + r() * 30 + (isL2 && d <= 10 ? 25 + (10 - d) * 4 : 0));
        if (breakdownDay) downtime = 180;
        const perf = 0.86 + r() * 0.1 - degrade;
        const runMin = planned - downtime;
        const actual = Math.max(0, Math.round((runMin * 60 * perf) / Number(p.machine.ideal_cycle_time_sec)));
        const rejRate = isL2 && d <= 10 ? 0.02 + r() * 0.025 : 0.004 + r() * 0.012;
        const rejected = Math.round(actual * rejRate);
        const hour = sh.id === sA.id ? 13 : sh.id === sB.id ? 21 : 23;
        ins(c, 'supervisor', 'shift_reports', {
          report_date: day(d), shift_id: sh.id, line_id: p.line.id, machine_id: p.machine.id, production_order_id: p.order.id, product_id: p.order.product_id,
          operator_id: (p.machine.id === press.id ? operators[4] : opsByShift[sh.id]).id, target_qty: p.target, actual_qty: actual, rejected_qty: rejected,
          planned_minutes: planned, downtime_minutes: downtime,
          downtime_reason: breakdownDay ? 'breakdown' : isL2 && d <= 10 ? 'breakdown' : downtime > 30 ? reasons[Math.floor(r() * reasons.length)] : 'changeover',
          comments: breakdownDay ? 'Press P-01 hydraulic seal failure — WO raised' : isL2 && d <= 3 ? 'Vibration noted on welder Motor M2, speed reduced' : null,
          status: d > 2 ? 'verified' : 'submitted',
        }, at(d, hour, 50), d > 1);
        for (const [mt, per] of p.bom) {
          const k = `${mt.id}:${p.wh.id}`;
          const u = usage.get(k) ?? { mt, wh: p.wh, qty: 0 };
          u.qty += actual * per;
          usage.set(k, u);
        }
      }
    }
    for (const u of usage.values()) {
      ins(c, 'store', 'stock_movements', { movement_type: 'out', material_id: u.mt.id, qty: Math.round(u.qty), warehouse_id: u.wh.id, reason: 'production_issue', reference: `Daily issue ${day(d)}`, movement_date: day(d) }, at(d, 23, 55));
    }
    if (d % 5 === 0 && d > 0) {
      ins(c, 'store', 'stock_movements', { movement_type: 'out', material_id: coolant.id, qty: 40, warehouse_id: whRM.id, reason: 'production_issue', reference: 'Coolant top-up', movement_date: day(d) }, at(d, 23, 56));
    }
  }

  // ── Shipments (dispatch out of FG) ──
  const ship = (so: BaseRow, cust: BaseRow, dest: string, tp: BaseRow, lines: [BaseRow, number, number][], d: number, eta: number, path: string[], wh = whFG, veh?: BaseRow, freight = 18000) => {
    let s = ins(c, 'warehouse', 'shipments', {
      sales_order_id: so.id, customer_id: cust.id, destination: dest, dispatch_date: day(d), eta: day(eta), transporter_id: tp.id, vehicle_id: veh?.id ?? null,
      from_warehouse_id: wh.id, lines: lines.map(([mt, qty, rate]) => ({ material_id: mt.id, qty, rate })), challan_no: `DC/${day(d).replace(/-/g, '')}/${Math.floor(r() * 90 + 10)}`,
      eway_bill_no: String(Math.floor(100000000000 + r() * 899999999999)), lr_no: `LR${Math.floor(r() * 900000 + 100000)}`, freight_cost: freight, status: 'planned',
    }, at(d, 9));
    for (const [i, st] of path.entries()) {
      const when = st === 'delivered' || st === 'pod_received' ? at(Math.max(0, eta), 15 + i) : at(d, 10 + i);
      s = tr(c, 'warehouse', 'shipments', s, st, when, st === 'delayed' ? 'Held at Nagpur hub — DTDC network delay' : undefined, d > 1);
    }
    return s;
  };
  const DELIVERED = ['loaded', 'dispatched', 'in_transit', 'delivered', 'pod_received'];
  ship(so1, vantage, 'Pune', fedex, [[fgGear, 4000, 955]], 20, 17, DELIVERED, whFG, undefined, 42000);
  ship(so3, delta, 'Guntur', blueDart, [[fgBracket, 9000, 212]], 18, 16, DELIVERED, whFG, undefined, 16500);
  ship(so4, krishna, 'Vijayawada', tci, [[fgHousing, 4000, 1075]], 15, 13, DELIVERED, whFG2, v1, 21000);
  ship(so2, meridian, 'Hyderabad', blueDart, [[fgFrame, 2000, 1440]], 12, 11, DELIVERED, whFG, undefined, 9500);
  ship(so1, vantage, 'Pune', fedex, [[fgGear, 4000, 955]], 8, 6, ['loaded', 'dispatched', 'in_transit', 'delivered'], whFG, undefined, 42000);
  ship(so3, delta, 'Guntur', blueDart, [[fgBracket, 9000, 212]], 3, 1, ['loaded', 'dispatched', 'in_transit'], whFG, undefined, 16500);
  ship(so2, meridian, 'Hyderabad', dtdc, [[fgFrame, 2000, 1440]], 3, 1, ['loaded', 'dispatched', 'delayed'], whFG, v3, 8800);
  ship(so4, krishna, 'Vijayawada', tci, [[fgHousing, 4000, 1075]], 1, -1, ['loaded', 'dispatched'], whFG2, v1, 21000);
  ship(so3, delta, 'Guntur', blueDart, [[fgBracket, 3000, 212]], 0, -2, [], whFG, undefined, 9000);

  // ── Sales pipeline ──
  const rfq = (cust: BaseRow, product: BaseRow, qty: number, d: number, status: string, spec: string, ref: string, price?: number) =>
    ins(c, 'admin', 'rfqs', { customer_id: cust.id, product_id: product.id, quantity: qty, received_date: day(d), required_by: day(d - 30), specification: spec, customer_ref: ref, target_price: price ?? null, source: 'email', status }, at(d, 11));
  const r1 = rfq(meridian, fgFrame, 4200, 2, 'under_review', 'ASTM A36, 10mm, primer coated, Net 45', 'MSC/RFQ/0842');
  const r2 = rfq(delta, fgBracket, 6000, 4, 'quoted', 'Zinc plated bracket B7 rev C', 'DAI/RFQ/0841', 210);
  const r3 = rfq(vantage, fgGear, 12000, 9, 'quoted', 'Gear unit D5 with SKF bearings', 'VF/RFQ/0839', 940);
  rfq(orion, fgGear, 2500, 6, 'won', 'D5 standard', 'OC/2291');
  rfq(krishna, fgHousing, 3000, 1, 'new', 'C3 housing — machined bore', 'KI/RFQ/77');
  rfq(meridian, fgBracket, 1500, 20, 'lost', 'Bracket B7 short run', 'MSC/RFQ/0802');
  const quote = (rf: BaseRow, cust: BaseRow, product: BaseRow, qty: number, rate: number, matCost: number, conv: number, d: number, path: string[]) => {
    let q = ins(c, 'production', 'quotations', { rfq_id: rf.id, customer_id: cust.id, quote_date: day(d), valid_until: day(d - 30), lines: [{ material_id: product.id, qty, rate }], material_cost: matCost, conversion_cost: conv, tax_pct: 18, terms: 'Ex-works Patancheru. Payment 45 days.', status: 'draft' }, at(d, 15));
    for (const [i, s] of path.entries()) q = tr(c, s === 'approved' ? 'plant' : 'production', 'quotations', q, s, at(d, 16 + i));
    return q;
  };
  quote(r1, meridian, fgFrame, 4200, 1440, 4200 * 690, 4200 * 280, 1, []);
  quote(r2, delta, fgBracket, 6000, 213, 6000 * 92, 6000 * 48, 3, ['pending_approval']);
  quote(r3, vantage, fgGear, 12000, 948, 12000 * 410, 12000 * 210, 8, ['pending_approval', 'approved', 'sent', 'accepted']);

  // ── Procurement pipeline ──
  const pr = (mt: BaseRow, qty: number, rate: number, d: number, priority: string, source: string, reason: string, path: string[], who = 'store') => {
    let p = ins(c, who, 'purchase_requisitions', { request_type: 'purchase', material_id: mt.id, qty, estimated_rate: rate, required_by: day(d - 10), factory_id: f1.id, priority, source, reason, status: 'draft' }, at(d, 10));
    for (const [i, s] of path.entries()) p = tr(c, s === 'submitted' ? who : 'plant', 'purchase_requisitions', p, s, at(d, 11 + i), s === 'rejected' ? 'Use existing stock in P2' : undefined, d > 1);
    return p;
  };
  pr(coil, 30000, 62, 1, 'urgent', 'reorder', 'Coil below reorder level — ~6 days cover left at current consumption.', ['submitted']);
  const prAlu = pr(alu, 15000, 238, 3, 'high', 'reorder', 'Press shop consumption up; cover < 6 days.', ['submitted', 'approved']);
  pr(belt, 24, 420, 9, 'normal', 'maintenance', 'Spare V-belts for conveyors.', ['submitted', 'approved']);
  pr(oil, 600, 165, 15, 'normal', 'maintenance', 'Quarterly hydraulic oil change.', ['submitted', 'rejected']);
  for (const [s, rate, lead] of [[hindalco, 236, 7], [jindal, 244, 9], [tata, 249, 12]] as const) {
    ins(c, 'purchase', 'supplier_quotations', { requisition_id: prAlu.id, supplier_id: s.id, material_id: alu.id, rate, lead_time_days: lead, payment_terms_days: 30, valid_until: day(-14), status: 'received' }, at(2, 12));
  }
  // ── Accounts payable ──
  const inv = (who: string, supplier: BaseRow, no: string, d: number, due: number, lines: [BaseRow, number, number][], po?: BaseRow, g?: BaseRow, status?: string, paid = 0, conf?: number) =>
    ins(c, who, 'invoices', {
      invoice_no: no, supplier_id: supplier.id, invoice_date: day(d), due_date: day(d - due), po_id: po?.id ?? null, grn_id: g?.id ?? null, tax_pct: 18,
      lines: lines.map(([mt, qty, rate]) => ({ material_id: mt.id, qty, rate })), extraction_confidence: conf ?? null, status, paid_amount: paid,
      ...(() => { const sub = lines.reduce((s, [, q, rt]) => s + q * rt, 0); return { subtotal: sub, tax_amount: Math.round(sub * 18) / 100, total: Math.round(sub * 118) / 100 }; })(),
    }, at(d, 12));
  const g = (n: string) => Object.values(grnRows).find((x) => x.po_id === n)!;
  const iTata = inv('finance', tata, 'TSL/24-25/88231', 17, 45, [[coil, 30000, 62]], poCoil, g(poCoil.id), undefined, 0, 97);
  tr(c, 'finance', 'invoices', iTata, 'pending_approval', at(15, 10));
  tr(c, 'ceo', 'invoices', iTata, 'approved', at(14, 11));
  ins(c, 'finance', 'payments', { invoice_id: iTata.id, payment_date: day(10), amount: 1000000, mode: 'rtgs', reference_no: 'UTR2409118812' }, at(10, 12));
  const iPlate = inv('finance', tata, 'TSL/24-25/88412', 15, 45, [[plate, 20000, 58]], poPlate, g(poPlate.id), undefined, 0, 96);
  tr(c, 'finance', 'invoices', iPlate, 'pending_approval', at(13, 10));
  tr(c, 'plant', 'invoices', iPlate, 'approved', at(12, 10), undefined);
  const iBar = inv('finance', jindal, 'JSL/INV/55210', 13, 30, [[bar, 15000, 96]], poBar, g(poBar.id), undefined, 0, 94);
  tr(c, 'finance', 'invoices', iBar, 'pending_approval', at(5, 10));
  inv('finance', hindalco, 'HIL/2409/7731', 13, 30, [[alu, 15000, 238]], poAlu, g(poAlu.id), undefined, 0, 95);
  inv('finance', skf, 'SKF/2026/09/4821', 5, 30, [[brg, 10000, 360]], poSkf, g(poSkf.id), undefined, 0, 94);
  inv('finance', greaves, 'GCL/MB/3110', 4, 30, [[motorB, 18, 21000]], poGreaves, g(poGreaves.id), undefined, 0, 92);
  inv('finance', greaves, 'GCL/MB/3110-A', 3, 30, [[motorB, 18, 21000]], poGreaves, undefined, undefined, 0, 88);
  inv('finance', asian, 'API/HYD/99812', 6, 30, [[primer, 1000, 185], [coolant, 300, 310]], poPaint, g(poPaint.id), undefined, 0, 98);
  inv('finance', bosch, 'BOSCH/IN/220871', 2, 45, [[filt, 100, 950]], poBosch, undefined, undefined, 0, 91);
  // Older bills for ageing.
  for (const [s, no, d, due, mt, q, rt, st] of [
    [asian, 'API/HYD/97710', 75, 30, primer, 300, 182, 'approved'], [bosch, 'BOSCH/IN/219004', 52, 30, filt, 40, 940, 'approved'],
    [skf, 'SKF/2026/07/3310', 95, 30, brgSp, 20, 630, 'approved'], [tata, 'TSL/24-25/86120', 40, 30, coil, 8000, 61, 'paid'],
  ] as const) {
    inv('finance', s, no, d, due, [[mt, q, rt]], undefined, undefined, st, st === 'paid' ? Math.round(q * rt * 118) / 100 : 0);
  }

  // ── Quality ──
  const insp = (stage: string, mt: BaseRow, lot: number, rej: number, d: number, status: string, batch: string, extra: Record<string, unknown> = {}, comment?: string) => {
    let row = ins(c, 'quality', 'inspections', { stage, material_id: mt.id, lot_qty: lot, sample_size: Math.min(lot, 50), accepted_qty: 0, rejected_qty: rej, batch_no: batch, inspection_date: day(d), inspector_id: eDivya.id, status: 'requested', ...extra }, at(d, 11));
    if (status !== 'requested') row = tr(c, 'quality', 'inspections', row, status === 'in_progress' ? 'in_progress' : status, at(d, 15), comment, d > 1);
    return row;
  };
  for (const i of e.rows('inspections', cid).filter((x) => x.stage === 'incoming')) {
    const supplierName = e.name('suppliers', i.supplier_id, cid);
    const daysOld = Math.round((Date.now() - Date.parse(String(i.created_at))) / 86_400_000);
    if (supplierName.startsWith('Greaves')) tr(c, 'quality', 'inspections', i, 'failed', at(5, 16), '2 motors failed no-load current test', false);
    else if (daysOld > 5) tr(c, 'quality', 'inspections', i, 'passed', at(daysOld - 1, 12));
    else if (supplierName.startsWith('SKF')) tr(c, 'quality', 'inspections', i, 'in_progress', at(4, 12));
  }
  insp('in_process', fgFrame, 240, 4, 4, 'passed', 'PRD-L2-W4', { production_order_id: poFrame.id, defect_code_id: dDim.id, findings: '4 units dimensional variance — within tolerance' });
  const b441 = insp('final', fgFrame, 480, 18, 2, 'conditional', 'B-2026-441', { production_order_id: poFrame.id, defect_code_id: dSurface.id, findings: 'Surface finish defect on 18 units — coolant contamination suspected (batch CN-2026-09)' }, 'Accept 462, rework 18');
  insp('final', fgGear, 600, 0, 1, 'passed', 'B-2026-438', { production_order_id: poGear.id, findings: '0 defects' });
  insp('final', fgBracket, 900, 0, 0, 'requested', 'B-2026-445', { production_order_id: poBrkt.id });
  insp('in_process', fgHousing, 400, 0, 0, 'requested', 'B-2026-446', { production_order_id: poHous.id, inspector_id: eFarhan.id });
  insp('final', fgHousing, 400, 9, 7, 'failed', 'B-2026-430', { production_order_id: poHous.id, defect_code_id: dFunc.id, findings: 'Porosity in casting wall', inspector_id: eFarhan.id }, 'Porosity exceeds limit');
  const ncr441 = e.rows('ncrs', cid).find((n) => n.inspection_id === b441.id);
  if (ncr441) {
    tr(c, 'quality', 'ncrs', ncr441, 'investigating', at(1, 10));
    ins(c, 'quality', 'capas', { ncr_id: ncr441.id, root_cause: 'Coolant batch CN-2026-09 contaminated with tramp oil; skimmer not working on Line 1 sump.', corrective_action: 'Swap coolant batch on Line 1; rework 18 frames.', preventive_action: 'Weekly coolant concentration & tramp-oil check added to PM.', owner_id: eDivya.id, due_date: day(-5), status: 'open' }, at(1, 12));
  }

  // ── Maintenance ──
  const pm = (mc: BaseRow, task: string, freq: number, last: number, tech: BaseRow, hrs: number) =>
    ins(c, 'plant', 'pm_schedules', { machine_id: mc.id, task, frequency_days: freq, last_done: day(last), next_due: day(last - freq), technician_id: tech.id, estimated_hours: hrs, active: true }, T0);
  const pmWeld = pm(weld, 'Motor M2 bearing inspection & lubrication', 30, 42, eRavi, 3);
  pm(cnc1, 'Spindle lubrication & backlash check', 30, 12, eSuresh, 2);
  pm(cnc2, 'Spindle lubrication & backlash check', 30, 28, eSuresh, 2);
  pm(press, 'Hydraulic oil & filter change', 90, 20, eKiran, 4);
  pm(comp, 'Compressor oil & separator check', 30, 18, eSuresh, 2);
  pm(conv, 'Conveyor belt tension & wear check', 14, 13, eRavi, 1);
  pm(paint, 'Booth filter replacement', 21, 5, eRavi, 2);
  pm(asm, 'Torque tool calibration', 60, 40, eSuresh, 2);

  const wo = (mc: BaseRow, type: string, priority: string, desc: string, tech: BaseRow | null, d: number, due: number, path: string[], extra: Record<string, unknown> = {}) => {
    const { complete, ...fields } = extra;
    let w = ins(c, type === 'breakdown' ? 'supervisor' : 'plant', 'work_orders', { machine_id: mc.id, wo_type: type, priority, description: desc, assigned_to: tech?.id ?? null, due_date: day(due), status: 'open', ...fields }, at(d, 9), d > 1);
    for (const [i, s] of path.entries()) {
      if (s === 'completed') w = Object.assign(w, complete ?? {});
      w = tr(c, s === 'closed' ? 'plant' : 'tech', 'work_orders', w, s, at(s === 'completed' || s === 'closed' ? Math.max(0, d - 1) : d, 10 + i * 2), s === 'on_hold' ? 'Waiting for spare bearing' : undefined, d > 1);
    }
    return w;
  };
  wo(press, 'breakdown', 'critical', 'Hydraulic seal failure on main cylinder — press stopped', eKiran, 6, 6, ['in_progress', 'completed', 'closed'], {
    downtime_minutes: 180, labour_hours: 5, labour_cost: 1500,
    complete: { parts_used: [{ material_id: filt.id, qty: 2, rate: 940 }, { material_id: oil.id, qty: 60, rate: 162 }], parts_warehouse_id: whSP.id, completion_remarks: 'Seal kit replaced, oil and filters changed, pressure test OK.' },
  });
  wo(weld, 'corrective', 'high', 'Vibration anomaly on Motor M2 — inspect bearings, check alignment', eRavi, 2, 0, ['assigned', 'in_progress'], { pm_schedule_id: pmWeld.id });
  wo(comp, 'inspection', 'medium', 'Oil pressure trending down — inspect separator', eSuresh, 3, -2, ['assigned']);
  wo(conv, 'preventive', 'medium', 'Belt replacement at 2,000 h', eRavi, 1, -3, []);
  wo(cnc1, 'preventive', 'low', 'Coolant tank clean-out', eSuresh, 14, 12, ['in_progress', 'completed', 'closed'], { labour_hours: 2, labour_cost: 600, complete: { parts_used: [{ material_id: coolant.id, qty: 40, rate: 305 }], parts_warehouse_id: whRM.id, completion_remarks: 'Tank cleaned, fresh coolant charged.' } });

  // ── History of reports ──
  for (const [name, d] of [['Weekly Operations Summary', 3], ['AP Ageing', 2], ['OEE by line', 1]] as const) {
    e.t('report_runs').push({ id: uuid(), company_id: cid, created_at: at(d, 8), updated_at: at(d, 8), created_by: actors.plant.userId, report_type: name, format: 'csv', row_count: 0, generated_by_name: 'Srinivas Rao' });
  }

  // ── Live alerts for the last two days ──
  for (const mt of [coil, plate, alu, bar, brg, primer, brgSp, filt]) e.checkLowStock(cid, mt.id, at(0, 8));
  e.notify(cid, { event_type: 'pm_reminder', severity: 'warning', ref_id: pmWeld.id, link: `/maintenance/pm_schedules?id=${pmWeld.id}`, title: 'Overdue: Motor M2 bearing inspection & lubrication', body: `${weld.name} · due ${pmWeld.next_due}` }, at(0, 7));
}

// ════════════════════════════════════════════════════════════════════
// Company 2 — Sri Lakshmi Agro Equipment (separate tenant, smaller)
// ════════════════════════════════════════════════════════════════════
function seedLakshmi(e: DemoEngine, superUser: DemoUser) {
  const cid = uuid();
  e.db.companies.push(company(cid, 'Sri Lakshmi Agro Equipment', 'lakshmi', '#0F766E', '37AAFCS4321Q1Z8', 'Auto Nagar, Vijayawada 520007'));
  const actors = addMembers(e, cid, 'lakshmi.demo', [
    ['company_admin', 'admin', 'Sai Lakshmi'],
    ['ceo', 'ceo', 'K. Narasimha'],
    ['store_keeper', 'store', 'Bhaskar'],
    ['production_supervisor', 'supervisor', 'Gopi'],
  ], superUser);
  const c: Ctx = { e, cid, actors };
  const r = rng(7);
  const T0 = at(30);
  const m = (t: TableName, v: Record<string, unknown>) => ins(c, 'admin', t, v, T0);
  const f = m('factories', { code: 'VJA', name: 'Vijayawada Works', city: 'Vijayawada', active: true });
  const line = m('production_lines', { code: 'A1', name: 'Tiller Assembly', factory_id: f.id, capacity_per_shift: 40, active: true });
  const wh = m('warehouses', { code: 'MAIN', name: 'Main Store', factory_id: f.id, kind: 'general', active: true });
  const fgw = m('warehouses', { code: 'FG', name: 'Finished Goods Yard', factory_id: f.id, kind: 'finished_goods', active: true });
  const s1 = m('shifts', { code: 'G', name: 'General Shift', start_time: '09:00', end_time: '17:30', planned_minutes: 480 });
  m('uoms', { code: 'NOS', name: 'Numbers', decimals: 0 });
  const op = m('employees', { code: 'L01', name: 'Venu', skill: 'operator', factory_id: f.id, active: true });
  const mc1 = m('machines', { code: 'TA-01', name: 'Tiller Assembly Jig', factory_id: f.id, line_id: line.id, machine_type: 'Assembly', criticality: 'high', status: 'running', ideal_cycle_time_sec: 600 });
  m('machines', { code: 'PB-01', name: 'Powder Coating Booth', factory_id: f.id, line_id: line.id, machine_type: 'Paint', criticality: 'medium', status: 'idle', ideal_cycle_time_sec: 300 });
  const sup = m('suppliers', { code: 'V01', name: 'Kirloskar Engines', category: 'Engines', gstin: '27AAACK1234A1Z5', status: 'preferred', payment_terms_days: 30 });
  m('suppliers', { code: 'V02', name: 'Andhra Castings', category: 'Castings', gstin: '37AABCA5678B1Z3', status: 'active', payment_terms_days: 30 });
  const eng = m('materials', { code: 'ENG-7HP', name: 'Diesel Engine 7HP', type: 'raw', uom: 'NOS', min_stock: 20, reorder_level: 90, reorder_qty: 80, standard_cost: 24500, lead_time_days: 15, preferred_supplier_id: sup.id });
  const tine = m('materials', { code: 'TN-SET', name: 'Rotavator Tine Set', type: 'raw', uom: 'SET', min_stock: 30, reorder_level: 60, reorder_qty: 120, standard_cost: 3200, lead_time_days: 7 });
  const tiller = m('materials', { code: 'FG-PT7', name: 'Power Tiller PT-7', type: 'fg', uom: 'NOS', standard_cost: 52000, selling_price: 68500 });
  m('customers', { code: 'D01', name: 'Godavari Agri Dealers', city: 'Rajahmundry', gstin: '37AAGCG1111C1Z1', payment_terms_days: 30 });
  m('customers', { code: 'D02', name: 'Krishna Farm Mart', city: 'Guntur', gstin: '37AAHCK2222D1Z2', payment_terms_days: 30 });
  ins(c, 'store', 'stock_movements', { movement_type: 'in', material_id: eng.id, qty: 780, warehouse_id: wh.id, batch_no: 'OPEN', reason: 'opening_balance', unit_cost: 24500, movement_date: day(25) }, at(25));
  ins(c, 'store', 'stock_movements', { movement_type: 'in', material_id: tine.id, qty: 900, warehouse_id: wh.id, batch_no: 'OPEN', reason: 'opening_balance', unit_cost: 3200, movement_date: day(25) }, at(25));
  let order = ins(c, 'admin', 'production_orders', { product_id: tiller.id, line_id: line.id, machine_id: mc1.id, planned_qty: 600, planned_start: day(20), planned_end: day(-5), output_warehouse_id: fgw.id, status: 'planned' }, at(20));
  order = c.e.transition(actors.admin, 'production_orders', order.id, 'released', undefined, { trusted: true, at: at(20, 10) });
  for (let d = 20; d >= 1; d--) {
    const actual = 30 + Math.floor(r() * 12);
    ins(c, 'supervisor', 'shift_reports', { report_date: day(d), shift_id: s1.id, line_id: line.id, machine_id: mc1.id, production_order_id: order.id, operator_id: op.id, target_qty: 40, actual_qty: actual, rejected_qty: Math.floor(r() * 2), planned_minutes: 480, downtime_minutes: Math.floor(r() * 40), downtime_reason: 'changeover', status: 'verified' }, at(d, 17, 40));
    ins(c, 'store', 'stock_movements', { movement_type: 'out', material_id: eng.id, qty: actual, warehouse_id: wh.id, reason: 'production_issue', reference: `Issue ${day(d)}`, movement_date: day(d) }, at(d, 18));
    ins(c, 'store', 'stock_movements', { movement_type: 'out', material_id: tine.id, qty: actual, warehouse_id: wh.id, reason: 'production_issue', reference: `Issue ${day(d)}`, movement_date: day(d) }, at(d, 18, 1));
  }
  const p = ins(c, 'admin', 'purchase_orders', { supplier_id: sup.id, po_date: day(4), expected_date: day(-11), delivery_warehouse_id: wh.id, tax_pct: 28, lines: [{ material_id: eng.id, qty: 80, rate: 24500, received_qty: 0 }], status: 'draft' }, at(4));
  c.e.transition(actors.admin, 'purchase_orders', p.id, 'pending_approval', undefined, { trusted: true, at: at(4, 11), silent: true });
  e.checkLowStock(cid, eng.id, at(0, 8));
  e.checkLowStock(cid, tine.id, at(0, 8));
}
