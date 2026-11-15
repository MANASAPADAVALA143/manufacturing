import type { CompanySettings, LineItem } from '@/lib/data/schema';

// ─── OEE ───
export interface OeeInput {
  planned_minutes: number;
  downtime_minutes: number;
  actual_qty: number;
  rejected_qty: number;
  ideal_cycle_time_sec: number;
}

export interface Oee {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

/**
 * Standard OEE = Availability × Performance × Quality.
 * Availability = run time / planned time; Performance = (ideal cycle × total count) / run time,
 * capped at 1; Quality = good count / total count.
 */
export function computeOee(rows: OeeInput[]): Oee | null {
  let planned = 0, run = 0, ideal = 0, total = 0, good = 0;
  for (const r of rows) {
    const p = Math.max(0, r.planned_minutes);
    const d = Math.min(p, Math.max(0, r.downtime_minutes));
    planned += p;
    run += p - d;
    ideal += (Math.max(0, r.actual_qty) * Math.max(0, r.ideal_cycle_time_sec)) / 60;
    total += Math.max(0, r.actual_qty);
    good += Math.max(0, r.actual_qty - r.rejected_qty);
  }
  if (planned <= 0) return null;
  const availability = run / planned;
  const performance = run > 0 ? Math.min(1, ideal / run) : 0;
  const quality = total > 0 ? good / total : 0;
  return { availability, performance, quality, oee: availability * performance * quality };
}

// ─── AP 3-way match ───
export interface MatchContext {
  invoice: { id?: string; supplier_id: string; invoice_no: string; invoice_date: string; total: number; lines: LineItem[]; po_id?: string | null };
  po?: { id: string; supplier_id: string; lines: LineItem[]; status: string } | null;
  /** Posted GRNs against the PO. */
  grns: { lines: LineItem[] }[];
  /** Other non-rejected invoices from the same supplier. */
  otherInvoices: { id: string; number: string; invoice_no: string; invoice_date: string; total: number; lines?: LineItem[] }[];
  /** Quantity already billed on other invoices against the same PO, by material. */
  billedElsewhere?: Record<string, number>;
  settings: Pick<CompanySettings, 'ap_price_tolerance_pct' | 'ap_qty_tolerance_pct' | 'duplicate_window_days'>;
}

export interface MatchResult {
  match_status: 'matched' | 'exception';
  exceptions: string[];
  duplicate_of: string | null;
  /** Hard duplicate: same supplier invoice number already recorded. */
  hardDuplicate: boolean;
}

const norm = (s: string) => s.replace(/[\s/\\-]/g, '').toUpperCase();

export function matchInvoice(ctx: MatchContext): MatchResult {
  const { invoice, po, grns, otherInvoices, settings } = ctx;
  const exceptions: string[] = [];
  let duplicate_of: string | null = null;
  let hardDuplicate = false;

  const exact = otherInvoices.find((o) => o.id !== invoice.id && norm(o.invoice_no) === norm(invoice.invoice_no));
  if (exact) {
    hardDuplicate = true;
    duplicate_of = exact.id;
    exceptions.push(`Duplicate: invoice no. ${invoice.invoice_no} already recorded as ${exact.number}`);
  } else {
    const windowMs = settings.duplicate_window_days * 86_400_000;
    const soft = otherInvoices.find(
      (o) =>
        o.id !== invoice.id &&
        Math.abs(o.total - invoice.total) < 1 &&
        Math.abs(Date.parse(o.invoice_date) - Date.parse(invoice.invoice_date)) <= windowMs,
    );
    if (soft) {
      duplicate_of = soft.id;
      exceptions.push(`Possible duplicate: same amount as ${soft.number} (${soft.invoice_no}) within ${settings.duplicate_window_days} days`);
    }
  }

  if (!po) {
    exceptions.push('No purchase order reference');
  } else {
    if (po.supplier_id !== invoice.supplier_id) exceptions.push('Supplier on invoice differs from PO supplier');
    if (['draft', 'pending_approval', 'cancelled'].includes(po.status)) exceptions.push(`PO is ${po.status.replace('_', ' ')}`);
    const received: Record<string, number> = {};
    for (const g of grns) for (const l of g.lines) {
      received[l.material_id] = (received[l.material_id] ?? 0) + (Number(l.qty) || 0) - (Number(l.rejected_qty) || 0);
    }
    if (grns.length === 0) exceptions.push('GRN not received yet');
    for (const line of invoice.lines) {
      const poLine = po.lines.find((p) => p.material_id === line.material_id);
      if (!poLine) {
        exceptions.push('Invoice contains an item that is not on the PO');
        continue;
      }
      const priceVar = poLine.rate > 0 ? ((line.rate - poLine.rate) / poLine.rate) * 100 : 0;
      if (Math.abs(priceVar) > settings.ap_price_tolerance_pct) {
        exceptions.push(`Price variance ${priceVar > 0 ? '+' : ''}${priceVar.toFixed(1)}% vs PO rate ${poLine.rate}`);
      }
      const qtyTol = 1 + settings.ap_qty_tolerance_pct / 100;
      if (line.qty > poLine.qty * qtyTol) exceptions.push(`Billed qty ${line.qty} exceeds PO qty ${poLine.qty}`);
      if (grns.length > 0) {
        const avail = (received[line.material_id] ?? 0) - (ctx.billedElsewhere?.[line.material_id] ?? 0);
        if (line.qty > avail * qtyTol + 1e-9) exceptions.push(`Billed qty ${line.qty} exceeds accepted GRN qty ${Math.max(0, avail)}`);
      }
    }
  }
  return { match_status: exceptions.length ? 'exception' : 'matched', exceptions, duplicate_of, hardDuplicate };
}

// ─── Stock ───
export interface BalanceSlot { id: string; batch_no: string; bin_id?: string | null; qty: number; created_at: string }

/** FIFO consumption plan across batches. Throws if not enough stock. */
export function planConsumption(slots: BalanceSlot[], qty: number, batch?: string | null): { id: string; take: number }[] {
  const pool = slots
    .filter((s) => s.qty > 0 && (!batch || s.batch_no === batch))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const available = pool.reduce((s, x) => s + x.qty, 0);
  if (available + 1e-9 < qty) {
    throw new Error(`Insufficient stock: requested ${qty}, available ${round(available)}${batch ? ` in batch ${batch}` : ''}`);
  }
  const plan: { id: string; take: number }[] = [];
  let left = qty;
  for (const s of pool) {
    if (left <= 1e-9) break;
    const take = Math.min(s.qty, left);
    plan.push({ id: s.id, take });
    left -= take;
  }
  return plan;
}

/** Days of cover = on-hand / average daily consumption over the window. */
export function daysOfCover(onHand: number, consumedInWindow: number, windowDays: number): number | null {
  const daily = consumedInWindow / windowDays;
  if (daily <= 0) return null;
  return onHand / daily;
}

// ─── AP ageing ───
export const AGEING_BUCKETS = ['Not due', '0–30', '31–60', '61–90', '90+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function ageingBucket(dueDate: string, asOf: Date = new Date()): AgeingBucket {
  const days = Math.floor((asOf.getTime() - Date.parse(dueDate)) / 86_400_000);
  if (days < 0) return 'Not due';
  if (days <= 30) return '0–30';
  if (days <= 60) return '31–60';
  if (days <= 90) return '61–90';
  return '90+';
}

export const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
