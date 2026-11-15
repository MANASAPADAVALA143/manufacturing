import { useEffect, useRef, useState } from 'react';
import { Bell, Building2, ChevronDown, ChevronRight, LogOut, Menu, Search, Settings, UserRound, Users } from 'lucide-react';
import { moduleMeta } from '@/lib/modules';
import type { ModuleId } from '@/lib/types';
import { useApp } from '@/lib/app';
import { roleLabel } from '@/lib/rbac';
import { humanize } from '@/lib/format';
import { navigate } from '@/lib/router';
import { useNotifications } from '@/components/layout/NotificationsPanel';
import { SyncChip } from '@/components/layout/SyncStatus';
import { Badge } from '@/components/ui';

export default function TopBar({
  active, tab, onOpenMobile, onSearch, onNotifications, onSync,
}: {
  active: ModuleId; tab: string | null; onOpenMobile: () => void; onSearch: () => void; onNotifications: () => void; onSync: () => void;
}) {
  const meta = moduleMeta[active];
  const { company, mode } = useApp();
  const { unread } = useNotifications();
  return (
    <header className="sticky top-0 z-30 border-b border-base-border bg-white/95 backdrop-blur no-print">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-5 lg:px-8">
        <button onClick={onOpenMobile} className="-ml-1 rounded-lg p-2 text-ink-muted hover:bg-base-hover hover:text-ink-primary lg:hidden" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-ink-muted sm:flex">
            <span className="truncate">{company?.name}</span>
            <ChevronRight className="h-3 w-3 shrink-0" />
            <button onClick={() => navigate(`/${active}`)} className="truncate hover:text-ink-primary">{meta.title}</button>
            {tab && <><ChevronRight className="h-3 w-3 shrink-0" /><span className="truncate text-ink-primary">{humanize(tab)}</span></>}
          </nav>
          <h1 className="truncate text-lg font-bold leading-tight text-ink-primary sm:text-xl">{meta.title}</h1>
        </div>
        {mode === 'demo' && <Badge variant="amber" className="hidden md:inline-flex">Demo mode</Badge>}
        <button onClick={onSearch} className="hidden h-9 w-56 items-center gap-2 rounded-lg border border-base-border bg-base-subtle px-3 text-sm text-ink-faint hover:border-accent-blue lg:flex" aria-label="Search">
          <Search className="h-4 w-4" /> Search… <kbd className="ml-auto rounded border border-base-border bg-white px-1.5 font-mono text-[10px]">Ctrl K</kbd>
        </button>
        <button onClick={onSearch} className="rounded-lg p-2 text-ink-muted hover:bg-base-hover lg:hidden" aria-label="Search"><Search className="h-5 w-5" /></button>
        <SyncChip onClick={onSync} />
        <button onClick={onNotifications} className="relative rounded-lg p-2 text-ink-muted hover:bg-base-hover hover:text-ink-primary" aria-label={`Notifications, ${unread.length} unread`}>
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 font-mono text-[9px] font-bold text-white">{unread.length > 99 ? '99+' : unread.length}</span>
          )}
        </button>
        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { user, role, memberships, company, switchCompany, signOut, mode, can } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!user) return null;
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-base-hover" aria-haspopup="menu" aria-expanded={open}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-semibold text-white">{initials}</span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block max-w-[140px] truncate text-sm font-medium text-ink-primary">{user.name}</span>
          <span className="block text-[11px] text-ink-muted">{role ? roleLabel(role) : ''}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-ink-muted xl:block" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-72 overflow-hidden rounded-xl border border-base-border bg-white shadow-xl">
          <div className="border-b border-base-border px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-primary">{user.name}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
            {role && <Badge variant="blue" className="mt-2">{roleLabel(role)}</Badge>}
          </div>
          {memberships.length > 1 && (
            <div className="border-b border-base-border py-1">
              <p className="px-4 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-ink-faint">Switch company</p>
              {memberships.map((m) => (
                <button key={m.company.id} role="menuitem" onClick={() => { setOpen(false); switchCompany(m.company.id); }}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-base-hover ${m.company.id === company?.id ? 'font-semibold text-accent-blue' : 'text-ink-primary'}`}>
                  <Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{m.company.name}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-muted">{roleLabel(m.member.role)}</span>
                </button>
              ))}
            </div>
          )}
          <div className="py-1">
            {can('settings', 'view') && (
              <button role="menuitem" onClick={() => { setOpen(false); navigate('/settings'); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-base-hover"><Settings className="h-4 w-4" /> Company settings</button>
            )}
            <button role="menuitem" onClick={() => { setOpen(false); navigate('/settings/preferences'); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-base-hover"><UserRound className="h-4 w-4" /> My notification preferences</button>
            {mode === 'demo' && (
              <button role="menuitem" onClick={() => { setOpen(false); void signOut(); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-base-hover"><Users className="h-4 w-4" /> Switch demo persona</button>
            )}
            <button role="menuitem" onClick={() => { setOpen(false); void signOut(); }} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-accent-red hover:bg-accent-red/5"><LogOut className="h-4 w-4" /> Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}
