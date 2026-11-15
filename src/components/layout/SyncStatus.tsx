import { useState } from 'react';
import { CloudOff, RefreshCw, AlertTriangle, CloudUpload, Trash2 } from 'lucide-react';
import { useApp } from '@/lib/app';
import { ago } from '@/lib/format';
import { Button, EmptyState, Sheet } from '@/components/ui';
import { useToast } from '@/components/Toast';

export function SyncChip({ onClick }: { onClick: () => void }) {
  const { online, pending } = useApp();
  const failed = pending.filter((p) => p.status === 'failed').length;
  const queued = pending.length - failed;
  if (online && !pending.length) return null;
  const tone = failed ? 'border-accent-red/30 bg-accent-red/5 text-accent-red' : !online ? 'border-accent-amber/30 bg-accent-amber/10 text-accent-amber' : 'border-accent-blue/30 bg-accent-blue/5 text-accent-blue';
  const Icon = failed ? AlertTriangle : !online ? CloudOff : CloudUpload;
  return (
    <button onClick={onClick} className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium ${tone}`} aria-label="Sync status">
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{failed ? `${failed} failed` : !online ? 'Offline' : 'Syncing'}</span>
      {queued > 0 && <span className="font-mono">{queued}</span>}
    </button>
  );
}

export function SyncPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { online, pending, sync, session } = useApp();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const syncNow = async () => {
    setBusy(true);
    const r = await sync.flush(session);
    setBusy(false);
    showToast(r.synced || r.failed ? `${r.synced} synced, ${r.failed} rejected by the server` : online ? 'Nothing to sync' : 'Still offline', r.failed ? 'warning' : 'info');
  };
  return (
    <Sheet open={open} onClose={onClose} title="Offline changes" subtitle={online ? 'Connected' : 'You are offline — changes are stored on this device'}
      footer={<Button icon={RefreshCw} loading={busy} disabled={!online || !pending.some((p) => p.status === 'queued')} onClick={() => void syncNow()}>Sync now</Button>}>
      {!pending.length ? (
        <EmptyState icon={CloudUpload} title="Everything is synced">Changes made while offline are queued here until the server accepts them.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {pending.map((op) => (
            <li key={op.id} className={`rounded-lg border p-3 ${op.status === 'failed' ? 'border-accent-red/30 bg-accent-red/5' : 'border-base-border'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-primary">{op.label}</p>
                  <p className="text-xs text-ink-muted">{op.status === 'failed' ? 'Rejected by server' : op.status === 'syncing' ? 'Syncing…' : 'Waiting to sync'} · {ago(op.createdAt)}{op.attempts ? ` · ${op.attempts} attempt${op.attempts > 1 ? 's' : ''}` : ''}</p>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${op.status === 'failed' ? 'bg-accent-red/10 text-accent-red' : 'bg-accent-amber/10 text-accent-amber'}`}>{op.status}</span>
              </div>
              {op.error && <p className="mt-2 text-xs text-accent-red">{op.error}</p>}
              {op.status === 'failed' && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" tone="secondary" icon={RefreshCw} onClick={() => { sync.retry(op.id); void sync.flush(session); }}>Retry</Button>
                  <Button size="sm" tone="danger" icon={Trash2} onClick={() => sync.discard(op.id)}>Discard</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
