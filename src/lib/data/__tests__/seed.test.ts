import { describe, expect, it } from 'vitest';
import { buildDemoDB } from '../seed';
import { DemoEngine } from '../demoEngine';

describe('demo seed', () => {
  const db = buildDemoDB();
  const e = new DemoEngine(db);
  const [apex, lakshmi] = db.companies;

  it('creates two isolated companies', () => {
    expect(db.companies).toHaveLength(2);
    const apexMaterials = e.rows('materials', apex.id).map((m) => m.id);
    const lakshmiMaterials = e.rows('materials', lakshmi.id).map((m) => m.id);
    expect(apexMaterials.length).toBeGreaterThan(10);
    expect(lakshmiMaterials.some((id) => apexMaterials.includes(id))).toBe(false);
  });

  it('never leaves negative stock', () => {
    for (const b of db.tables.stock_balances ?? []) expect(Number(b.qty)).toBeGreaterThanOrEqual(0);
  });

  it('derives invoice match status from PO and GRN', () => {
    const inv = (no: string) => e.rows('invoices', apex.id).find((i) => i.invoice_no === no)!;
    expect(inv('SKF/2026/09/4821').match_status).toBe('exception');
    expect((inv('SKF/2026/09/4821').exceptions as string[]).join(' ')).toMatch(/Price variance \+16\.1%/);
    expect(inv('HIL/2409/7731').match_status).toBe('matched');
    expect((inv('BOSCH/IN/220871').exceptions as string[]).join(' ')).toMatch(/GRN not received/);
    expect((inv('GCL/MB/3110-A').exceptions as string[]).join(' ')).toMatch(/duplicate/i);
    expect(inv('TSL/24-25/88231').status).toBe('partially_paid');
  });

  it('raises low-stock alerts for the materials that are actually low', () => {
    const titles = e.rows('notifications', apex.id).filter((n) => n.event_type === 'low_stock').map((n) => String(n.title));
    expect(titles.some((t) => t.includes('Steel Coil A'))).toBe(true);
    expect(titles.some((t) => t.includes('Bearing SKF-6204'))).toBe(true);
  });

  it('posts production output into finished goods', () => {
    const fg = e.rows('materials', apex.id).find((m) => m.code === 'FG-GUD5')!;
    const onHand = e.rows('stock_balances', apex.id).filter((b) => b.material_id === fg.id).reduce((s, b) => s + Number(b.qty), 0);
    expect(onHand).toBeGreaterThan(1800);
  });

  it('fits comfortably in localStorage', () => {
    expect(JSON.stringify(db).length).toBeLessThan(3_500_000);
  });
});
