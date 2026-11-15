import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_MODE } from '@/lib/config';
import { can as canRole, type Action, type Role } from '@/lib/rbac';
import type { ModuleId } from '@/lib/types';
import { BackendError, type Backend, type Membership, type RegisterCompanyInput, type Session } from '@/lib/data/backend';
import { DemoBackend } from '@/lib/data/demoBackend';
import { SupabaseBackend, supabase } from '@/lib/data/supabaseBackend';
import { SyncEngine, type QueuedOp } from '@/lib/data/sync';
import type { Company } from '@/lib/data/schema';

export interface AuthUser { id: string; email: string; name: string }

interface AppState {
  mode: 'demo' | 'live';
  backend: Backend;
  sync: SyncEngine;
  ready: boolean;
  user: AuthUser | null;
  memberships: Membership[];
  company: Company | null;
  role: Role | null;
  session: Session | null;
  online: boolean;
  pending: QueuedOp[];
  can: (module: ModuleId, action: Action) => boolean;
  signInDemo: (userId: string, companyId?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<'signed_in' | 'confirm_email'>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchCompany: (companyId: string) => void;
  registerCompany: (input: RegisterCompanyInput) => Promise<void>;
  refreshCompany: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

// One backend per page load.
const backend: Backend = APP_MODE === 'demo' ? new DemoBackend() : new SupabaseBackend();
const sync = new SyncEngine(backend);

export const demoBackend = () => (backend instanceof DemoBackend ? backend : null);

const DEMO_SESSION_KEY = 'gnanova.demo.session';
const ACTIVE_COMPANY_KEY = 'gnanova.active-company';

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(() => localStorage.getItem(ACTIVE_COMPANY_KEY));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [pending, setPending] = useState<QueuedOp[]>([]);

  const loadMemberships = useCallback(async (u: AuthUser | null) => {
    if (!u) {
      setMemberships([]);
      return [];
    }
    const ms = await backend.memberships(u.id);
    setMemberships(ms);
    return ms;
  }, []);

  // Restore session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (APP_MODE === 'demo') {
          const raw = localStorage.getItem(DEMO_SESSION_KEY);
          const demo = demoBackend()!;
          const saved = raw ? (JSON.parse(raw) as { userId: string }) : null;
          const u = saved ? demo.users().find((x) => x.id === saved.userId) : undefined;
          if (u && !cancelled) {
            await loadMemberships(u);
            setUser(u);
          }
        } else {
          const { data } = await supabase().auth.getSession();
          const su = data.session?.user;
          if (su && !cancelled) {
            const u = { id: su.id, email: su.email ?? '', name: (su.user_metadata?.full_name as string) ?? su.email ?? '' };
            await loadMemberships(u);
            setUser(u);
          }
        }
      } catch (e) {
        console.error('Session restore failed', e);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    if (APP_MODE === 'live') {
      const { data } = supabase().auth.onAuthStateChange((event, sess) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setMemberships([]);
        } else if (sess?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
          const u = { id: sess.user.id, email: sess.user.email ?? '', name: (sess.user.user_metadata?.full_name as string) ?? sess.user.email ?? '' };
          void loadMemberships(u).then(() => setUser(u));
        }
      });
      return () => {
        cancelled = true;
        data.subscription.unsubscribe();
      };
    }
    return () => {
      cancelled = true;
    };
  }, [loadMemberships]);

  const membership = memberships.find((m) => m.company.id === companyId) ?? memberships[0] ?? null;
  const company = membership?.company ?? null;
  const role = membership?.member.role ?? null;

  const session = useMemo<Session | null>(
    () => (user && company && role ? { userId: user.id, email: user.email, name: user.name, companyId: company.id, role } : null),
    [user, company, role],
  );

  useEffect(() => {
    if (company) localStorage.setItem(ACTIVE_COMPANY_KEY, company.id);
  }, [company]);

  // Connectivity + sync queue.
  useEffect(() => {
    const update = () => setPending(sync.pendingFor(session));
    update();
    const unsub = sync.subscribe(update);
    const goOnline = () => {
      setOnline(true);
      void sync.flush(session);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (navigator.onLine) void sync.flush(session);
    return () => {
      unsub();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [session]);

  const signInDemo = useCallback(async (userId: string, cid?: string) => {
    const demo = demoBackend();
    if (!demo) throw new BackendError('auth', 'Demo sign-in is only available in demo mode');
    const u = demo.users().find((x) => x.id === userId);
    if (!u) throw new BackendError('auth', 'Unknown demo user');
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ userId }));
    if (cid) {
      localStorage.setItem(ACTIVE_COMPANY_KEY, cid);
      setCompanyId(cid);
    }
    await loadMemberships(u);
    setUser(u);
  }, [loadMemberships]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) throw new BackendError('auth', error.message);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const { data, error } = await supabase().auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: window.location.origin } });
    if (error) throw new BackendError('auth', error.message);
    return data.session ? 'signed_in' : 'confirm_email';
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) throw new BackendError('auth', error.message);
  }, []);

  const signOut = useCallback(async () => {
    if (APP_MODE === 'demo') localStorage.removeItem(DEMO_SESSION_KEY);
    else await supabase().auth.signOut();
    setUser(null);
    setMemberships([]);
    window.location.hash = '#/';
  }, []);

  const switchCompany = useCallback((cid: string) => {
    localStorage.setItem(ACTIVE_COMPANY_KEY, cid);
    setCompanyId(cid);
    window.location.hash = '#/overview';
  }, []);

  const registerCompany = useCallback(async (input: RegisterCompanyInput) => {
    if (!user) throw new BackendError('auth', 'Sign in first');
    const c = await backend.registerCompany(input, user);
    await loadMemberships(user);
    switchCompany(c.id);
  }, [user, loadMemberships, switchCompany]);

  const refreshCompany = useCallback(async () => {
    await loadMemberships(user);
  }, [user, loadMemberships]);

  const can = useCallback((module: ModuleId, action: Action) => canRole(role, module, action), [role]);

  const value: AppState = {
    mode: APP_MODE, backend, sync, ready, user, memberships, company, role, session, online, pending, can,
    signInDemo, signIn, signUp, resetPassword, signOut, switchCompany, registerCompany, refreshCompany,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used within AppProvider');
  return v;
}

/** Session guaranteed non-null (inside the authenticated shell). */
export function useSession(): Session {
  const { session } = useApp();
  if (!session) throw new Error('No active session');
  return session;
}
