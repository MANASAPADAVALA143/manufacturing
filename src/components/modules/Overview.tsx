import { ChevronRight } from 'lucide-react';
import { StatCard, Panel } from '@/components/ui';
import type { ModuleId } from '@/lib/types';

const opportunities = [
  { module: 'Sales & RFQ', pct: 70, id: 'sales' as ModuleId },
  { module: 'AP Automation', pct: 88, id: 'ap' as ModuleId },
  { module: 'Logistics', pct: 55, id: 'logistics' as ModuleId },
  { module: 'Maintenance', pct: 62, id: 'maintenance' as ModuleId },
  { module: 'Inventory', pct: 58, id: 'inventory' as ModuleId },
  { module: 'Quality', pct: 42, id: 'quality' as ModuleId },
];

export default function Overview({ onNavigate }: { onNavigate: (id: ModuleId) => void }) {
  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue (MTD)" value="₹48.2 Cr" />
        <StatCard label="Production" value="92%" variant="green" />
        <StatCard label="Orders" value="1,284" />
        <StatCard label="Exceptions" value="24" variant="red" />
      </div>

      {/* AI Opportunities */}
      <Panel title="AI opportunities">
        <div className="divide-y divide-base-border">
          {opportunities.map((opp) => (
            <button
              key={opp.module}
              onClick={() => onNavigate(opp.id)}
              className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-base-hover"
            >
              <span className="w-40 shrink-0 text-sm text-ink-primary">{opp.module}</span>
              <div className="flex-1">
                <div className="h-2 w-full bg-base-border">
                  <div className="h-full bg-accent-blue" style={{ width: `${opp.pct}%` }} />
                </div>
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-sm text-ink-muted">{opp.pct}%</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
