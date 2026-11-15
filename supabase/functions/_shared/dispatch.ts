// Outbox delivery: WhatsApp Business Cloud API, email (Resend), or n8n webhook.
// Retries/backoff/dead-lettering are applied by complete_outbox() in the database.
import { adminClient, hmacHex, HttpError } from './http.ts';

interface Msg { id: string; company_id: string; channel: 'whatsapp' | 'email' | 'webhook'; recipient: string; event_type: string; payload: Record<string, string> }
type Result = { ok: boolean; error?: string; providerId?: string };

async function sendWhatsApp(m: Msg): Promise<Result> {
  const token = Deno.env.get('WHATSAPP_TOKEN');
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneId) return { ok: false, error: 'WhatsApp Cloud API not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' };
  // Business-initiated messages outside the 24 h window require an approved template: {{1}} = title, {{2}} = body.
  const template = Deno.env.get('WHATSAPP_TEMPLATE');
  const to = m.recipient.replace(/[^\d]/g, '');
  const body = template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: template, language: { code: Deno.env.get('WHATSAPP_TEMPLATE_LANG') ?? 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: m.payload.title.slice(0, 60) }, { type: 'text', text: m.payload.body.slice(0, 900) }] }] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: `*${m.payload.title}*\n${m.payload.body}` } };
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `WhatsApp ${res.status}: ${out?.error?.message ?? 'request failed'}` };
  return { ok: true, providerId: out?.messages?.[0]?.id };
}

async function sendEmail(m: Msg): Promise<Result> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return { ok: false, error: 'Email provider not configured (RESEND_API_KEY / EMAIL_FROM)' };
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      from, to: [m.recipient], subject: `[${m.payload.company ?? 'GNANOVA'}] ${m.payload.title}`,
      html: `<p>${esc(m.payload.body)}</p>${m.payload.link && appUrl ? `<p><a href="${appUrl}/#${m.payload.link}">Open in GNANOVA</a></p>` : ''}<p style="color:#64748b;font-size:12px">Manage alerts in GNANOVA → My notifications.</p>`,
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: `Email ${res.status}: ${out?.message ?? 'request failed'}` };
  return { ok: true, providerId: out?.id };
}

async function sendWebhook(m: Msg): Promise<Result> {
  const url = Deno.env.get('N8N_WEBHOOK_URL');
  const secret = Deno.env.get('N8N_SHARED_SECRET');
  if (!url || !secret) return { ok: false, error: 'n8n webhook not configured (N8N_WEBHOOK_URL / N8N_SHARED_SECRET)' };
  const ts = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ id: m.id, company_id: m.company_id, event_type: m.event_type, ...m.payload });
  const res = await fetch(url, {
    method: 'POST', body, signal: AbortSignal.timeout(15_000),
    headers: { 'Content-Type': 'application/json', 'x-gnanova-timestamp': ts, 'x-gnanova-signature': await hmacHex(secret, `${ts}.${body}`) },
  });
  return res.ok ? { ok: true } : { ok: false, error: `n8n ${res.status}` };
}

export async function dispatch(limit = 50) {
  const admin = adminClient();
  const { data, error } = await admin.rpc('claim_outbox', { p_limit: limit });
  if (error) throw new HttpError(500, error.message);
  const results = { attempted: 0, delivered: 0, failed: 0 };
  for (const m of (data ?? []) as Msg[]) {
    results.attempted++;
    let r: Result;
    try {
      r = m.channel === 'whatsapp' ? await sendWhatsApp(m) : m.channel === 'email' ? await sendEmail(m) : await sendWebhook(m);
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const done = await admin.rpc('complete_outbox', { p_id: m.id, p_ok: r.ok, p_error: r.error ?? null, p_provider_id: r.providerId ?? null });
    if (done.error) console.error('complete_outbox failed', m.id, done.error.message);
    if (r.ok) results.delivered++; else results.failed++;
  }
  return results;
}
