import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { navItems } from '@/lib/modules';
import type { ModuleId } from '@/lib/types';
import { useApp } from '@/lib/app';
import { navigate } from '@/lib/router';
import { Wordmark, LogoMark } from '@/components/layout/Logo';

export default function Sidebar({
  active, mobileOpen, onCloseMobile, collapsed, onToggleCollapsed,
}: {
  active: ModuleId; mobileOpen: boolean; onCloseMobile: () => void; collapsed: boolean; onToggleCollapsed: () => void;
}) {
  const { can, company, mode } = useApp();
  const items = navItems.filter((i) => can(i.id, 'view'));
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-40 bg-navy-950/60 lg:hidden" onClick={onCloseMobile} />}
      <aside
        aria-label="Main navigation"
        className={`fixed left-0 top-0 z-50 flex h-[100dvh] flex-col bg-base-sidebar text-navy-200 transition-[transform,width] duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-[264px] lg:w-[72px]' : 'w-[264px] lg:w-[240px]'}`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4">
          <div className={collapsed ? 'lg:hidden' : ''}><Wordmark /></div>
          {collapsed && <div className="hidden lg:block"><LogoMark /></div>}
          <button onClick={onCloseMobile} className="rounded-lg p-1.5 text-navy-300 hover:bg-white/10 hover:text-white lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {company && (
          <div className={`mx-3 mt-3 flex items-center gap-2.5 rounded-lg bg-white/5 px-3 py-2.5 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white" style={{ background: company.brand_color }}>
              {company.name.slice(0, 2).toUpperCase()}
            </span>
            <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="truncate text-xs font-semibold text-white">{company.name}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-navy-300">{mode === 'demo' ? 'Demo workspace' : 'Live workspace'}</p>
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {groups.map((g) => (
            <div key={g} className="mb-3">
              <p className={`px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-wider text-navy-300/70 ${collapsed ? 'lg:hidden' : ''}`}>{g}</p>
              {items.filter((i) => i.group === g).map((item) => {
                const Icon = item.icon;
                const isActive = active === item.id;
                return (
                  <button
                    key={item.id}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => { navigate(`/${item.id}`); onCloseMobile(); }}
                    className={`mb-0.5 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${collapsed ? 'lg:justify-center lg:px-0' : ''} ${
                      isActive ? 'bg-accent-blue text-white shadow-sm' : 'text-navy-200 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className={`flex-1 text-left ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <button
          onClick={onToggleCollapsed}
          className="hidden h-12 shrink-0 items-center gap-2 border-t border-white/10 px-6 text-xs text-navy-300 hover:text-white lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="mx-auto h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
        </button>
      </aside>
    </>
  );
}
