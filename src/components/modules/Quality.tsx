import { StatCard, Panel, Badge } from '@/components/ui';
import { AlertTriangle, Eye, CheckCircle2, Beaker } from 'lucide-react';

interface Alert {
  batch: string;
  product: string;
  issue: string;
  detail: string;
  level: 'red' | 'amber' | 'green';
  action: string;
}

const alerts: Alert[] = [
  {
    batch: 'B-2026-441',
    product: 'Steel Frame A12',
    issue: 'Surface finish defect',
    detail: '18 units rejected · Root cause: Coolant contamination',
    level: 'red',
    action: 'Action needed',
  },
  {
    batch: 'B-2026-439',
    product: 'Bracket Assembly B7',
    issue: 'Dimensional variance',
    detail: '4 units — within tolerance but flagged',
    level: 'amber',
    action: 'Monitor',
  },
  {
    batch: 'B-2026-438',
    product: 'Gear Unit D5',
    issue: 'Passed',
    detail: '0 defects',
    level: 'green',
    action: 'No action',
  },
];

const inspectionQueue = [
  { batch: 'IQ-2026-089', supplier: 'Tata Steel', material: 'HR Coil', qty: '50 MT', status: 'IN PROGRESS', statusBadge: 'amber' as const, result: '—', resultBadge: 'grey' as const },
  { batch: 'IQ-2026-088', supplier: 'SKF India', material: 'Bearings', qty: '500', status: 'COMPLETED', statusBadge: 'blue' as const, result: 'PASS', resultBadge: 'green' as const },
  { batch: 'IQ-2026-087', supplier: 'Greaves Cotton', material: 'Motor B', qty: '20', status: 'COMPLETED', statusBadge: 'blue' as const, result: 'FAIL (2 units)', resultBadge: 'red' as const },
  { batch: 'IQ-2026-086', supplier: 'Asian Paints', material: 'Primer', qty: '200L', status: 'PENDING', statusBadge: 'grey' as const, result: '—', resultBadge: 'grey' as const },
];

const insights = [
  {
    icon: AlertTriangle,
    text: 'Surface finish defects on Line 1 increased 40% this week — correlates with new coolant batch CN-2026-09. Recommend batch swap.',
    variant: 'amber' as const,
  },
  {
    icon: CheckCircle2,
    text: 'SKF Bearings pass rate: 100% across last 6 shipments — recommend upgrading to Preferred Supplier status.',
    variant: 'green' as const,
  },
];

const alertStyles = {
  red: { border: 'border-accent-red/30', bg: 'bg-accent-red/5', icon: 'text-accent-red', bar: 'bg-accent-red' },
  amber: { border: 'border-accent-amber/30', bg: 'bg-accent-amber/5', icon: 'text-accent-amber', bar: 'bg-accent-amber' },
  green: { border: 'border-base-border', bg: 'bg-base-panel', icon: 'text-accent-green', bar: 'bg-accent-green' },
};

export default function Quality() {
  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Overall Pass Rate" value="98.4%" variant="green" />
        <StatCard label="Defects Today" value="46" />
        <StatCard label="Pending QC Inspections" value="12" />
        <StatCard label="Supplier Rejection Rate" value="2.1%" variant="amber" />
      </div>

      {/* Quality Alerts */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Quality Alerts</h3>
        <div className="space-y-px bg-base-border">
          {alerts.map((a) => {
            const s = alertStyles[a.level];
            const Icon = a.level === 'red' ? AlertTriangle : a.level === 'amber' ? Eye : CheckCircle2;
            return (
              <div key={a.batch} className={`flex items-start gap-4 border ${s.border} ${s.bg} p-5`}>
                <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${s.bar}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-ink-primary">{a.batch}</span>
                    <span className="text-sm text-ink-muted">·</span>
                    <span className="text-sm text-ink-primary">{a.product}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-primary">{a.issue}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{a.detail}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Icon className={`h-4 w-4 ${s.icon}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${s.icon}`}>{a.action}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Incoming Inspection Queue */}
      <Panel title="Incoming Inspection Queue">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Batch</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Supplier</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Material</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Qty</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Inspection Status</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Result</th>
              </tr>
            </thead>
            <tbody>
              {inspectionQueue.map((row) => (
                <tr key={row.batch} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 font-mono text-ink-primary">{row.batch}</td>
                  <td className="px-5 py-3 text-ink-primary">{row.supplier}</td>
                  <td className="px-5 py-3 text-ink-muted">{row.material}</td>
                  <td className="px-5 py-3 font-mono text-ink-primary">{row.qty}</td>
                  <td className="px-5 py-3"><Badge variant={row.statusBadge}>{row.status}</Badge></td>
                  <td className="px-5 py-3"><Badge variant={row.resultBadge}>{row.result}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* AI Quality Insights */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">AI Quality Insights</h3>
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const Icon = insight.icon;
            const styles = {
              amber: { border: 'border-accent-amber/30', bg: 'bg-accent-amber/10', text: 'text-accent-amber' },
              green: { border: 'border-accent-green/30', bg: 'bg-accent-green/10', text: 'text-accent-green' },
            }[insight.variant];
            return (
              <div key={i} className={`flex items-start gap-3 border px-5 py-4 ${styles.border} ${styles.bg}`}>
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${styles.text}`} />
                <p className="text-sm leading-relaxed text-ink-primary">{insight.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
