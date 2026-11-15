// Grounded Q&A over the caller's company data. All reads use the CALLER's JWT, so RLS
// limits the facts to what that user may see. The model is told to use only these facts.
import { handler, HttpError, json, requireMember, requireUser } from '../_shared/http.ts';
import { chatJson } from '../_shared/llm.ts';

type Row = Record<string, unknown>;
const n = (x: unknown) => Number(x) || 0;
const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

Deno.serve(handler(async (req) => {
  const { sb } = await requireUser(req);
  const { question, company_id } = await req.json();
  if (typeof question !== 'string' || question.trim().length < 3 || question.length > 500) throw new HttpError(400, 'Ask a question of 3–500 characters');
  const company = await requireMember(sb, company_id);

  const q = async (table: string, build: (b: ReturnType<typeof sb.from>) => unknown) => {
    const { data } = (await (build(sb.from(table)) as Promise<{ data: Row[] | null }>)) ?? { data: [] };
    return data ?? [];
  };
  const [reports, machines, lines, materials, balances, issues, pos, invoices, wos, pms, ships] = await Promise.all([
    q('shift_reports', (b) => b.select('report_date, line_id, machine_id, product_id, target_qty, actual_qty, rejected_qty, planned_minutes, downtime_minutes, downtime_reason').eq('company_id', company.id).gte('report_date', day(7)).limit(2000)),
    q('machines', (b) => b.select('id, name, status, ideal_cycle_time_sec').eq('company_id', company.id)),
    q('production_lines', (b) => b.select('id, name').eq('company_id', company.id)),
    q('materials', (b) => b.select('id, name, type, uom, reorder_level, lead_time_days, standard_cost').eq('company_id', company.id)),
    q('stock_balances', (b) => b.select('material_id, qty').eq('company_id', company.id)),
    q('stock_movements', (b) => b.select('material_id, qty').eq('company_id', company.id).eq('reason', 'production_issue').gte('movement_date', day(30)).limit(5000)),
    q('purchase_orders', (b) => b.select('number, supplier_id, status, expected_date, total').eq('company_id', company.id).in('status', ['approved', 'sent', 'partially_received'])),
    q('invoices', (b) => b.select('invoice_no, status, due_date, total, paid_amount, exceptions').eq('company_id', company.id).not('status', 'in', '(paid,rejected)')),
    q('work_orders', (b) => b.select('number, machine_id, wo_type, priority, status').eq('company_id', company.id).in('status', ['open', 'assigned', 'in_progress', 'on_hold'])),
    q('pm_schedules', (b) => b.select('task, machine_id, next_due').eq('company_id', company.id).eq('active', true).lte('next_due', day(-7))),
    q('shipments', (b) => b.select('number, destination, status, eta').eq('company_id', company.id).in('status', ['dispatched', 'in_transit', 'delayed'])),
  ]);

  const name = (rows: Row[], id: unknown) => String(rows.find((r) => r.id === id)?.name ?? 'unknown');
  const byMachine: Record<string, { downtime: number; target: number; actual: number; rejected: number }> = {};
  for (const r of reports) {
    const k = name(machines, r.machine_id);
    const e = (byMachine[k] ??= { downtime: 0, target: 0, actual: 0, rejected: 0 });
    e.downtime += n(r.downtime_minutes); e.target += n(r.target_qty); e.actual += n(r.actual_qty); e.rejected += n(r.rejected_qty);
  }
  const onHand: Record<string, number> = {};
  for (const b of balances) onHand[String(b.material_id)] = (onHand[String(b.material_id)] ?? 0) + n(b.qty);
  const used: Record<string, number> = {};
  for (const m of issues) used[String(m.material_id)] = (used[String(m.material_id)] ?? 0) + n(m.qty);
  const today = day(0);
  const facts = {
    company: company.name,
    as_of: new Date().toISOString(),
    production_last_7_days_by_machine: byMachine,
    production_today: reports.filter((r) => r.report_date === today).reduce<{ target: number; good: number }>((a, r) => ({ target: a.target + n(r.target_qty), good: a.good + n(r.actual_qty) - n(r.rejected_qty) }), { target: 0, good: 0 }),
    lines: lines.map((l) => l.name),
    machines_down: machines.filter((m) => m.status === 'breakdown').map((m) => m.name),
    stock_cover: materials.map((m) => ({ material: m.name, type: m.type, on_hand: onHand[String(m.id)] ?? 0, uom: m.uom, reorder_level: m.reorder_level, lead_time_days: m.lead_time_days,
      days_cover: used[String(m.id)] ? +(((onHand[String(m.id)] ?? 0) / (used[String(m.id)] / 30)).toFixed(1)) : null })).filter((m) => m.days_cover !== null || n(m.reorder_level) > 0),
    delayed_purchase_orders: pos.filter((p) => String(p.expected_date) < today),
    open_invoices: invoices.map((i) => ({ ...i, overdue: String(i.due_date) < today })),
    open_work_orders: wos.map((w) => ({ ...w, machine: name(machines, w.machine_id) })),
    pm_due_within_7_days: pms.map((p) => ({ ...p, machine: name(machines, p.machine_id) })),
    active_shipments: ships,
    not_recorded: ['direct labour cost', 'energy', 'overheads', 'sensor readings'],
  };

  try {
    const out = await chatJson<{ summary: string; bullets?: string[]; actions?: { label: string; link: string }[] }>([
      { role: 'system', content: 'You are the manufacturing analyst for GNANOVA Manufacturing OS. Answer ONLY from the JSON facts provided. Never invent numbers, names or events. If the facts do not contain the answer, say so plainly and name the data that would be needed. Be concise. Respond as JSON: {"summary": string, "bullets": string[] (optional, ≤5), "actions": [{"label": string, "link": one of "/production","/production/downtime","/inventory/reorder","/procurement/purchase_orders","/ap/ageing","/ap/match","/maintenance","/quality","/logistics","/reports"}] (optional)}.' },
      { role: 'user', content: `Question: ${question}\n\nFacts:\n${JSON.stringify(facts)}` },
    ]);
    return json(req, { intent: 'llm', summary: out.summary, bullets: out.bullets ?? [], actions: out.actions ?? [], sources: ['shift_reports', 'stock_balances', 'stock_movements', 'purchase_orders', 'invoices', 'work_orders', 'pm_schedules', 'shipments'], period: 'last 7–30 days' });
  } catch (e) {
    if (e instanceof HttpError && e.status === 503) throw e;
    throw new HttpError(502, `AI service failed: ${e instanceof Error ? e.message : e}`);
  }
}));
