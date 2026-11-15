import { lazy, Suspense, useEffect, useState } from 'react';
import { Lock, WifiOff } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';
import { ToastProvider } from '@/components/Toast';
import { ConfirmProvider, EmptyState, Spinner } from '@/components/ui';
import { AppProvider, useApp } from '@/lib/app';
import { useRoute } from '@/lib/router';
import BottomNav from '@/components/layout/BottomNav';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { NotificationsPanel } from '@/components/layout/NotificationsPanel';
import { SyncPanel } from '@/components/layout/SyncStatus';
import { InstallBanner } from '@/components/layout/InstallBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoginScreen, NoCompanyScreen } from '@/components/auth/LoginScreen';
import type { ModuleId } from '@/lib/types';

const Overview = lazy(() => import('@/components/modules/Overview'));
const SalesRFQ = lazy(() => import('@/components/modules/SalesRFQ'));
const Procurement = lazy(() => import('@/components/modules/Procurement'));
const APAutomation = lazy(() => import('@/components/modules/APAutomation'));
const Production = lazy(() => import('@/components/modules/Production'));
const Quality = lazy(() => import('@/components/modules/Quality'));
const Maintenance = lazy(() => import('@/components/modules/Maintenance'));
const Inventory = lazy(() => import('@/components/modules/Inventory'));
const Logistics = lazy(() => import('@/components/modules/Logistics'));
const AIAssistant = lazy(() => import('@/components/modules/AIAssistant'));
const Reports = lazy(() => import('@/components/modules/Reports'));
const FieldApps = lazy(() => import('@/components/modules/FieldApps'));
const Settings = lazy(() => import('@/components/modules/Settings'));

const MODULES: Record<ModuleId, React.LazyExoticComponent<React.ComponentType<{ tab: string | null }>>> = {
  overview: Overview, sales: SalesRFQ, procurement: Procurement, ap: APAutomation, production: Production,
  quality: Quality, maintenance: Maintenance, inventory: Inventory, logistics: Logistics, assistant: AIAssistant,
  reports: Reports, field: FieldApps, settings: Settings,
};

function Shell() {
  const route = useRoute();
  const { can, online, company } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('gnanova.sidebar') === 'collapsed');
  const [search, setSearch] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMobileOpen(false);
  }, [route.module]);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand', company?.brand_color ?? '#2563EB');
  }, [company]);

  const Module = MODULES[route.module];
  const allowed = can(route.module, 'view') || (route.module === 'settings' && route.tab === 'preferences');

  return (
    <div className="min-h-[100dvh] bg-base-bg text-ink-primary">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[100] focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <Sidebar active={route.module} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => { localStorage.setItem('gnanova.sidebar', c ? 'open' : 'collapsed'); return !c; })} />
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[72px]' : 'lg:pl-[240px]'}`}>
        <TopBar active={route.module} tab={route.tab} onOpenMobile={() => setMobileOpen(true)} onSearch={() => setSearch(true)} onNotifications={() => setAlerts(true)} onSync={() => setSyncOpen(true)} />
        {!online && (
          <div role="status" className="flex items-center gap-2 border-b border-accent-amber/30 bg-accent-amber/10 px-4 py-2 text-xs text-accent-amber sm:px-8 no-print">
            <WifiOff className="h-4 w-4 shrink-0" /> You are offline. Screens show the last data loaded; new entries are stored on this device and synced when you reconnect.
          </div>
        )}
        <InstallBanner />
        <main id="main" className="mx-auto max-w-[1600px] px-3 pb-28 pt-4 sm:px-5 lg:px-8 lg:pb-10 lg:pt-6">
          <ErrorBoundary resetKey={`${route.module}/${route.tab}`}>
            <Suspense fallback={<Spinner />}>
              {allowed ? <Module tab={route.tab} /> : (
                <EmptyState icon={Lock} title="You don’t have access to this module">Your role does not include {route.module}. Ask your Company Admin if you need access.</EmptyState>
              )}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav active={route.module} onMore={() => setMobileOpen(true)} onAlerts={() => setAlerts(true)} />
      <GlobalSearch open={search} onClose={() => setSearch(false)} />
      <NotificationsPanel open={alerts} onClose={() => setAlerts(false)} />
      <SyncPanel open={syncOpen} onClose={() => setSyncOpen(false)} />
    </div>
  );
}

function Gate() {
  const { ready, user, memberships } = useApp();
  if (!ready) return <div className="flex min-h-[100dvh] items-center justify-center"><Spinner label="Starting GNANOVA…" /></div>;
  if (!user) return <LoginScreen />;
  if (!memberships.length) return <NoCompanyScreen />;
  return <Shell />;
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <ConfirmProvider>
          <Gate />
        </ConfirmProvider>
      </AppProvider>
    </ToastProvider>
  );
}
