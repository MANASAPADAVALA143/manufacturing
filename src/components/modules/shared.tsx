import { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import { Tabs } from '@/components/ui';
import { navigate } from '@/lib/router';
import type { ModuleId } from '@/lib/types';
import { useLookup, displayName } from '@/lib/data/hooks';
import { addDays, ymd } from '@/lib/dates';
import type { OpsFilters } from '@/lib/analytics';

export interface TabDef { id: string; label: string; count?: number }

export function useModuleTab(tab: string | null, tabs: TabDef[]) {
  return tabs.some((t) => t.id === tab) ? (tab as string) : tabs[0].id;
}

export function ModuleTabs({ module, tabs, current }: { module: ModuleId; tabs: TabDef[]; current: string }) {
  return <Tabs tabs={tabs} value={current} onChange={(id) => navigate(`/${module}/${id}`)} />;
}

const PRESETS = [
  { id: 'today', label: 'Today', days: 1 },
  { id: '7d', label: '7 days', days: 7 },
  { id: '30d', label: '30 days', days: 30 },
  { id: '90d', label: '90 days', days: 90 },
];

export function OpsFilterBar({ value, onChange, show = { factory: true, line: true, shift: true } }: {
  value: OpsFilters; onChange: (f: OpsFilters) => void; show?: { factory?: boolean; line?: boolean; shift?: boolean };
}) {
  const factories = useLookup('factories');
  const lines = useLookup('production_lines');
  const shifts = useLookup('shifts');
  const lineOpts = useMemo(() => lines.rows.filter((l) => !value.factoryId || l.factory_id === value.factoryId), [lines.rows, value.factoryId]);
  const today = ymd();
  const preset = PRESETS.find((p) => value.to === today && value.from === addDays(today, -(p.days - 1)))?.id ?? 'custom';

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-base-border bg-base-panel p-3 shadow-card">
      <div className="flex w-full items-center gap-1 overflow-x-auto rounded-lg bg-base-subtle p-1 sm:w-auto">
        <CalendarRange className="ml-1 mr-1 h-4 w-4 shrink-0 text-ink-faint" />
        {PRESETS.map((p) => (
          <button key={p.id} onClick={() => onChange({ ...value, from: addDays(today, -(p.days - 1)), to: today })}
            className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium ${preset === p.id ? 'bg-white text-accent-blue shadow-sm' : 'text-ink-muted hover:text-ink-primary'}`}>
            {p.label}
          </button>
        ))}
      </div>
      <label className="min-w-[130px] flex-1 sm:flex-none"><span className="sr-only">From</span>
        <input type="date" className="input h-9 py-1 sm:w-auto" value={value.from} max={value.to} onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })} aria-label="From date" />
      </label>
      <label className="min-w-[130px] flex-1 sm:flex-none"><span className="sr-only">To</span>
        <input type="date" className="input h-9 py-1 sm:w-auto" value={value.to} min={value.from} max={today} onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })} aria-label="To date" />
      </label>
      {show.factory && (
        <select aria-label="Factory / plant" className="input h-9 min-w-[150px] flex-1 py-1 sm:w-auto sm:flex-none" value={value.factoryId ?? ''} onChange={(e) => onChange({ ...value, factoryId: e.target.value || undefined, lineId: undefined })}>
          <option value="">All plants / factories</option>
          {factories.rows.map((f) => <option key={f.id} value={f.id}>{String(f.name)}</option>)}
        </select>
      )}
      {show.line && (
        <select aria-label="Production line" className="input h-9 min-w-[140px] flex-1 py-1 sm:w-auto sm:flex-none" value={value.lineId ?? ''} onChange={(e) => onChange({ ...value, lineId: e.target.value || undefined })}>
          <option value="">All lines</option>
          {lineOpts.map((l) => <option key={l.id} value={l.id}>{displayName(l)}</option>)}
        </select>
      )}
      {show.shift && (
        <select aria-label="Shift" className="input h-9 min-w-[110px] flex-1 py-1 sm:w-auto sm:flex-none" value={value.shiftId ?? ''} onChange={(e) => onChange({ ...value, shiftId: e.target.value || undefined })}>
          <option value="">All shifts</option>
          {shifts.rows.map((s) => <option key={s.id} value={s.id}>{String(s.name)}</option>)}
        </select>
      )}
    </div>
  );
}

/** Filters persisted per module for the session. */
export function loadFilters(key: string, fallback: OpsFilters): OpsFilters {
  try {
    const raw = sessionStorage.getItem(`gnanova.filters.${key}`);
    return raw ? { ...fallback, ...(JSON.parse(raw) as OpsFilters) } : fallback;
  } catch {
    return fallback;
  }
}
export function saveFilters(key: string, f: OpsFilters) {
  sessionStorage.setItem(`gnanova.filters.${key}`, JSON.stringify(f));
}
