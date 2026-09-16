import { useState } from 'react';
import { ChevronRight, Send, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Panel } from '@/components/ui';
import type { ModuleId } from '@/lib/types';
import { useToast } from '@/components/Toast';

// ─── KPI tiles ───
const kpis = [
  {
    label: "Today's Production Output",
    value: '2,847',
    unit: 'units',
    variant: 'green' as const,
    delta: '+12% vs yesterday',
    deltaUp: true,
  },
  {
    label: 'Open Vendor Bills',
    value: '₹34.2',
    unit: 'L',
    variant: 'amber' as const,
    delta: '18 pending approval',
    deltaUp: false,
  },
  {
    label: 'Active Exceptions',
    value: '23',
    unit: '',
    variant: 'red' as const,
    delta: 'Across AP, Quality, Logistics',
    deltaUp: false,
  },
  {
    label: 'Inventory Health',
    value: '87',
    unit: '%',
    variant: 'green' as const,
    delta: '2 stockout risks flagged',
    deltaUp: false,
  },
  {
    label: 'On-Time Delivery',
    value: '94.2',
    unit: '%',
    variant: 'green' as const,
    delta: '',
    deltaUp: true,
  },
];

// ─── Module status cards ───
const moduleCards: {
  name: string;
  metric: string;
  sub: string;
  live?: boolean;
  id: ModuleId;
}[] = [
  { name: 'Sales & RFQ', metric: '286', sub: 'RFQs this month · 84% AI processed', id: 'sales' },
  { name: 'AP Automation', metric: '1,842', sub: 'invoices · 118 exceptions', live: true, id: 'ap' },
  { name: 'Production', metric: '91%', sub: 'Line 3 OEE · 2 downtime alerts', id: 'production' },
  { name: 'Quality', metric: '98.4%', sub: 'pass rate · 3 defect alerts today', id: 'quality' },
  { name: 'Inventory', metric: '₹12.4Cr', sub: 'value · 2 stockout risks', live: true, id: 'inventory' },
  { name: 'Logistics', metric: '94%', sub: 'SLA · 4 delayed shipments', id: 'logistics' },
];

// ─── AI Alerts ───
const alerts = [
  { color: 'red', text: 'Steel Coil A — Stockout risk in 6 days' },
  { color: 'amber', text: 'INV-10482 — Price mismatch vs PO, needs review' },
  { color: 'amber', text: 'Line 2 — OEE dropped below 85% threshold' },
  { color: 'green', text: 'RFQ-2026-0841 — Quote ready for Delta Agro Industries' },
  { color: 'red', text: 'Bearing SKF-204 — Reorder point breached' },
];

const samplePrompts = [
  'Show me today\u2019s exceptions',
  'Which vendor bills are overdue?',
  'What\u2019s Line 3 OEE this week?',
];

const variantColor: Record<string, string> = {
  green: 'text-accent-green',
  amber: 'text-accent-amber',
  red: 'text-accent-red',
};

const dotColor: Record<string, string> = {
  green: 'bg-accent-green',
  amber: 'bg-accent-amber',
  red: 'bg-accent-red',
};

export default function Overview({ onNavigate }: { onNavigate: (id: ModuleId) => void }) {
  const { showToast } = useToast();
  const [input, setInput] = useState('');

  const sendPrompt = (prompt: string) => {
    showToast('Opening AI Assistant...');
    setTimeout(() => onNavigate('assistant'), 600);
  };

  return (
    <div className="space-y-6">
      {/* HERO KPI STRIP */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="bg-base-panel p-5">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{k.label}</p>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`font-mono text-2xl font-semibold ${variantColor[k.variant]}`}>
                {k.value}
              </span>
              {k.unit && <span className={`font-mono text-sm ${variantColor[k.variant]}`}>{k.unit}</span>}
            </div>
            {k.delta && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                {k.deltaUp ? (
                  <TrendingUp className="h-3.5 w-3.5 text-accent-green" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-ink-muted" />
                )}
                {k.delta}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* MODULE STATUS + AI ALERTS */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Module status cards — 2x3 grid spanning 2 cols */}
        <div className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-ink-muted">Module Status</h3>
          <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-3">
            {moduleCards.map((m) => (
              <button
                key={m.name}
                onClick={() => onNavigate(m.id)}
                className="group bg-base-panel p-5 text-left transition-colors hover:bg-base-hover"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-primary">{m.name}</span>
                  {m.live && (
                    <span className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"></span>
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green"></span>
                      </span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-green">LIVE</span>
                    </span>
                  )}
                  {!m.live && (
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">DEMO</span>
                  )}
                </div>
                <p className="mt-3 font-mono text-xl font-semibold text-ink-primary">{m.metric}</p>
                <p className="mt-1 text-xs text-ink-muted">{m.sub}</p>
                <div className="mt-3 flex items-center gap-1 text-xs text-ink-muted transition-colors group-hover:text-accent-blue">
                  Open module
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* AI Alerts feed */}
        <div className="lg:col-span-1">
          <h3 className="mb-3 text-sm font-semibold text-ink-muted">AI Alerts — Last 24 hrs</h3>
          <Panel>
            <div className="divide-y divide-base-border">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotColor[a.color]}`} />
                  <span className="text-sm leading-relaxed text-ink-primary">{a.text}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* AI ASSISTANT QUICK-ACCESS BANNER */}
      <div className="border border-base-border bg-base-panel p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center bg-accent-blue/15">
            <span className="font-mono text-sm font-bold text-accent-blue">AI</span>
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-primary">Ask anything about your operations...</p>
            <p className="text-xs text-ink-muted">Orders, production, inventory, logistics — get instant answers.</p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) sendPrompt(input);
          }}
          className="mt-4 flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            className="flex-1 border border-base-border bg-base-bg px-4 py-2.5 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-accent-blue"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 bg-accent-blue px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Send className="h-4 w-4" />
            Ask
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {samplePrompts.map((p) => (
            <button
              key={p}
              onClick={() => sendPrompt(p)}
              className="border border-base-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-accent-blue hover:text-accent-blue"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
