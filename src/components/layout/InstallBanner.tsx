import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'gnanova.install-dismissed';
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);

export function InstallBanner() {
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(KEY) === '1');
  useEffect(() => {
    const l = () => force((x) => x + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  if (dismissed || standalone() || (!deferred && !isIos())) return null;
  const dismiss = () => {
    localStorage.setItem(KEY, '1');
    setDismissed(true);
  };
  return (
    <div className="mx-3 mt-3 flex items-center gap-3 rounded-xl border border-accent-blue/20 bg-accent-blue/5 px-4 py-3 text-sm sm:mx-5 lg:mx-8 no-print">
      <Download className="h-5 w-5 shrink-0 text-accent-blue" />
      <p className="min-w-0 flex-1 text-ink-primary">
        {deferred ? 'Install GNANOVA on this device for full-screen, offline-capable access.' : 'Install on iPhone/iPad: tap Share, then “Add to Home Screen”.'}
      </p>
      {deferred && (
        <Button size="sm" onClick={async () => {
          await deferred!.prompt();
          const r = await deferred!.userChoice;
          if (r.outcome === 'accepted') dismiss();
          deferred = null;
          force((x) => x + 1);
        }}>Install</Button>
      )}
      <button onClick={dismiss} aria-label="Dismiss" className="rounded p-1 text-ink-muted hover:text-ink-primary"><X className="h-4 w-4" /></button>
    </div>
  );
}
