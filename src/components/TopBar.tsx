import { Menu } from 'lucide-react';
import { moduleMeta } from '@/lib/modules';
import type { ModuleId } from '@/lib/types';

export default function TopBar({
  active,
  onOpenMobile,
}: {
  active: ModuleId;
  onOpenMobile: () => void;
}) {
  const meta = moduleMeta[active];
  return (
    <div className="sticky top-0 z-20 border-b border-base-border bg-base-bg/95 backdrop-blur-sm">
      <div className="flex items-start justify-between px-5 py-4 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobile}
            className="text-ink-muted hover:text-ink-primary lg:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-ink-primary lg:text-2xl">{meta.title}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green"></span>
          </span>
          <span className="font-mono text-sm text-ink-muted">ABC Manufacturing — Demo</span>
        </div>
      </div>
    </div>
  );
}
