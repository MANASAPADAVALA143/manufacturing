// Drains notification_outbox. Invoked every minute by n8n (service role) or on demand
// by a Company Admin from Settings → Automation.
import { handler, HttpError, json, requireUser } from '../_shared/http.ts';
import { dispatch } from '../_shared/dispatch.ts';

Deno.serve(handler(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  const isService = auth === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  if (!isService) {
    // Only users allowed to manage automation (settings:edit) may trigger a dispatch run.
    const { sb } = await requireUser(req);
    const { company_id } = await req.json().catch(() => ({}));
    const { data: allowed, error } = await sb.rpc('my_permission', { p_company_id: company_id, p_module: 'settings', p_action: 'edit' });
    if (error || !allowed) throw new HttpError(403, 'Only admins can process the outbox');
  }
  return json(req, await dispatch());
}));
