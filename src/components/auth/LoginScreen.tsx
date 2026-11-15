import { useMemo, useState } from 'react';
import { ArrowRight, Building2, Factory, Info, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { demoBackend, useApp } from '@/lib/app';
import { PRODUCT } from '@/lib/config';
import { ROLES, roleLabel } from '@/lib/rbac';
import { BackendError } from '@/lib/data/backend';
import type { Member } from '@/lib/data/schema';
import { Button } from '@/components/ui';
import { LogoMark } from '@/components/layout/Logo';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-base-sidebar">
      <div className="mx-auto grid min-h-[100dvh] max-w-6xl lg:grid-cols-[1fr_520px]">
        <div className="hidden flex-col justify-between p-10 text-white lg:flex">
          <div className="flex items-center gap-3"><LogoMark className="h-10 w-10" /><span className="text-lg font-bold tracking-wide">{PRODUCT.name}</span></div>
          <div>
            <h1 className="text-4xl font-bold leading-tight">{PRODUCT.full}</h1>
            <p className="mt-3 max-w-md text-lg text-navy-200">{PRODUCT.tagline}</p>
            <ul className="mt-8 space-y-3 text-sm text-navy-200">
              {['Production, OEE and Andon in real time', 'Procurement to payment with 3-way match', 'Inventory, quality and maintenance on the shop floor', 'Company-isolated, role-based, works offline'].map((t) => (
                <li key={t} className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-300" />{t}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-navy-300">© {new Date().getFullYear()} GNANOVA</p>
        </div>
        <div className="flex items-center justify-center bg-base-bg p-4 sm:p-8 lg:rounded-l-3xl">
          <div className="w-full max-w-md">
            <div className="mb-6 flex items-center gap-3 lg:hidden"><LogoMark className="h-10 w-10" /><div><p className="font-bold">{PRODUCT.full}</p><p className="text-xs text-ink-muted">{PRODUCT.tagline}</p></div></div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginScreen() {
  const { mode } = useApp();
  return <Shell>{mode === 'demo' ? <DemoLogin /> : <LiveLogin />}</Shell>;
}

function DemoLogin() {
  const { signInDemo } = useApp();
  const demo = demoBackend()!;
  const [registering, setRegistering] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const companies = demo.engine.db.companies;
  const [cid, setCid] = useState(companies[0]?.id);
  const members = useMemo(() => (demo.engine.t('company_members') as Member[]).filter((m) => m.company_id === cid && m.active !== false)
    .sort((a, b) => ROLES.findIndex((r) => r.id === a.role) - ROLES.findIndex((r) => r.id === b.role)), [demo, cid]);

  if (registering) return <RegisterCompany onCancel={() => setRegistering(false)} />;
  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary">Sign in</h2>
      <div className="mt-3 flex gap-2 rounded-lg border border-accent-amber/30 bg-accent-amber/5 p-3 text-sm text-ink-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
        <p><b>Demo mode.</b> No backend is configured, so data is seeded and stored only in this browser. Personas have no passwords — this is not secure and must not hold real data. Configure Supabase for live use.</p>
      </div>
      <label className="label mt-5" htmlFor="demo-company">Company workspace</label>
      <select id="demo-company" className="input" value={cid} onChange={(e) => setCid(e.target.value)}>
        {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <p className="label mt-5">Continue as</p>
      <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
        {members.map((m) => (
          <li key={m.id}>
            <button disabled={!!busy} onClick={async () => { setBusy(m.id); await signInDemo(m.user_id, cid); }}
              className="flex w-full items-center gap-3 rounded-xl border border-base-border bg-white px-3 py-2.5 text-left hover:border-accent-blue hover:shadow-card disabled:opacity-60">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">{m.full_name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-primary">{m.full_name}</span>
                <span className="block truncate text-xs text-ink-muted">{roleLabel(m.role)} · {m.email}</span>
              </span>
              {busy === m.id ? <Loader2 className="h-4 w-4 animate-spin text-accent-blue" /> : <ArrowRight className="h-4 w-4 text-ink-faint" />}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setRegistering(true)} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-accent-blue hover:underline">
        <Building2 className="h-4 w-4" /> Register a new company workspace
      </button>
    </div>
  );
}

function LiveLogin() {
  const { signIn, signUp, resetPassword } = useApp();
  const [view, setView] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const submit = async () => {
    setMsg(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg({ tone: 'error', text: 'Enter a valid email address' });
    if (view !== 'reset' && password.length < 8) return setMsg({ tone: 'error', text: 'Password must be at least 8 characters' });
    if (view === 'up' && name.trim().length < 2) return setMsg({ tone: 'error', text: 'Enter your name' });
    setBusy(true);
    try {
      if (view === 'in') await signIn(email, password);
      else if (view === 'up') {
        const r = await signUp(email, password, name.trim());
        if (r === 'confirm_email') setMsg({ tone: 'ok', text: 'Check your inbox to confirm your email, then sign in.' });
      } else {
        await resetPassword(email);
        setMsg({ tone: 'ok', text: 'If an account exists, a reset link has been sent.' });
      }
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof BackendError ? e.message : 'Sign-in failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
      <h2 className="text-2xl font-bold text-ink-primary">{view === 'in' ? 'Sign in' : view === 'up' ? 'Create your account' : 'Reset password'}</h2>
      {view === 'up' && (<div><label className="label" htmlFor="name">Full name</label><input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>)}
      <div><label className="label" htmlFor="email">Work email</label><input id="email" type="email" className="input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {view !== 'reset' && (<div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" className="input" autoComplete={view === 'up' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} /></div>)}
      {msg && <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${msg.tone === 'error' ? 'bg-accent-red/5 text-accent-red' : 'bg-accent-green/10 text-accent-green'}`}>{msg.text}</p>}
      <Button type="submit" size="lg" className="w-full" loading={busy} icon={KeyRound}>{view === 'in' ? 'Sign in' : view === 'up' ? 'Create account' : 'Send reset link'}</Button>
      <div className="flex justify-between text-sm">
        {view === 'in' ? <button type="button" className="text-accent-blue hover:underline" onClick={() => setView('up')}>Create an account</button> : <button type="button" className="text-accent-blue hover:underline" onClick={() => setView('in')}>Back to sign in</button>}
        {view === 'in' && <button type="button" className="text-ink-muted hover:underline" onClick={() => setView('reset')}>Forgot password?</button>}
      </div>
    </form>
  );
}

export function RegisterCompany({ onCancel }: { onCancel?: () => void }) {
  const { mode, user, registerCompany, signInDemo } = useApp();
  const [v, setV] = useState({ name: '', gstin: '', city: '', factoryName: '', adminName: user?.name ?? '', email: user?.email ?? '', brandColor: '#1E40AF' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setErr(null);
    if (v.name.trim().length < 3) return setErr('Company name must be at least 3 characters');
    if (!v.factoryName.trim()) return setErr('Enter your first factory / plant name');
    if (v.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v.gstin.toUpperCase())) return setErr('GSTIN format is invalid');
    if (!v.adminName.trim()) return setErr('Enter the admin’s name');
    setBusy(true);
    try {
      const input = { name: v.name.trim(), gstin: v.gstin.toUpperCase() || undefined, city: v.city.trim() || undefined, factoryName: v.factoryName.trim(), adminName: v.adminName.trim(), brandColor: v.brandColor };
      if (mode === 'demo') {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) throw new BackendError('validation', 'Enter a valid email');
        const demo = demoBackend()!;
        const u = demo.createDemoUser(v.email, v.adminName.trim());
        const c = await demo.registerCompany(input, u);
        await signInDemo(u.id, c.id);
      } else {
        await registerCompany(input);
      }
    } catch (e) {
      setErr(e instanceof BackendError ? e.message : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-ink-primary">Register your company</h2>
        <p className="mt-1 text-sm text-ink-muted">Creates an isolated workspace. You become its Company Admin and can add factories, warehouses, lines, machines and users.</p>
      </div>
      <div><label className="label" htmlFor="rc-name">Company name *</label><input id="rc-name" className="input" value={v.name} onChange={set('name')} /></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="rc-gstin">GSTIN</label><input id="rc-gstin" className="input uppercase" value={v.gstin} onChange={set('gstin')} /></div>
        <div><label className="label" htmlFor="rc-city">City</label><input id="rc-city" className="input" value={v.city} onChange={set('city')} /></div>
      </div>
      <div><label className="label" htmlFor="rc-factory">First factory / plant *</label><div className="relative"><Factory className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" /><input id="rc-factory" className="input pl-9" value={v.factoryName} onChange={set('factoryName')} placeholder="e.g. Plant 1 — Patancheru" /></div></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="rc-admin">Your name *</label><input id="rc-admin" className="input" value={v.adminName} onChange={set('adminName')} /></div>
        {mode === 'demo' && <div><label className="label" htmlFor="rc-email">Your email *</label><input id="rc-email" type="email" className="input" value={v.email} onChange={set('email')} /></div>}
      </div>
      <div><label className="label" htmlFor="rc-color">Brand colour</label><input id="rc-color" type="color" className="h-10 w-20 cursor-pointer rounded-lg border border-base-border" value={v.brandColor} onChange={set('brandColor')} /></div>
      {err && <p role="alert" className="rounded-lg bg-accent-red/5 px-3 py-2 text-sm text-accent-red">{err}</p>}
      <div className="flex gap-2">
        {onCancel && <Button tone="secondary" onClick={onCancel}>Back</Button>}
        <Button type="submit" className="flex-1" loading={busy} icon={Building2}>Create workspace</Button>
      </div>
    </form>
  );
}

export function NoCompanyScreen() {
  const { signOut } = useApp();
  return (
    <Shell>
      <RegisterCompany />
      <p className="mt-6 text-center text-sm text-ink-muted">Were you invited to an existing company? Ask its admin to add your email, then <button className="text-accent-blue hover:underline" onClick={() => void signOut()}>sign in again</button>.</p>
    </Shell>
  );
}
