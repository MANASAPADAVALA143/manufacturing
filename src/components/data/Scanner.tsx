import { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui';

interface DetectorLike { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts?: { formats?: string[] }) => DetectorLike;

const Detector = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
export const SCANNER_SUPPORTED = typeof Detector === 'function' && !!navigator.mediaDevices?.getUserMedia;

/** Full-screen camera scanner. Falls back to manual entry when unsupported. */
export function ScannerDialog({ open, onClose, onResult, title = 'Scan barcode / QR' }: {
  open: boolean; onClose: () => void; onResult: (code: string) => void; title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  useEffect(() => {
    if (!open || !SCANNER_SUPPORTED) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new Detector!({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'data_matrix'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(v);
            if (codes[0]?.rawValue) {
              navigator.vibrate?.(60);
              onResult(codes[0].rawValue.trim());
              return;
            }
          } catch {
            /* frame not ready */
          }
          raf = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch (e) {
        setError((e as Error).name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access or type the code below.' : 'Could not start the camera. Type the code below.');
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onResult]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-navy-950 text-white" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between px-4 py-3">
        <p className="flex items-center gap-2 font-medium"><ScanLine className="h-5 w-5" />{title}</p>
        <button onClick={onClose} aria-label="Close scanner" className="rounded-lg p-2 hover:bg-white/10"><X className="h-6 w-6" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {SCANNER_SUPPORTED && !error ? (
          <>
            <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-72 max-w-[80vw] rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(7,20,42,0.55)]" />
            </div>
          </>
        ) : (
          <div className="max-w-sm px-6 text-center text-sm text-navy-200">
            <Camera className="mx-auto mb-3 h-10 w-10 text-navy-300" />
            {error ?? 'Live barcode scanning is not supported by this browser (it works in Chrome on Android). Type or paste the code instead — hardware barcode scanners that type into fields also work.'}
          </div>
        )}
      </div>
      <form
        className="pb-safe flex gap-2 bg-navy-900 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onResult(manual.trim());
        }}
      >
        <input autoFocus={!SCANNER_SUPPORTED} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Enter code manually" className="input flex-1" />
        <Button type="submit" disabled={!manual.trim()}>Use</Button>
      </form>
    </div>
  );
}
