import { describe, expect, it } from 'vitest';
import { ageingBucket, computeOee, daysOfCover, matchInvoice, planConsumption } from '../domain';
import { nextAttemptDelayMs } from '../automation';
import { parseDate, parseInvoice, parseRfq } from '../extract';
import type { BaseRow } from '../data/schema';

describe('OEE', () => {
  it('multiplies availability, performance and quality', () => {
    // 480 min planned, 60 down → A = 0.875; 400 units × 60 s = 400 min of 420 run → P ≈ 0.952; 380 good → Q = 0.95
    const o = computeOee([{ planned_minutes: 480, downtime_minutes: 60, actual_qty: 400, rejected_qty: 20, ideal_cycle_time_sec: 60 }])!;
    expect(o.availability).toBeCloseTo(0.875);
    expect(o.performance).toBeCloseTo(400 / 420);
    expect(o.quality).toBeCloseTo(0.95);
    expect(o.oee).toBeCloseTo(0.875 * (400 / 420) * 0.95);
  });
  it('caps performance at 100% and handles empty input', () => {
    expect(computeOee([{ planned_minutes: 60, downtime_minutes: 0, actual_qty: 1000, rejected_qty: 0, ideal_cycle_time_sec: 60 }])!.performance).toBe(1);
    expect(computeOee([])).toBeNull();
  });
});

describe('3-way match', () => {
  const settings = { ap_price_tolerance_pct: 2, ap_qty_tolerance_pct: 0, duplicate_window_days: 90 };
  const po = { id: 'po', supplier_id: 's', status: 'sent', lines: [{ material_id: 'm', qty: 100, rate: 10 }] };
  const inv = (o: Partial<Parameters<typeof matchInvoice>[0]['invoice']> = {}) => ({ id: 'i', supplier_id: 's', invoice_no: 'A/1', invoice_date: '2026-11-01', total: 1180, lines: [{ material_id: 'm', qty: 100, rate: 10 }], po_id: 'po', ...o });

  it('matches when PO, GRN and invoice agree', () => {
    const r = matchInvoice({ invoice: inv(), po, grns: [{ lines: [{ material_id: 'm', qty: 100, rate: 10 }] }], otherInvoices: [], settings });
    expect(r).toMatchObject({ match_status: 'matched', exceptions: [] });
  });
  it('flags price variance beyond tolerance, missing GRN and no PO', () => {
    expect(matchInvoice({ invoice: inv({ lines: [{ material_id: 'm', qty: 100, rate: 11.6 }] }), po, grns: [{ lines: [{ material_id: 'm', qty: 100, rate: 10 }] }], otherInvoices: [], settings }).exceptions[0]).toMatch(/\+16\.0%/);
    expect(matchInvoice({ invoice: inv(), po, grns: [], otherInvoices: [], settings }).exceptions).toContain('GRN not received yet');
    expect(matchInvoice({ invoice: inv({ po_id: null }), po: null, grns: [], otherInvoices: [], settings }).exceptions).toContain('No purchase order reference');
  });
  it('detects exact and possible duplicates', () => {
    const exact = matchInvoice({ invoice: inv(), po, grns: [], otherInvoices: [{ id: 'x', number: 'BILL-1', invoice_no: 'a-1', invoice_date: '2026-10-01', total: 5 }], settings });
    expect(exact.hardDuplicate).toBe(true);
    const soft = matchInvoice({ invoice: inv(), po, grns: [], otherInvoices: [{ id: 'x', number: 'BILL-2', invoice_no: 'Z9', invoice_date: '2026-10-20', total: 1180 }], settings });
    expect(soft.hardDuplicate).toBe(false);
    expect(soft.exceptions[0]).toMatch(/Possible duplicate/);
  });
  it('accounts for quantities already billed against the same GRN', () => {
    const r = matchInvoice({ invoice: inv({ lines: [{ material_id: 'm', qty: 60, rate: 10 }] }), po, grns: [{ lines: [{ material_id: 'm', qty: 100, rejected_qty: 0, rate: 10 }] }], otherInvoices: [], billedElsewhere: { m: 50 }, settings });
    expect(r.exceptions.join()).toMatch(/exceeds accepted GRN qty 50/);
  });
});

describe('stock', () => {
  const slots = [
    { id: 'b', batch_no: 'B2', qty: 50, created_at: '2026-02-01' },
    { id: 'a', batch_no: 'B1', qty: 30, created_at: '2026-01-01' },
  ];
  it('consumes FIFO across batches', () => {
    expect(planConsumption(slots, 40)).toEqual([{ id: 'a', take: 30 }, { id: 'b', take: 10 }]);
  });
  it('honours a requested batch and refuses to go negative', () => {
    expect(planConsumption(slots, 20, 'B2')).toEqual([{ id: 'b', take: 20 }]);
    expect(() => planConsumption(slots, 81)).toThrow(/Insufficient stock/);
    expect(() => planConsumption(slots, 31, 'B1')).toThrow(/in batch B1/);
  });
  it('computes days of cover', () => {
    expect(daysOfCover(600, 3000, 30)).toBe(6);
    expect(daysOfCover(100, 0, 30)).toBeNull();
  });
});

describe('ageing & retry schedule', () => {
  it('buckets by days past due', () => {
    const asOf = new Date('2026-11-13T00:00:00');
    expect(ageingBucket('2026-11-20', asOf)).toBe('Not due');
    expect(ageingBucket('2026-11-01', asOf)).toBe('0–30');
    expect(ageingBucket('2026-08-01', asOf)).toBe('90+');
  });
  it('backs off 1, 4, 16, 64 minutes', () => {
    expect([1, 2, 3, 4].map((a) => nextAttemptDelayMs(a) / 60_000)).toEqual([1, 4, 16, 64]);
  });
});

describe('document parsing (rule-based)', () => {
  const r = (o: Record<string, unknown>) => ({ id: String(o.id), company_id: 'c', created_at: '', updated_at: '', ...o }) as BaseRow;
  it('parses dates in Indian formats', () => {
    expect(parseDate('15/09/2026')).toBe('2026-09-15');
    expect(parseDate('15 Sep 2026')).toBe('2026-09-15');
  });
  it('extracts invoice fields and identifies the vendor by GSTIN', () => {
    const ex = parseInvoice('SKF India\nGSTIN 27AABCS1681G1ZN\nInvoice No: SKF/2026/09/4821\nInvoice Date: 15/09/2026\nDue Date: 15/10/2026\nPO-2026-0005\nBearing SKF-6204 500 360 180000\nGST @18%',
      { suppliers: [r({ id: 's1', name: 'SKF India Ltd', gstin: '27AABCS1681G1ZN' })], materials: [r({ id: 'm1', name: 'Bearing SKF-6204', code: 'CP-SKF-6204' })], pos: [r({ id: 'p1', number: 'PO-2026-0005', supplier_id: 's1' })] });
    expect(ex.values).toMatchObject({ supplier_id: 's1', invoice_no: 'SKF/2026/09/4821', invoice_date: '2026-09-15', due_date: '2026-10-15', po_id: 'p1', tax_pct: 18 });
    expect(ex.values.lines).toEqual([{ material_id: 'm1', qty: 500, rate: 360 }]);
    expect(ex.missing).toEqual([]);
  });
  it('reports missing fields instead of guessing', () => {
    const ex = parseRfq('Hello, please quote.', { customers: [], products: [] });
    expect(ex.found).toEqual([]);
    expect(ex.notes.length).toBeGreaterThan(0);
  });
});
