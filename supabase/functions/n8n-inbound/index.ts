// HMAC-authenticated entry point for n8n workflows (see /n8n). Requests must carry
//   x-gnanova-timestamp: unix seconds (±300 s)
//   x-gnanova-signature: hex(HMAC-SHA256(N8N_SHARED_SECRET, `${timestamp}.${rawBody}`))
// Actions: run_scheduled_jobs | weekly_report | dispatch | delivery_status
import { adminClient, handler, hmacHex, HttpError, json, timingSafeEqual } from '../_shared/http.ts';
import { dispatch } from '../_shared/dispatch.ts';

Deno.serve(handler(async (req) => {
  const secret = Deno.env.get('N8N_SHARED_SECRET');
  if (!secret) throw new HttpError(503, 'N8N_SHARED_SECRET is not configured');
  const raw = await req.text();
  const ts = req.headers.get('x-gnanova-timestamp') ?? '';
  const sig = req.headers.get('x-gnanova-signature') ?? '';
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) throw new HttpError(401, 'Stale or missing timestamp');
  if (!timingSafeEqual(await hmacHex(secret, `${ts}.${raw}`), sig)) throw new HttpError(401, 'Bad signature');

  const body = JSON.parse(raw || '{}') as { action?: string; provider_message_id?: string; status?: string; error?: string };
  const admin = adminClient();
  switch (body.action) {
    case 'run_scheduled_jobs': {
      const { data, error } = await admin.rpc('run_scheduled_jobs_all');
      if (error) throw new HttpError(500, error.message);
      return json(req, { ok: true, result: data, dispatched: await dispatch() });
    }
    case 'weekly_report': {
      const { data, error } = await admin.rpc('weekly_report_all');
      if (error) throw new HttpError(500, error.message);
      return json(req, { ok: true, result: data, dispatched: await dispatch() });
    }
    case 'dispatch':
      return json(req, { ok: true, result: await dispatch() });
    case 'delivery_status': {
      // WhatsApp status webhooks (sent/delivered/read/failed) relayed by n8n.
      if (!body.provider_message_id || !body.status) throw new HttpError(400, 'provider_message_id and status are required');
      const patch = body.status === 'failed' ? { status: 'failed', last_error: (body.error ?? 'Provider reported failure').slice(0, 500) } : { status: 'sent' };
      const { error } = await admin.from('notification_outbox').update(patch).eq('provider_message_id', body.provider_message_id);
      if (error) throw new HttpError(500, error.message);
      return json(req, { ok: true });
    }
    default:
      throw new HttpError(400, 'Unknown action');
  }
}));
