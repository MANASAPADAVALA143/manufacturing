import { useEffect, useState } from 'react';
import type { ModuleId } from './types';

export interface Route {
  module: ModuleId;
  tab: string | null;
  params: URLSearchParams;
  path: string;
}

const MODULES: ModuleId[] = [
  'overview', 'sales', 'procurement', 'ap', 'production', 'quality', 'maintenance',
  'inventory', 'logistics', 'assistant', 'reports', 'field', 'settings',
];

export function parse(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/overview';
  const [pathPart, query = ''] = raw.split('?');
  const [, mod, tab] = pathPart.split('/');
  const module = (MODULES.includes(mod as ModuleId) ? mod : 'overview') as ModuleId;
  return { module, tab: tab || null, params: new URLSearchParams(query), path: pathPart };
}

export function navigate(path: string, replace = false) {
  const target = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (replace) window.history.replaceState(null, '', target);
  else window.location.hash = target;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** Sets or clears a query parameter on the current route. */
export function setParam(key: string, value: string | null) {
  const r = parse(window.location.hash);
  if (value === null) r.params.delete(key);
  else r.params.set(key, value);
  const qs = r.params.toString();
  navigate(`${r.path}${qs ? `?${qs}` : ''}`, true);
}
