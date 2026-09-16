import { StatCard, Panel, Badge, InfoBox } from '@/components/ui';
import { AlertTriangle, Activity, Clock, Wrench, TrendingUp, TrendingDown } from 'lucide-react';

interface Line {
  name: string;
  status: 'RUNNING' | 'WARNING';
  oee: string;
  output: string;
  shift?: string;
  note: string;
  noteType: 'info' | 'alert';
  badgeVariant: 'green' | 'amber';
}

const lines: Line[] = [
  {
    name: 'Line 1',
    status: 'RUNNING',
    oee: '91%',
    output: '1,240',
    shift: 'A',
    note: 'Next maintenance: 14 days',
    noteType: 'info',
    badgeVariant: 'green',
  },
  {
    name: 'Line 2',
    status: 'WARNING',
    oee: '82%',
    output: '980',
    note: 'OEE dropped below 85% — vibration spike on Motor M2',
    noteType: 'alert',
    badgeVariant: 'amber',
  },
  {
    name: 'Line 3',
    status: 'RUNNING',
    oee: '89%',
    output: '627',
    shift: 'B',
    note: 'On schedule',
    noteType: 'info',
    badgeVariant: 'green',
  },
];

const schedule = [
  { product: 'Steel Frame A12', planned: 800, produced: 782, variance: -18, status: 'ON TRACK' as const, badge: 'green' as const },
  { product: 'Bracket Assembly B7', planned: 1200, produced: 1240, variance: 40, status: 'AHEAD' as const, badge: 'blue' as const },
  { product: 'Motor Housing C3', planned: 500, produced: 420, variance: -80, status: 'DELAYED' as const, badge: 'red' as const },
  { product: 'Gear Unit D5', planned: 400, produced: 405, variance: 5, status: 'ON TRACK' as const, badge: 'green' as const },
];

const insights = [
  {
    icon: Wrench,
    text: 'Line 2 OEE decline correlates with last bearing replacement (42 days ago) — recommend preventive check',
    variant: 'amber' as const,
  },
  {
    icon: AlertTriangle,
    text: 'Motor Housing C3 delay — material shortage flagged in Inventory (Steel Coil A stockout risk)',
    variant: 'red' as const,
  },
  {
    icon: TrendingUp,
    text: 'Shift A consistently outperforms Shift B by 8% — recommend process review',
    variant: 'blue' as const,
  },
];

export default function Production() {
  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Units Produced Today" value="2,847" />
        <StatCard label="OEE" value="87.3%" variant="green" />
        <StatCard label="Active Downtime Alerts" value="2" variant="amber" />
        <StatCard label="Rejection Rate" value="1.6%" variant="green" />
        <StatCard label="Production vs Target" value="94%" variant="amber" />
      </div>

      {/* Production Lines Status */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Production Lines Status</h3>
        <div className="grid grid-cols-1 gap-px bg-base-border lg:grid-cols-3">
          {lines.map((line) => (
            <div key={line.name} className="bg-base-panel p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-primary">{line.name}</span>
                <Badge variant={line.badgeVariant}>{line.status}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">OEE</p>
                  <p className={`mt-1 font-mono text-lg font-semibold ${line.badgeVariant === 'green' ? 'text-accent-green' : 'text-accent-amber'}`}>
                    {line.oee}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">Output</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-ink-primary">{line.output}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
                {line.shift && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Shift {line.shift}
                  </span>
                )}
              </div>

              <div className={`mt-3 flex items-start gap-2 border px-3 py-2.5 ${
                line.noteType === 'alert'
                  ? 'border-accent-amber/30 bg-accent-amber/10'
                  : 'border-base-border bg-base-bg'
              }`}>
                {line.noteType === 'alert' ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber" />
                ) : (
                  <Activity className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                )}
                <span className={`text-xs leading-relaxed ${line.noteType === 'alert' ? 'text-accent-amber' : 'text-ink-muted'}`}>
                  {line.note}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Today's Production Schedule */}
      <Panel title="Today's Production Schedule">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Product</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Planned Qty</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Produced</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Variance</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                <tr key={row.product} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 text-ink-primary">{row.product}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-primary">{row.planned.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-primary">{row.produced.toLocaleString('en-IN')}</td>
                  <td className={`px-5 py-3 text-right font-mono ${row.variance < 0 ? 'text-accent-red' : 'text-accent-green'}`}>
                    <span className="inline-flex items-center gap-1">
                      {row.variance < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                      {row.variance > 0 ? `+${row.variance}` : row.variance}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={row.badge}>{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* AI Production Insights */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">AI Production Insights</h3>
        <div className="space-y-3">
          {insights.map((insight, i) => {
            const Icon = insight.icon;
            const styles = {
              amber: { border: 'border-accent-amber/30', bg: 'bg-accent-amber/10', text: 'text-accent-amber' },
              red: { border: 'border-accent-red/30', bg: 'bg-accent-red/10', text: 'text-accent-red' },
              blue: { border: 'border-accent-blue/30', bg: 'bg-accent-blue/10', text: 'text-accent-blue' },
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
