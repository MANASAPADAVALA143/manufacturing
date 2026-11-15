// OCR + field extraction for supplier invoices and customer RFQs using a vision-capable
// model. Vendor / PO / material matching is done against the caller's own records (RLS).
import { handler, HttpError, json, requireMember, requireUser } from '../_shared/http.ts';
import { chatJson } from '../_shared/llm.ts';

const MAX_BYTES = 10 * 1024 * 1024;
type Row = Record<string, unknown>;

Deno.serve(handler(async (req) => {
  const { sb } = await requireUser(req);
  const { kind, mime_type, data_base64, company_id } = await req.json();
  if (!['invoice', 'rfq'].includes(kind)) throw new HttpError(400, 'kind must be invoice or rfq');
  const company = await requireMember(sb, company_id);
  if (typeof data_base64 !== 'string' || data_base64.length * 0.75 > MAX_BYTES) throw new HttpError(413, 'File too large (max 10 MB)');
  const isImage = /^image\/(png|jpe?g|webp|heic)$/.test(String(mime_type));
  const isPdf = mime_type === 'application/pdf';
  if (!isImage && !(isPdf && Deno.env.get('AI_SUPPORTS_PDF') === 'true')) {
    throw new HttpError(415, isPdf ? 'PDF extraction needs a model with PDF input (set AI_SUPPORTS_PDF=true) — upload a photo/scan instead' : 'Unsupported file type');
  }

  const schema = kind === 'invoice'
    ? '{"supplier_name":string|null,"supplier_gstin":string|null,"invoice_no":string|null,"invoice_date":"YYYY-MM-DD"|null,"due_date":"YYYY-MM-DD"|null,"po_number":string|null,"tax_pct":number|null,"lines":[{"description":string,"qty":number,"rate":number}],"total":number|null,"confidence":number}'
    : '{"customer_name":string|null,"customer_ref":string|null,"product":string|null,"quantity":number|null,"target_price":number|null,"required_by":"YYYY-MM-DD"|null,"specification":string|null,"confidence":number}';
  const content = isPdf
    ? [{ type: 'file', file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${data_base64}` } }]
    : [{ type: 'image_url', image_url: { url: `data:${mime_type};base64,${data_base64}` } }];
  const x = await chatJson<Record<string, unknown>>([
    { role: 'system', content: `Extract fields from the ${kind === 'invoice' ? 'Indian GST supplier invoice' : 'customer request for quotation'}. Copy values exactly as printed; use null when a field is not visible — never guess. "confidence" is 0–1 for the whole extraction. Reply with JSON only matching: ${schema}` },
    { role: 'user', content },
  ], { model: Deno.env.get('AI_VISION_MODEL') ?? undefined, maxTokens: 1200 });

  const values: Record<string, unknown> = {};
  const notes: string[] = [];
  const like = (rows: Row[], v: unknown, keys: string[]) => {
    const s = String(v ?? '').toLowerCase().trim();
    return s ? rows.find((r) => keys.some((k) => { const t = String(r[k] ?? '').toLowerCase(); return t && (t === s || s.includes(t) || t.includes(s)); })) : undefined;
  };
  const { data: materials } = await sb.from('materials').select('id, name, code').eq('company_id', company.id);
  if (kind === 'invoice') {
    const { data: suppliers } = await sb.from('suppliers').select('id, name, gstin').eq('company_id', company.id);
    const sup: Row | undefined = (x.supplier_gstin ? suppliers?.find((s) => s.gstin === x.supplier_gstin) : undefined) ?? like(suppliers ?? [], x.supplier_name, ['name']);
    if (sup) values.supplier_id = sup.id; else notes.push(`Vendor "${x.supplier_name ?? x.supplier_gstin ?? 'unknown'}" not found in vendor master.`);
    if (x.po_number) {
      const { data: po } = await sb.from('purchase_orders').select('id, supplier_id').eq('company_id', company.id).eq('number', x.po_number).maybeSingle();
      if (po) { values.po_id = po.id; values.supplier_id ??= po.supplier_id; } else notes.push(`PO ${x.po_number} not found.`);
    }
    for (const k of ['invoice_no', 'invoice_date', 'due_date', 'tax_pct'] as const) if (x[k] !== null && x[k] !== undefined) values[k] = x[k];
    const lines = ((x.lines as Row[]) ?? []).map((l) => ({ m: like(materials ?? [], l.description, ['name', 'code']), qty: Number(l.qty), rate: Number(l.rate), d: l.description }));
    for (const l of lines.filter((l) => !l.m)) notes.push(`Line "${l.d}" did not match a material.`);
    if (lines.some((l) => l.m)) values.lines = lines.filter((l) => l.m).map((l) => ({ material_id: (l.m as Row).id, qty: l.qty, rate: l.rate }));
    if (x.total) notes.push(`Document total ₹${Number(x.total).toLocaleString('en-IN')} — verify against computed total.`);
  } else {
    const { data: customers } = await sb.from('customers').select('id, name').eq('company_id', company.id);
    const c = like(customers ?? [], x.customer_name, ['name']);
    if (c) values.customer_id = c.id; else notes.push(`Customer "${x.customer_name ?? 'unknown'}" not found.`);
    const p = like(materials ?? [], x.product, ['name', 'code']);
    if (p) values.product_id = p.id; else if (x.product) notes.push(`Product "${x.product}" not found.`);
    for (const k of ['customer_ref', 'quantity', 'target_price', 'required_by', 'specification'] as const) if (x[k] !== null && x[k] !== undefined) values[k] = x[k];
    values.source = 'document_upload';
  }
  const expected = kind === 'invoice' ? ['supplier_id', 'invoice_no', 'invoice_date', 'due_date', 'po_id', 'lines'] : ['customer_id', 'product_id', 'quantity', 'required_by', 'target_price', 'customer_ref'];
  const found = expected.filter((k) => values[k] !== undefined);
  if (kind === 'invoice') values.extraction_confidence = Math.round(Number(x.confidence ?? 0) * 100);
  return json(req, { values, found, missing: expected.filter((k) => !found.includes(k)), method: 'ai', confidence: Math.max(0, Math.min(1, Number(x.confidence ?? 0))), notes });
}));
