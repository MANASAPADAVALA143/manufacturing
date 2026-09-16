import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

type BadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'grey';

const badgeStyles: Record<BadgeVariant, string> = {
  green: 'bg-accent-green/15 text-accent-green',
  amber: 'bg-accent-amber/15 text-accent-amber',
  red: 'bg-accent-red/15 text-accent-red',
  blue: 'bg-accent-blue/15 text-accent-blue',
  grey: 'bg-base-border text-ink-muted',
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${badgeStyles[variant]}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: 'green' | 'amber' | 'red' | 'blue';
}) {
  const valueColor =
    variant === 'green'
      ? 'text-accent-green'
      : variant === 'amber'
      ? 'text-accent-amber'
      : variant === 'red'
      ? 'text-accent-red'
      : variant === 'blue'
      ? 'text-accent-blue'
      : 'text-ink-primary';

  return (
    <div className="border border-base-border bg-base-panel p-5">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-2 font-mono text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`border border-base-border bg-base-panel ${className}`}>
      {title && (
        <div className="border-b border-base-border px-5 py-4">
          <h3 className="font-semibold text-ink-primary">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}

export function ClickableRow({
  children,
  onClick,
  active = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-4 border-b border-base-border px-5 py-4 text-left transition-colors last:border-b-0 hover:bg-base-hover ${
        active ? 'bg-base-hover' : ''
      }`}
    >
      {children}
      <ChevronRight className={`ml-auto h-4 w-4 shrink-0 transition-colors ${active ? 'text-accent-blue' : 'text-ink-muted'}`} />
    </button>
  );
}

export function InfoBox({ children, variant = 'blue' }: { children: ReactNode; variant?: 'blue' | 'amber' }) {
  const styles =
    variant === 'blue'
      ? 'border-accent-blue/30 bg-accent-blue/10 text-ink-primary'
      : 'border-accent-amber/30 bg-accent-amber/10 text-ink-primary';
  return <div className={`border px-4 py-3 text-sm leading-relaxed ${styles}`}>{children}</div>;
}

export function BlueButton({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-accent-blue px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-500 ${className}`}
    >
      {children}
    </button>
  );
}

export function OutlineButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="border border-base-border bg-transparent px-4 py-2 font-medium text-ink-primary transition-colors hover:border-accent-blue hover:text-accent-blue"
    >
      {children}
    </button>
  );
}

export function StatusDot({ variant }: { variant: 'green' | 'amber' | 'red' }) {
  const color =
    variant === 'green' ? 'bg-accent-green' : variant === 'amber' ? 'bg-accent-amber' : 'bg-accent-red';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}
