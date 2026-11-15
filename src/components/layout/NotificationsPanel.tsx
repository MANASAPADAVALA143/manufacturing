import { Bell, CheckCheck } from 'lucide-react';
import { useApp } from '@/lib/app';
import { useActions, useQuery } from '@/lib/data/hooks';
import type { AppNotification } from '@/lib/data/schema';
import { ago } from '@/lib/format';
import { navigate } from '@/lib/router';
import { Button, EmptyState, Sheet } from '@/components/ui';
import { eventLabel } from '@/lib/automation';

const sevColor = { critical: 'bg-accent-red', warning: 'bg-accent-amber', info: 'bg-accent-blue', success: 'bg-accent-green' };

export function useNotifications() {
  const { session } = useApp();
  const q = useQuery<AppNotification>('notifications', { orderBy: { key: 'created_at', dir: 'desc' }, limit: 60 });
  const unread = session ? q.rows.filter((n) => !n.read_by?.includes(session.userId)) : [];
  return { ...q, unread };
}

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useApp();
  const { rows, unread, loading } = useNotifications();
  const act = useActions();

  return (
    <Sheet open={open} onClose={onClose} title="Notifications" subtitle={`${unread.length} unread`}
      footer={<Button tone="secondary" icon={CheckCheck} disabled={!unread.length} onClick={() => void act.rpc('mark_notifications_read', { p_ids: null }, 'All notifications marked read', true)}>Mark all read</Button>}>
      {loading && !rows.length ? null : !rows.length ? (
        <EmptyState icon={Bell} title="You’re all caught up">Alerts from automation rules appear here.</EmptyState>
      ) : (
        <ul className="-mx-2 space-y-1">
          {rows.map((n) => {
            const isUnread = session ? !n.read_by?.includes(session.userId) : false;
            return (
              <li key={n.id}>
                <button
                  onClick={() => {
                    if (isUnread) void act.rpc('mark_notifications_read', { p_ids: [n.id] }, '', true);
                    if (n.link) {
                      navigate(n.link);
                      onClose();
                    }
                  }}
                  className={`flex w-full gap-3 rounded-lg px-3 py-3 text-left hover:bg-base-hover ${isUnread ? 'bg-accent-blue/[0.04]' : ''}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${sevColor[n.severity] ?? 'bg-slate-300'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${isUnread ? 'font-semibold text-ink-primary' : 'text-ink-primary'}`}>{n.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{n.body}</span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-ink-faint">{eventLabel(n.event_type)} · {ago(n.created_at)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
