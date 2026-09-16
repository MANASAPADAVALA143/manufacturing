import { X } from 'lucide-react';
import { navItems } from '@/lib/modules';
import type { ModuleId } from '@/lib/types';

export default function Sidebar({
  active,
  onSelect,
  mobileOpen,
  onCloseMobile,
}: {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onCloseMobile} />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-[220px] flex-col border-r border-base-border bg-base-sidebar transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Company name */}
        <div className="flex items-center justify-between border-b border-base-border px-5 py-5">
          <div>
            <p className="text-sm font-semibold text-ink-primary">Manufacturing AI</p>
            <p className="font-mono text-xs text-ink-muted">Command Center</p>
          </div>
          <button onClick={onCloseMobile} className="text-ink-muted hover:text-ink-primary lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item.id);
                  onCloseMobile();
                }}
                className={`flex w-full items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-base-panel text-ink-primary'
                    : 'text-ink-muted hover:bg-base-panel/50 hover:text-ink-primary'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-accent-blue' : ''}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.live === 'green' && (
                  <span className="h-2 w-2 rounded-full bg-accent-green" />
                )}
                {item.live === 'blue' && (
                  <span className="h-2 w-2 rounded-full bg-accent-blue" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-base-border px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green"></span>
            </span>
            <span className="font-mono text-xs text-ink-muted">Live modules use real automation</span>
          </div>
        </div>
      </aside>
    </>
  );
}
