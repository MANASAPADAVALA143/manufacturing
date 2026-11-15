import { Bell, LayoutDashboard, Menu, Smartphone, Bot, Boxes, Factory, Wrench, ShieldCheck, Package } from 'lucide-react';
import { useApp } from '@/lib/app';
import type { Role } from '@/lib/rbac';
import type { ModuleId } from '@/lib/types';
import { navigate } from '@/lib/router';
import { useNotifications } from './NotificationsPanel';

const ROLE_PRIMARY: Partial<Record<Role, { id: ModuleId; label: string; icon: typeof Bot }>> = {
  store_keeper: { id: 'inventory', label: 'Stock', icon: Boxes },
  warehouse_operator: { id: 'logistics', label: 'Dispatch', icon: Package },
  production_supervisor: { id: 'production', label: 'Production', icon: Factory },
  production_manager: { id: 'production', label: 'Production', icon: Factory },
  maintenance_technician: { id: 'maintenance', label: 'Maintenance', icon: Wrench },
  quality_inspector: { id: 'quality', label: 'Quality', icon: ShieldCheck },
};

export default function BottomNav({ active, onMore, onAlerts }: { active: ModuleId; onMore: () => void; onAlerts: () => void }) {
  const { role, can } = useApp();
  const { unread } = useNotifications();
  const primary = (role && ROLE_PRIMARY[role]) || { id: 'assistant' as ModuleId, label: 'Assistant', icon: Bot };
  const items = [
    { id: 'overview' as ModuleId, label: 'Home', icon: LayoutDashboard },
    ...(can('field', 'view') ? [{ id: 'field' as ModuleId, label: 'Tasks', icon: Smartphone }] : []),
    ...(can(primary.id, 'view') ? [primary] : []),
  ];
  const btn = 'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium';
  return (
    <nav aria-label="Quick navigation" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-base-border bg-white/95 backdrop-blur lg:hidden no-print">
      <div className="mx-auto flex h-16 max-w-lg items-stretch">
        {items.map((it) => {
          const Icon = it.icon;
          const on = active === it.id;
          return (
            <button key={it.id} onClick={() => navigate(`/${it.id}`)} aria-current={on ? 'page' : undefined} className={`${btn} ${on ? 'text-accent-blue' : 'text-ink-muted'}`}>
              <Icon className="h-5 w-5" />
              <span className="truncate">{it.label}</span>
              {on && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent-blue" />}
            </button>
          );
        })}
        <button onClick={onAlerts} className={`${btn} text-ink-muted`} aria-label={`Alerts, ${unread.length} unread`}>
          <span className="relative">
            <Bell className="h-5 w-5" />
            {unread.length > 0 && <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 font-mono text-[9px] font-bold text-white">{unread.length > 99 ? '99+' : unread.length}</span>}
          </span>
          <span>Alerts</span>
        </button>
        <button onClick={onMore} className={`${btn} text-ink-muted`}>
          <Menu className="h-5 w-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
