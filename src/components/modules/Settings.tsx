import { useEffect, useState } from 'react';
import { Check, CircleSlash, Database, Download, Mail, MessageCircle, Play, RefreshCw, RotateCcw, Save, Webhook } from 'lucide-react';
import { Badge, Button, EmptyState, InfoBox, Panel, Spinner, useConfirm } from '@/components/ui';
import EntityManager from '@/components/data/EntityManager';
import { demoBackend, useApp } from '@/lib/app';
import { AI_BACKEND_ENABLED, APP_MODE, SUPABASE_CONFIGURED } from '@/lib/config';
import { AUTOMATION_EVENTS, eventLabel, MAX_ATTEMPTS } from '@/lib/automation';
import { DEFAULT_PERMISSIONS, ROLES, type Action } from '@/lib/rbac';
import { navItems } from '@/lib/modules';
import { TABLES, DEFAULT_COMPANY_SETTINGS, type AuditEntry, type CompanySettings, type OutboxMessage, type TableName } from '@/lib/data/schema';
import { ENTITIES } from '@/lib/data/entities';
import { invalidateAll, useActions, useQuery } from '@/lib/data/hooks';
import { BackendError } from '@/lib/data/backend';
import { SupabaseBackend } from '@/lib/data/supabaseBackend';
import { dateTime, humanize } from '@/lib/format';
import { exportJson } from '@/lib/export';
import { useToast } from '@/components/Toast';
import { ModuleTabs, useModuleTab } from './shared';

const ALL_TABS = [
  { id: 'company', label: 'Company & branding' },
  { id: 'factories', label: 'Factories' },
  { id: 'production_lines', label: 'Lines' },
  { id: 'warehouses', label: 'Warehouses' },
  { id: 'bins', label: 'Bins' },
  { id: 'shifts', label: 'Shifts' },
  { id: 'uoms', label: 'Units' },
  { id: 'employees', label: 'Employees' },
  { id: 'company_members', label: 'Users & roles' },
  { id: 'roles', label: 'Permissions' },
  { id: 'approval_rules', label: 'Approvals' },
  { id: 'automation', label: 'Automation' },
  { id: 'preferences', label: 'My notifications' },
  { id: 'audit', label: 'Audit log' },
  { id: 'data', label: 'Data & backup' },
];

export default function Settings({ tab }: { tab: string | null }) {
  const { can } = useApp();
  const tabs = can('settings', 'view') ? ALL_TABS : ALL_TABS.filter((t) => t.id === 'preferences');
  const current = useModuleTab(tab, tabs);
  return (
    <div className="space-y-5">
      <ModuleTabs module="settings" tabs={tabs} current={current} />
      {current === 'company' && <CompanyForm />}
      {(['factories', 'production_lines', 'warehouses', 'bins', 'shifts', 'uoms', 'employees', 'approval_rules'] as TableName[]).includes(current as TableName) && <EntityManager key={current} table={current as TableName} />}
      {current === 'company_members' && (
        <div className="space-y-3">
          <InfoBox>{APP_MODE === 'demo'
            ? 'Demo mode: adding a user creates a sign-in persona for this browser only.'
            : 'Invite users by email. If they have no account yet, Supabase Auth emails an invitation and the membership activates when they sign up.'} Roles are enforced by Row Level Security in the database.</InfoBox>
          <EntityManager table="company_members" allowCreate={APP_MODE === 'demo'} toolbarExtra={APP_MODE === 'live' ? <InviteMember /> : undefined} />
        </div>
      )}
      {current === 'roles' && <PermissionMatrix />}
      {current === 'automation' && <Automation />}
      {current === 'preferences' && <Preferences />}
      {current === 'audit' && <AuditLog />}
      {current === 'data' && <DataBackup />}
    </div>
  );
}

const SETTING_FIELDS: { key: keyof CompanySettings; label: string; help: string; type: 'number' | 'bool' }[] = [
  { key: 'oee_target_pct', label: 'OEE target %', help: 'Lines below this are flagged.', type: 'number' },
  { key: 'below_target_alert_pct', label: 'Below-target alert %', help: 'Shift output below this % of target triggers an alert.', type: 'number' },
  { key: 'rejection_alert_pct', label: 'High-rejection alert %', help: 'Rejection above this triggers an alert.', type: 'number' },
  { key: 'ap_price_tolerance_pct', label: 'AP price tolerance %', help: 'Invoice rate vs PO rate before an exception is raised.', type: 'number' },
  { key: 'ap_qty_tolerance_pct', label: 'AP quantity tolerance %', help: 'Over-billing allowed vs PO / GRN quantity.', type: 'number' },
  { key: 'duplicate_window_days', label: 'Duplicate invoice window (days)', help: 'Same supplier + amount within this window is flagged.', type: 'number' },
  { key: 'pm_reminder_days', label: 'PM reminder lead (days)', help: 'Send PM reminders this many days before due.', type: 'number' },
  { key: 'low_stock_alerts', label: 'Low-stock alerts', help: 'Notify when stock falls below reorder level.', type: 'bool' },
  { key: 'maker_checker', label: 'Maker-checker approvals', help: 'The creator of a document cannot approve it.', type: 'bool' },
];

function CompanyForm() {
  const { company, backend, session, refreshCompany, can } = useApp();
  const { showToast } = useToast();
  const [v, setV] = useState(() => ({ name: company?.name ?? '', gstin: company?.gstin ?? '', address: company?.address ?? '', brand_color: company?.brand_color ?? '#1E40AF', logo_url: company?.logo_url ?? '' }));
  const [s, setS] = useState<CompanySettings>(() => ({ ...DEFAULT_COMPANY_SETTINGS, ...(company?.settings ?? {}) }));
  const [busy, setBusy] = useState(false);
  const editable = can('settings', 'edit');
  if (!company || !session) return null;
  const save = async () => {
    if (v.name.trim().length < 3) return showToast('Company name is too short', 'error');
    if (v.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.gstin)) return showToast('GSTIN format is invalid', 'error');
    if (v.logo_url && !/^https:\/\//.test(v.logo_url)) return showToast('Logo URL must start with https://', 'error');
    setBusy(true);
    try {
      await backend.updateCompany(company.id, { ...v, gstin: v.gstin || null, logo_url: v.logo_url || null, settings: s }, session);
      await refreshCompany();
      showToast('Company settings saved', 'success');
    } catch (e) {
      showToast(e instanceof BackendError ? e.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Panel title="Company profile & branding">
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <label className="sm:col-span-2"><span className="label">Company name</span><input disabled={!editable} className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
          <label><span className="label">GSTIN</span><input disabled={!editable} className="input uppercase" value={v.gstin ?? ''} onChange={(e) => setV({ ...v, gstin: e.target.value.toUpperCase() })} /></label>
          <label><span className="label">Brand colour</span><div className="flex items-center gap-2"><input disabled={!editable} type="color" className="h-10 w-16 cursor-pointer rounded-lg border border-base-border" value={v.brand_color} onChange={(e) => setV({ ...v, brand_color: e.target.value })} /><span className="font-mono text-sm">{v.brand_color}</span></div></label>
          <label className="sm:col-span-2"><span className="label">Registered address</span><textarea disabled={!editable} rows={2} className="input" value={v.address ?? ''} onChange={(e) => setV({ ...v, address: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">Logo URL (https)</span><input disabled={!editable} className="input" value={v.logo_url ?? ''} onChange={(e) => setV({ ...v, logo_url: e.target.value })} /></label>
          <div className="flex items-center gap-3 rounded-lg bg-base-sidebar p-3 sm:col-span-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md text-sm font-bold text-white" style={{ background: v.brand_color }}>{v.name.slice(0, 2).toUpperCase()}</span>
            <span className="text-sm font-semibold text-white">{v.name || 'Company'}</span><span className="ml-auto text-xs text-navy-300">Sidebar preview</span>
          </div>
        </div>
      </Panel>
      <Panel title="Operating thresholds" subtitle="Used by dashboards, AP matching and automation rules (enforced server-side)">
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {SETTING_FIELDS.map((f) => (
            <label key={f.key} className={f.type === 'bool' ? 'flex items-start gap-3 sm:col-span-2' : ''}>
              {f.type === 'bool' ? (
                <>
                  <input disabled={!editable} type="checkbox" className="mt-1 h-4 w-4" checked={Boolean(s[f.key])} onChange={(e) => setS({ ...s, [f.key]: e.target.checked })} />
                  <span><span className="block text-sm font-medium">{f.label}</span><span className="block text-xs text-ink-muted">{f.help}</span></span>
                </>
              ) : (
                <>
                  <span className="label">{f.label}</span>
                  <input disabled={!editable} type="number" min={0} step="any" className="input font-mono" value={Number(s[f.key])} onChange={(e) => setS({ ...s, [f.key]: Number(e.target.value) })} />
                  <span className="mt-1 block text-xs text-ink-faint">{f.help}</span>
                </>
              )}
            </label>
          ))}
        </div>
      </Panel>
      {editable && <div className="xl:col-span-2"><Button icon={Save} loading={busy} onClick={() => void save()}>Save company settings</Button></div>}
    </div>
  );
}

function InviteMember() {
  const { backend, company, can } = useApp();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ email: '', full_name: '', role: 'store_keeper', phone: '' });
  const [busy, setBusy] = useState(false);
  if (!can('settings', 'create') || !(backend instanceof SupabaseBackend)) return null;
  const send = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return showToast('Enter a valid email', 'error');
    if (v.phone && !/^\+\d{10,15}$/.test(v.phone)) return showToast('WhatsApp number must be in +countrycode format', 'error');
    setBusy(true);
    try {
      const r = await backend.invoke<{ invited: boolean; warning?: string }>('invite-member', { company_id: company?.id, ...v });
      showToast(r.warning ?? (r.invited ? `Invitation emailed to ${v.email}` : `${v.email} already has an account and now has access`), r.warning ? 'warning' : 'success');
      invalidateAll();
      setOpen(false);
    } catch (e) {
      showToast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite user</Button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-navy-950/50 sm:items-center" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Invite user</h2>
            <label className="block"><span className="label">Email *</span><input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></label>
            <label className="block"><span className="label">Full name</span><input className="input" value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></label>
            <label className="block"><span className="label">Role *</span><select className="input" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>{ROLES.filter((r) => r.id !== 'super_admin').map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
            <label className="block"><span className="label">WhatsApp number</span><input className="input" placeholder="+919876543210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></label>
            <div className="flex justify-end gap-2"><Button tone="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={() => void send()}>Send invite</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

function PermissionMatrix() {
  const actions: Action[] = ['view', 'create', 'edit', 'delete', 'approve'];
  return (
    <Panel title="Role permissions" subtitle="Default matrix (V C E D A = view, create, edit, delete, approve). Enforced by RLS via the role_permissions table; approval amounts are configured under Approvals.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-xs">
          <thead className="border-b border-base-border bg-base-subtle"><tr><th className="th sticky left-0 bg-base-subtle">Role</th>{navItems.map((m) => <th key={m.id} className="th text-center">{m.label}</th>)}</tr></thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.id} className="border-b border-base-border last:border-0">
                <td className="td sticky left-0 bg-white font-medium">{r.label}<span className="block text-[10px] font-normal text-ink-muted">{r.description}</span></td>
                {navItems.map((m) => {
                  const acts = DEFAULT_PERMISSIONS[r.id][m.id] ?? [];
                  return <td key={m.id} className="td text-center font-mono">{acts.length ? actions.map((a) => (acts.includes(a) ? a[0].toUpperCase() : '·')).join('') : <span className="text-ink-faint">—</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function IntegrationStatus() {
  const items = [
    { name: 'Supabase (database, auth, storage)', ok: SUPABASE_CONFIGURED && APP_MODE === 'live', icon: Database, note: APP_MODE === 'live' ? 'Connected — RLS enforces company isolation' : 'Not configured — running in browser demo mode' },
    { name: 'AI assistant & document extraction', ok: AI_BACKEND_ENABLED, icon: Webhook, note: AI_BACKEND_ENABLED ? 'Edge Functions ai-assistant / document-extract enabled' : 'Not enabled — rule-based analytics and parsing are used' },
    { name: 'WhatsApp Business Cloud API', ok: false, icon: MessageCircle, note: 'Token lives only in Edge Function secrets; status is reported per message in the outbox below' },
    { name: 'Email provider', ok: false, icon: Mail, note: 'Configured in Edge Function secrets; delivery status per message below' },
    { name: 'n8n workflows', ok: false, icon: Webhook, note: 'Schedules (daily digest, weekly report, PM reminders) call the run-scheduled-jobs endpoint' },
  ];
  return (
    <Panel title="Integration status" subtitle="The browser cannot see secret-based integrations; their health shows up as message delivery results.">
      <ul className="divide-y divide-base-border">
        {items.map((i) => (
          <li key={i.name} className="flex items-start gap-3 px-4 py-3">
            <i.icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-ink-muted">{i.note}</p></div>
            {i.ok ? <Badge variant="green">Configured</Badge> : <Badge variant="grey">{i.name.startsWith('Supabase') || i.name.startsWith('AI') ? 'Not configured' : 'Server-side'}</Badge>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Automation() {
  const { can, mode, backend, company } = useApp();
  const act = useActions();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [dispatching, setDispatching] = useState(false);
  const processOutbox = async () => {
    if (backend instanceof SupabaseBackend) {
      setDispatching(true);
      try {
        const r = await backend.invoke<{ attempted: number; delivered: number; failed: number }>('notify-dispatch', { company_id: company?.id });
        showToast(`Dispatcher ran: ${r.delivered} delivered, ${r.failed} failed of ${r.attempted}`, r.failed ? 'warning' : 'success');
        invalidateAll();
      } catch (e) {
        showToast(`Dispatcher unavailable: ${(e as Error).message}`, 'error');
      } finally {
        setDispatching(false);
      }
    } else {
      await act.rpc('process_outbox', {}, 'Outbox processed').catch(() => undefined);
    }
  };
  const outbox = useQuery<OutboxMessage>('notification_outbox', { orderBy: { key: 'created_at', dir: 'desc' }, limit: 100 });
  const counts = outbox.rows.reduce((m, o) => ({ ...m, [o.status]: (m[o.status] ?? 0) + 1 }), {} as Record<string, number>);
  const tone = (s: string) => (s === 'sent' ? 'green' : s === 'dead' ? 'red' : s === 'failed' ? 'amber' : 'grey') as 'green' | 'red' | 'amber' | 'grey';
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Automation workflows" subtitle="Event rules run in the database (triggers); scheduled ones run from n8n / pg_cron.">
          <ul className="divide-y divide-base-border">
            {AUTOMATION_EVENTS.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{e.label}</p><Badge variant={e.trigger === 'event' ? 'blue' : 'amber'}>{e.trigger === 'event' ? 'Real-time' : 'Scheduled'}</Badge></div>
                <p className="mt-0.5 text-xs text-ink-muted">{e.description} → {e.roles.map((r) => humanize(r)).join(', ')}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="space-y-5">
          <IntegrationStatus />
          {can('settings', 'edit') && (
            <Panel title="Run now">
              <div className="flex flex-wrap gap-2 p-4">
                <Button icon={Play} loading={act.busy} onClick={() => void act.rpc('run_scheduled_jobs', {}, 'Scheduled jobs run: PM reminders and daily digest generated').catch(() => undefined)}>Run scheduled jobs</Button>
                <Button tone="secondary" icon={RefreshCw} loading={act.busy || dispatching} onClick={() => void processOutbox()}>Process outbox</Button>
              </div>
              {mode === 'demo' && <p className="px-4 pb-4 text-xs text-ink-muted">Demo mode has no WhatsApp or email provider, so delivery attempts fail with a clear error and follow the retry schedule (1, 4, 16, 64 min) until dead-lettered after {MAX_ATTEMPTS} attempts.</p>}
            </Panel>
          )}
        </div>
      </div>
      <Panel title="Notification outbox & delivery status" subtitle={Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'No messages'}>
        {outbox.loading && !outbox.rows.length ? <Spinner /> : !outbox.rows.length ? <EmptyState title="No outbound messages yet">Messages are queued when an event fires for users who enabled WhatsApp or email in their preferences.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-base-border bg-base-subtle"><tr>{['Queued', 'Event', 'Channel', 'Recipient', 'Status', 'Attempts', 'Next attempt', 'Last error', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
              <tbody>
                {outbox.rows.map((o) => (
                  <tr key={o.id} className="border-b border-base-border last:border-0">
                    <td className="td font-mono text-xs">{dateTime(o.created_at)}</td>
                    <td className="td">{eventLabel(o.event_type)}</td>
                    <td className="td">{o.channel === 'whatsapp' ? <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</span> : <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />Email</span>}</td>
                    <td className="td font-mono text-xs">{o.recipient}</td>
                    <td className="td"><Badge variant={tone(o.status)}>{o.status}</Badge></td>
                    <td className="td font-mono">{o.attempts}/{MAX_ATTEMPTS}</td>
                    <td className="td font-mono text-xs">{['pending', 'failed'].includes(o.status) ? dateTime(o.next_attempt_at) : '—'}</td>
                    <td className="td max-w-[240px] truncate text-xs text-accent-red" title={o.last_error ?? ''}>{o.last_error ?? ''}</td>
                    <td className="td">{['dead', 'failed'].includes(o.status) && can('settings', 'edit') && (
                      <Button size="sm" tone="secondary" icon={RotateCcw} onClick={async () => { const r = await confirm({ title: 'Retry this message?', message: 'Attempts are reset and the dispatcher will try again.' }); if (r.ok) await act.rpc('retry_outbox', { p_id: o.id }, 'Message re-queued').catch(() => undefined); }}>Retry</Button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Preferences() {
  const { session, role } = useApp();
  const act = useActions();
  const prefs = useQuery('notification_preferences', { limit: 100 });
  const [state, setState] = useState<Record<string, { email: boolean; whatsapp: boolean }>>({});
  useEffect(() => {
    setState(Object.fromEntries(prefs.rows.map((p) => [String(p.event_type), { email: !!p.email, whatsapp: !!p.whatsapp }])));
  }, [prefs.rows]);
  if (!session) return null;
  const relevant = AUTOMATION_EVENTS.filter((e) => role && (e.roles.includes(role) || role === 'super_admin'));
  const toggle = (ev: string, ch: 'email' | 'whatsapp') => {
    const cur = state[ev] ?? { email: false, whatsapp: false };
    const next = { ...cur, [ch]: !cur[ch] };
    setState({ ...state, [ev]: next });
    void act.rpc('set_notification_preference', { p_event_type: ev, p_email: next.email, p_whatsapp: next.whatsapp }, 'Preference saved', true).catch(() => setState(state));
  };
  return (
    <Panel title="My notification preferences" subtitle="In-app notifications are always on. WhatsApp uses the number on your user profile; email uses your sign-in email.">
      {!relevant.length ? <EmptyState title="No automation events apply to your role" /> : (
        <ul className="divide-y divide-base-border">
          {relevant.map((e) => {
            const p = state[e.id] ?? { email: false, whatsapp: false };
            return (
              <li key={e.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{e.label}</p><p className="text-xs text-ink-muted">{e.description}</p></div>
                <div className="flex gap-2">
                  <span className="inline-flex h-9 items-center gap-1 rounded-lg bg-base-subtle px-3 text-xs text-ink-muted"><Check className="h-3.5 w-3.5" />In-app</span>
                  {(['whatsapp', 'email'] as const).map((ch) => (
                    <button key={ch} onClick={() => toggle(e.id, ch)} aria-pressed={p[ch]} className={`inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-medium ${p[ch] ? 'border-accent-green bg-accent-green/10 text-accent-green' : 'border-base-border text-ink-muted'}`}>
                      {ch === 'whatsapp' ? <MessageCircle className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}{ch === 'whatsapp' ? 'WhatsApp' : 'Email'}{!p[ch] && <CircleSlash className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function AuditLog() {
  const [table, setTable] = useState('');
  const q = useQuery<AuditEntry>('audit_log', { where: table ? { table_name: table } : {}, orderBy: { key: 'created_at', dir: 'desc' }, limit: 200 });
  return (
    <Panel title="Audit log" subtitle="Immutable record of every change, transition and deletion"
      actions={<select aria-label="Table" className="input h-8 w-auto py-0 text-xs" value={table} onChange={(e) => setTable(e.target.value)}><option value="">All records</option>{Object.values(ENTITIES).map((d) => d && <option key={d.table} value={d.table}>{d.plural}</option>)}</select>}>
      {q.loading && !q.rows.length ? <Spinner /> : !q.rows.length ? <EmptyState title="No audit entries" /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-base-border bg-base-subtle"><tr>{['When', 'Who', 'Record', 'Action', 'Details'].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {q.rows.map((a) => (
                <tr key={a.id} className="border-b border-base-border last:border-0 align-top">
                  <td className="td whitespace-nowrap font-mono text-xs">{dateTime(a.created_at)}</td>
                  <td className="td">{a.actor_name ?? 'System'}</td>
                  <td className="td text-xs">{ENTITIES[a.table_name as TableName]?.label ?? a.table_name}<span className="block font-mono text-ink-faint">{a.record_id.slice(0, 8)}</span></td>
                  <td className="td"><Badge variant={a.action === 'delete' ? 'red' : a.action === 'transition' ? 'blue' : a.action === 'insert' ? 'green' : 'grey'}>{a.action}</Badge></td>
                  <td className="td max-w-[360px] text-xs text-ink-muted">
                    {a.changes ? Object.entries(a.changes).slice(0, 4).map(([k, c]) => <span key={k} className="block truncate"><span className="font-mono">{k}</span>: {String(typeof c.from === 'object' ? '…' : c.from ?? '∅')} → {String(typeof c.to === 'object' ? '…' : c.to ?? '∅')}</span>) : null}
                    {a.note && <span className="block italic">“{a.note}”</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function DataBackup() {
  const { backend, session, company, mode, can } = useApp();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const exportAll = async () => {
    if (!session) return;
    setBusy(true);
    const out: Record<string, unknown> = { company, exported_at: new Date().toISOString(), exported_by: session.email };
    const skipped: string[] = [];
    for (const t of TABLES) {
      try {
        out[t] = (await backend.select(t, { limit: 10000 }, session)).rows;
      } catch {
        skipped.push(t);
      }
    }
    out.skipped_tables = skipped;
    exportJson(`${company?.slug}-backup-${new Date().toISOString().slice(0, 10)}.json`, out);
    setBusy(false);
    showToast(skipped.length ? `Exported. ${skipped.length} tables were not visible to your role.` : 'Backup exported', skipped.length ? 'warning' : 'success');
  };
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Panel title="Export company data" subtitle="Downloads every record your role can read as JSON">
        <div className="space-y-3 p-4">
          <p className="text-sm text-ink-muted">Production backups are taken by Supabase (daily, with point-in-time recovery on Pro plans). Use this export for audits or migrations; see docs/DEPLOYMENT.md for the full backup strategy.</p>
          <Button icon={Download} loading={busy} onClick={() => void exportAll()} disabled={!can('settings', 'view')}>Export JSON backup</Button>
        </div>
      </Panel>
      {mode === 'demo' && (
        <Panel title="Demo data">
          <div className="space-y-3 p-4">
            <p className="text-sm text-ink-muted">All demo data lives in this browser. Resetting regenerates the two demo companies with fresh dates and removes your changes and uploaded files.</p>
            <Button tone="danger" icon={RotateCcw} onClick={async () => {
              const r = await confirm({ title: 'Reset all demo data?', message: 'This cannot be undone.', tone: 'danger', confirmLabel: 'Reset' });
              if (!r.ok) return;
              await demoBackend()?.reset();
              invalidateAll();
              localStorage.removeItem('gnanova.demo.session');
              window.location.reload();
            }}>Reset demo data</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
