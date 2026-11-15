// Adds a member (RLS ensures the caller may manage users) and sends a Supabase Auth invite.
import { adminClient, handler, HttpError, json, requireMember, requireUser } from '../_shared/http.ts';

const ROLES = ['company_admin', 'ceo', 'plant_manager', 'production_manager', 'purchase_manager', 'finance_manager', 'store_keeper', 'production_supervisor', 'maintenance_technician', 'quality_inspector', 'warehouse_operator'];

Deno.serve(handler(async (req) => {
  const { sb } = await requireUser(req);
  const { company_id, email, full_name, role, phone } = await req.json();
  await requireMember(sb, company_id);
  if (typeof email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Valid email required');
  if (!ROLES.includes(role)) throw new HttpError(400, 'Invalid role');
  // Insert as the caller: RLS + membership triggers enforce who may grant which role.
  const { error } = await sb.from('company_members').insert({ company_id, email: email.toLowerCase(), full_name: full_name || email, role, phone: phone || null });
  if (error) throw new HttpError(error.code === '42501' ? 403 : 400, error.message);
  const admin = adminClient();
  const { data: existing } = await admin.from('company_members').select('user_id').eq('company_id', company_id).eq('email', email.toLowerCase()).single();
  if (!existing?.user_id) {
    const { error: inv } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: Deno.env.get('APP_URL') ?? undefined, data: { full_name } });
    if (inv) return json(req, { ok: true, invited: false, warning: `Member added, but the invite email failed: ${inv.message}` });
  }
  return json(req, { ok: true, invited: !existing?.user_id });
}));
