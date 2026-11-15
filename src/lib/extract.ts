import type { BaseRow } from '@/lib/data/schema';

export interface Extraction {
  values: Record<string, unknown>;
  found: string[];
  missing: string[];
  method: 'rule_based' | 'ai';
  /** Share of expected fields found (rule-based); model-reported for AI. */
  confidence: number;
  notes: string[];
}

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

export function parseDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = t.match(/(\d{1,2})[\s-]+([A-Za-z]{3})[a-z]*[\s,-]+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  return null;
}

const amount = (s: string) => Number(s.replace(/[₹,\s]|Rs\.?|INR/gi, ''));

function find(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function matchRow(text: string, rows: BaseRow[], keys: string[]): BaseRow | undefined {
  const t = text.toLowerCase();
  let best: { r: BaseRow; len: number } | undefined;
  for (const r of rows) {
    for (const k of keys) {
      const v = String(r[k] ?? '').trim().toLowerCase();
      if (v.length >= 3 && t.includes(v) && (!best || v.length > best.len)) best = { r, len: v.length };
    }
  }
  return best?.r;
}

export async function fileText(file: File): Promise<string | null> {
  if (/^text\/|\/csv$|json$/.test(file.type) || /\.(txt|csv|eml|json)$/i.test(file.name)) return file.text();
  return null;
}

/** Transparent, deterministic parser for text RFQs/emails. Not AI. */
export function parseRfq(text: string, ctx: { customers: BaseRow[]; products: BaseRow[] }): Extraction {
  const v: Record<string, unknown> = {};
  const notes: string[] = [];
  const cust = matchRow(text, ctx.customers, ['name', 'gstin', 'code']);
  if (cust) v.customer_id = cust.id;
  const prod = matchRow(text, ctx.products, ['name', 'code']);
  if (prod) v.product_id = prod.id;
  const q = find(text, [/(?:qty|quantity|requirement)\s*[:-]?\s*([\d,]+)/i, /([\d,]{2,})\s*(?:nos|pcs|units|numbers)\b/i]);
  if (q) v.quantity = amount(q);
  const by = find(text, [/(?:required by|delivery by|delivery date|need by)\s*[:-]?\s*([^\n]+)/i]);
  if (by && parseDate(by)) v.required_by = parseDate(by);
  const price = find(text, [/(?:target price|budget|price)\s*[:-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/i]);
  if (price) v.target_price = amount(price);
  const ref = find(text, [/(?:rfq|enquiry|inquiry)\s*(?:no\.?|number|#|ref)\s*[:-]?\s*([A-Z0-9/-]{3,})/i]);
  if (ref) v.customer_ref = ref;
  const spec = find(text, [/(?:spec(?:ification)?s?)\s*[:-]\s*([^\n]+)/i]);
  v.specification = spec ?? text.slice(0, 600);
  if (!cust) notes.push('Customer not recognised — choose from the customer master.');
  if (!prod) notes.push('Product not recognised — choose from the product master.');
  const expected = ['customer_id', 'product_id', 'quantity', 'required_by', 'target_price', 'customer_ref'];
  const found = expected.filter((k) => v[k] !== undefined);
  return { values: { ...v, source: 'document_upload' }, found, missing: expected.filter((k) => !found.includes(k)), method: 'rule_based', confidence: found.length / expected.length, notes };
}

export function parseInvoice(text: string, ctx: { suppliers: BaseRow[]; materials: BaseRow[]; pos: BaseRow[] }): Extraction {
  const v: Record<string, unknown> = {};
  const notes: string[] = [];
  const gstin = text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/)?.[1];
  const sup = (gstin && ctx.suppliers.find((s) => s.gstin === gstin)) || matchRow(text, ctx.suppliers, ['name']);
  if (sup) v.supplier_id = sup.id;
  else if (gstin) notes.push(`GSTIN ${gstin} does not match any supplier in the vendor master.`);
  const no = find(text, [/(?:invoice|bill)\s*(?:no\.?|number|#)\s*[:-]?\s*([A-Z0-9/-]{3,})/i]);
  if (no) v.invoice_no = no;
  const d = find(text, [/(?:invoice|bill)\s*date\s*[:-]?\s*([^\n]+)/i, /\bdate\s*[:-]?\s*([^\n]+)/i]);
  if (d && parseDate(d)) v.invoice_date = parseDate(d);
  const due = find(text, [/due\s*date\s*[:-]?\s*([^\n]+)/i]);
  if (due && parseDate(due)) v.due_date = parseDate(due);
  const poNo = text.match(/\b(PO-\d{4}-\d{3,})\b/i)?.[1];
  const po = poNo ? ctx.pos.find((p) => String(p.number).toLowerCase() === poNo.toLowerCase()) : undefined;
  if (po) {
    v.po_id = po.id;
    if (!v.supplier_id) v.supplier_id = po.supplier_id;
  } else if (poNo) notes.push(`PO ${poNo} not found.`);
  const lines: { material_id: string; qty: number; rate: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const mat = matchRow(raw, ctx.materials, ['name', 'code', 'hsn_code']);
    const nums = [...raw.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map((x) => amount(x[1])).filter((n) => n > 0);
    if (mat && nums.length >= 2) lines.push({ material_id: mat.id, qty: nums[nums.length - 3] ?? nums[0], rate: nums[nums.length - 2] ?? nums[1] });
  }
  if (lines.length) v.lines = lines;
  const tax = find(text, [/(?:gst|igst|cgst\s*\+\s*sgst)\s*@?\s*(\d{1,2})\s*%/i]);
  if (tax) v.tax_pct = Number(tax);
  const total = find(text, [/(?:grand total|total amount|amount payable|total)\s*[:-]?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/i]);
  if (total) notes.push(`Document total ₹${amount(total).toLocaleString('en-IN')} — verify against computed total.`);
  const expected = ['supplier_id', 'invoice_no', 'invoice_date', 'due_date', 'po_id', 'lines'];
  const found = expected.filter((k) => v[k] !== undefined);
  return { values: v, found, missing: expected.filter((k) => !found.includes(k)), method: 'rule_based', confidence: found.length / expected.length, notes };
}
