import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function showUpdateBanner(worker: ServiceWorker) {
  if (document.getElementById('sw-update')) return;
  const bar = document.createElement('div');
  bar.id = 'sw-update';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;left:12px;right:12px;top:12px;z-index:100;display:flex;gap:12px;align-items:center;justify-content:space-between;max-width:480px;margin:0 auto;background:#0B1B33;color:#fff;padding:12px 16px;border-radius:12px;font:14px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.25)';
  bar.innerHTML = '<span>A new version of GNANOVA is available.</span>';
  const btn = document.createElement('button');
  btn.textContent = 'Reload';
  btn.style.cssText = 'background:#2563EB;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600';
  btn.onclick = () => worker.postMessage('SKIP_WAITING');
  bar.appendChild(btn);
  document.body.appendChild(bar);
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(w);
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloaded) {
          reloaded = true;
          window.location.reload();
        }
      });
    } catch (e) {
      console.warn('Service worker registration failed', e);
    }
  });
}
