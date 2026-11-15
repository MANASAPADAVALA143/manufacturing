/** GNANOVA mark: a gear-cut "G" ring with a teal core. */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#2563EB" />
      <path d="M45 22.5A15 15 0 1 0 47 34H33" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="4.5" fill="#5EEAD4" />
    </svg>
  );
}

export function Wordmark({ dark = true }: { dark?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <LogoMark className="h-8 w-8 shrink-0" />
      <div className="min-w-0 leading-tight">
        <p className={`truncate text-sm font-bold tracking-wide ${dark ? 'text-white' : 'text-ink-primary'}`}>GNANOVA</p>
        <p className={`truncate font-mono text-[10px] uppercase tracking-wider ${dark ? 'text-navy-300' : 'text-ink-muted'}`}>Manufacturing OS</p>
      </div>
    </div>
  );
}
