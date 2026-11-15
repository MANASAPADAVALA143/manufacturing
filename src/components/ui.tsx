import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronRight, Loader2, X, Inbox, TrendingUp, TrendingDown, Minus } from 'lucide-react';

export type BadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'grey';

const badgeStyles: Record<BadgeVariant, string> = {
  green: 'bg-accent-green/10 text-accent-green ring-accent-green/20',
  amber: 'bg-accent-amber/10 text-accent-amber ring-accent-amber/20',
  red: 'bg-accent-red/10 text-accent-red ring-accent-red/20',
  blue: 'bg-accent-blue/10 text-accent-blue ring-accent-blue/20',
  grey: 'bg-slate-100 text-ink-muted ring-slate-200',
};

export function Badge({ variant, children, className = '' }: { variant: BadgeVariant; children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${badgeStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

const valueColor = (variant?: string) =>
  variant === 'green' ? 'text-accent-green'
    : variant === 'amber' ? 'text-accent-amber'
    : variant === 'red' ? 'text-accent-red'
    : variant === 'blue' ? 'text-accent-blue'
    : 'text-ink-primary';

export function StatCard({ label, value, variant, sub }: { label: string; value: string; variant?: 'green' | 'amber' | 'red' | 'blue'; sub?: ReactNode }) {
  return (
    <div className="min-w-0 bg-base-panel p-4 sm:p-5">
      <p className="line-clamp-2 font-mono text-[11px] uppercase leading-tight tracking-wider text-ink-muted sm:line-clamp-1">{label}</p>
      <p className={`mt-1.5 truncate font-mono text-xl font-semibold sm:text-2xl ${valueColor(variant)}`}>{value}</p>
      {sub && <div className="mt-1 truncate text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

/** Divided grid of stat cards with a rounded outer frame. Layouts avoid empty trailing cells. */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 | 5 | 6 }) {
  // Class names must stay literal so Tailwind can find them.
  const c = {
    2: 'lg:grid-cols-2 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2',
    3: 'lg:grid-cols-3 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2',
    4: 'lg:grid-cols-4 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2',
    5: 'max-md:[&>*:last-child:nth-child(odd)]:col-span-2 md:max-lg:grid-cols-6 md:max-lg:[&>*]:col-span-2 md:max-lg:[&>*:nth-last-child(-n+2)]:col-span-3 lg:grid-cols-5',
    6: 'max-md:[&>*:last-child:nth-child(odd)]:col-span-2 md:grid-cols-3 xl:grid-cols-6',
  }[cols];
  return <div className={`grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border shadow-card ${c}`}>{children}</div>;
}

export function KpiCard({
  label, value, unit, variant, sub, trend, onClick,
}: {
  label: string; value: string; unit?: string; variant?: 'green' | 'amber' | 'red' | 'blue';
  sub?: ReactNode; trend?: 'up' | 'down' | 'flat'; onClick?: () => void;
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`min-w-0 bg-base-panel p-4 text-left sm:p-5 ${onClick ? 'transition-colors hover:bg-base-hover' : ''}`}>
      <p className="line-clamp-2 font-mono text-[11px] uppercase leading-tight tracking-wider text-ink-muted sm:line-clamp-1">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`truncate font-mono text-xl font-semibold sm:text-2xl ${valueColor(variant)}`}>{value}</span>
        {unit && <span className={`font-mono text-xs ${valueColor(variant)}`}>{unit}</span>}
      </div>
      {sub && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-ink-muted">
          {trend && <TrendIcon className={`h-3.5 w-3.5 shrink-0 ${trend === 'up' ? 'text-accent-green' : trend === 'down' ? 'text-accent-red' : 'text-ink-faint'}`} />}
          <span className="line-clamp-1">{sub}</span>
        </p>
      )}
    </Tag>
  );
}

export function Panel({ title, children, className = '', actions, subtitle }: { title?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className={`min-w-0 overflow-hidden rounded-xl border border-base-border bg-base-panel shadow-card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h3 className="truncate font-semibold text-ink-primary">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold text-ink-muted">{children}</h3>
      {actions}
    </div>
  );
}

export function ClickableRow({ children, onClick, active = false }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-b border-base-border px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-base-hover sm:flex-nowrap sm:px-5 ${active ? 'bg-base-hover' : ''}`}
    >
      {children}
      <ChevronRight className={`ml-auto h-4 w-4 shrink-0 transition-colors ${active ? 'text-accent-blue' : 'text-ink-muted'}`} />
    </button>
  );
}

export function InfoBox({ children, variant = 'blue' }: { children: ReactNode; variant?: 'blue' | 'amber' | 'red' | 'green' }) {
  const styles = {
    blue: 'border-accent-blue/25 bg-accent-blue/5',
    amber: 'border-accent-amber/30 bg-accent-amber/5',
    red: 'border-accent-red/30 bg-accent-red/5',
    green: 'border-accent-green/30 bg-accent-green/5',
  }[variant];
  return <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed text-ink-primary ${styles}`}>{children}</div>;
}

type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const tones: Record<ButtonTone, string> = {
  primary: 'bg-accent-blue text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'border border-base-border bg-white text-ink-primary hover:border-accent-blue hover:text-accent-blue disabled:text-ink-faint',
  danger: 'border border-accent-red/40 bg-white text-accent-red hover:bg-accent-red/5 disabled:opacity-50',
  ghost: 'text-ink-muted hover:bg-base-hover hover:text-ink-primary disabled:opacity-50',
  success: 'bg-accent-green text-white hover:bg-teal-700 disabled:opacity-50',
};

export function Button({
  tone = 'primary', size = 'md', loading, icon: Icon, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: typeof X }) {
  const sz = size === 'sm' ? 'h-8 px-3 text-xs' : size === 'lg' ? 'h-12 px-5 text-base' : 'h-10 px-4 text-sm';
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${sz} ${tones[tone]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function BlueButton({ children, onClick, className = '' }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return <Button onClick={onClick} className={className}>{children}</Button>;
}

export function OutlineButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <Button tone="secondary" onClick={onClick}>{children}</Button>;
}

export function StatusDot({ variant }: { variant: 'green' | 'amber' | 'red' | 'blue' | 'grey' }) {
  const color = { green: 'bg-accent-green', amber: 'bg-accent-amber', red: 'bg-accent-red', blue: 'bg-accent-blue', grey: 'bg-slate-300' }[variant];
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function EmptyState({ title, children, icon: Icon = Inbox, action }: { title: string; children?: ReactNode; icon?: typeof Inbox; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-base-hover">
        <Icon className="h-6 w-6 text-ink-faint" />
      </div>
      <p className="mt-3 font-medium text-ink-primary">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (id: T) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only the tab strip (scrollIntoView would also scroll the page).
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !el) return;
    if (el.offsetLeft < strip.scrollLeft || el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: Math.max(0, el.offsetLeft - 24), behavior: 'smooth' });
    }
  }, [value]);
  return (
    <div ref={ref} role="tablist" className="scrollbar-none relative -mx-3 flex gap-1 overflow-x-auto border-b border-base-border px-3 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`relative shrink-0 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${
            value === t.id ? 'text-accent-blue' : 'text-ink-muted hover:text-ink-primary'
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] ${value === t.id ? 'bg-accent-blue/10' : 'bg-base-hover'}`}>{t.count}</span>
          )}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent-blue" />}
        </button>
      ))}
    </div>
  );
}

/** Right-side drawer on desktop, full-height bottom sheet on mobile. */
export function Sheet({ open, onClose, title, subtitle, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[1px]" onClick={onClose} />
      <div
        className={`absolute inset-x-0 bottom-0 top-[6vh] flex flex-col rounded-t-2xl bg-base-panel shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:rounded-none ${wide ? 'sm:w-[min(920px,100vw)]' : 'sm:w-[min(560px,100vw)]'}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="flex items-start justify-between gap-3 border-b border-base-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink-primary sm:text-lg">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-ink-muted">{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 rounded-lg p-2 text-ink-muted hover:bg-base-hover hover:text-ink-primary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        {footer && <div className="pb-safe flex flex-wrap justify-end gap-2 border-t border-base-border bg-base-subtle px-4 py-3 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Confirm / prompt dialog ───
interface ConfirmOpts { title: string; message?: ReactNode; confirmLabel?: string; tone?: 'primary' | 'danger'; requireComment?: boolean; commentLabel?: string }
type ConfirmFn = (o: ConfirmOpts) => Promise<{ ok: boolean; comment?: string }>;
const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: { ok: boolean; comment?: string }) => void }) | null>(null);
  const [comment, setComment] = useState('');
  const confirm = useCallback<ConfirmFn>((o) => new Promise((resolve) => {
    setComment('');
    setState({ ...o, resolve });
  }), []);
  const close = (ok: boolean) => {
    state?.resolve({ ok, comment: comment.trim() || undefined });
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4" role="alertdialog" aria-modal="true">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => close(false)} />
          <div className="pb-safe relative w-full max-w-md rounded-t-2xl bg-base-panel p-5 shadow-2xl sm:rounded-2xl">
            <h2 className="text-base font-semibold text-ink-primary">{state.title}</h2>
            {state.message && <div className="mt-2 text-sm text-ink-muted">{state.message}</div>}
            {(state.requireComment || state.commentLabel) && (
              <div className="mt-4">
                <label className="label" htmlFor="confirm-comment">{state.commentLabel ?? 'Comment'}{state.requireComment && ' *'}</label>
                <textarea id="confirm-comment" autoFocus rows={3} className="input" value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button tone="secondary" onClick={() => close(false)}>Cancel</Button>
              <Button tone={state.tone === 'danger' ? 'danger' : 'primary'} disabled={state.requireComment && !comment.trim()} onClick={() => close(true)}>
                {state.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm must be used within ConfirmProvider');
  return c;
}

export function DemoTag({ className = '' }: { className?: string }) {
  return <Badge variant="amber" className={className}>Demo data</Badge>;
}
