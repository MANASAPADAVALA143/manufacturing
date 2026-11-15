import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X, XCircle, Info } from 'lucide-react';

type ToastVariant = 'success' | 'warning' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let toastId = 0;

const styles: Record<ToastVariant, { border: string; icon: typeof CheckCircle2; color: string }> = {
  success: { border: 'border-l-accent-green', icon: CheckCircle2, color: 'text-accent-green' },
  warning: { border: 'border-l-accent-amber', icon: AlertTriangle, color: 'text-accent-amber' },
  error: { border: 'border-l-accent-red', icon: XCircle, color: 'text-accent-red' },
  info: { border: 'border-l-accent-blue', icon: Info, color: 'text-accent-blue' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = ++toastId;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, variant === 'error' || variant === 'warning' ? 7000 : 3500);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 lg:bottom-6"
      >
        {toasts.map((t) => {
          const s = styles[t.variant];
          const Icon = s.icon;
          return (
            <div
              key={t.id}
              role={t.variant === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-base-border border-l-4 ${s.border} bg-base-panel px-4 py-3 text-sm font-medium text-ink-primary shadow-lg sm:w-auto`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.color}`} />
              <span className="flex-1 leading-snug">{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 p-1 text-ink-muted hover:text-ink-primary">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
