import { StatCard, Panel, Badge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { AlertTriangle, Eye, Wrench, CalendarClock } from 'lucide-react';

interface PredictiveAlert {
  equipment: string;
  detail: string;
  level: 'red' | 'amber';
  action: string;
  actionLabel: string;
}

const predictiveAlerts: PredictiveAlert[] = [
  {
    equipment: 'Line 2 Motor M2',
    detail: 'Vibration anomaly detected. Predicted failure in 4–7 days. Schedule immediate inspection.',
    level: 'red',
    action: 'create-wo',
    actionLabel: 'Create Work Order',
  },
  {
    equipment: 'Compressor Unit CU-03',
    detail: 'Oil pressure trending down. Preventive check recommended within 10 days.',
    level: 'amber',
    action: 'schedule',
    actionLabel: 'Schedule',
  },
  {
    equipment: 'Conveyor Belt CB-Line1',
    detail: '1,840 hrs since last replacement (recommended: 2,000 hrs). Plan replacement this weekend.',
    level: 'amber',
    action: 'schedule',
    actionLabel: 'Schedule',
  },
];

const workOrders = [
  { wo: 'WO-448', equipment: 'Motor M2 Line 2', type: 'Corrective', priority: 'HIGH', priorityBadge: 'red' as const, assigned: 'Ravi Kumar', due: 'Today', dueBadge: 'red' as const, status: 'IN PROGRESS', statusBadge: 'amber' as const },
  { wo: 'WO-447', equipment: 'Cooling Tower', type: 'Preventive', priority: 'MEDIUM', priorityBadge: 'amber' as const, assigned: 'Suresh T', due: '18 Sep', dueBadge: 'grey' as const, status: 'OPEN', statusBadge: 'blue' as const },
  { wo: 'WO-446', equipment: 'Hydraulic Press', type: 'Inspection', priority: 'LOW', priorityBadge: 'grey' as const, assigned: 'Kiran M', due: '20 Sep', dueBadge: 'grey' as const, status: 'OPEN', statusBadge: 'blue' as const },
  { wo: 'WO-445', equipment: 'Conveyor CB-L1', type: 'Preventive', priority: 'MEDIUM', priorityBadge: 'amber' as const, assigned: 'Ravi Kumar', due: '21 Sep', dueBadge: 'grey' as const, status: 'SCHEDULED', statusBadge: 'blue' as const },
];

interface Equipment {
  name: string;
  health: number;
  lastServiced: string;
  nextDue: string;
  overdue: boolean;
}

const equipment: Equipment[] = [
  { name: 'Line 1 Motor', health: 94, lastServiced: '30 days ago', nextDue: 'Due in 60 days', overdue: false },
  { name: 'Line 2 Motor', health: 61, lastServiced: '42 days ago', nextDue: 'OVERDUE', overdue: true },
  { name: 'Compressor CU-03', health: 78, lastServiced: '18 days ago', nextDue: 'Due in 12 days', overdue: false },
  { name: 'Hydraulic Press', health: 91, lastServiced: '5 days ago', nextDue: 'Due in 85 days', overdue: false },
];

function healthColor(pct: number): string {
  if (pct >= 85) return 'text-accent-green';
  if (pct >= 70) return 'text-accent-amber';
  return 'text-accent-red';
}

function ringStroke(pct: number): string {
  if (pct >= 85) return '#4ade80';
  if (pct >= 70) return '#fbbf24';
  return '#f87171';
}

function HealthRing({ pct, color }: { pct: number; color: string }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative h-20 w-20">
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-base-border" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-mono text-base font-semibold ${healthColor(pct)}`}>{pct}%</span>
      </div>
    </div>
  );
}

export default function Maintenance() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open Work Orders" value="8" />
        <StatCard label="Predictive Alerts" value="3" />
        <StatCard label="Avg Downtime This Week" value="2.4 hrs/day" />
        <StatCard label="Equipment Health Score" value="83%" variant="amber" />
      </div>

      <p className="font-mono text-xs text-ink-muted">Predictive alerts: AI-generated from sensor data and maintenance history</p>

      {/* Predictive Maintenance Alerts */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">AI Predictive Alerts — Action Required</h3>
        <div className="space-y-px bg-base-border">
          {predictiveAlerts.map((a) => {
            const isRed = a.level === 'red';
            return (
              <div
                key={a.equipment}
                className={`flex items-start gap-4 border p-5 ${
                  isRed ? 'border-accent-red/30 bg-accent-red/5' : 'border-accent-amber/30 bg-accent-amber/5'
                }`}
              >
                <div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${isRed ? 'bg-accent-red' : 'bg-accent-amber'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-primary">{a.equipment}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{a.detail}</p>
                </div>
                <button
                  onClick={() => showToast(`${a.actionLabel} — ${a.equipment}`)}
                  className={`shrink-0 border px-4 py-2 text-xs font-medium transition-colors ${
                    isRed
                      ? 'border-accent-red/40 text-accent-red hover:bg-accent-red/10'
                      : 'border-accent-amber/40 text-accent-amber hover:bg-accent-amber/10'
                  }`}
                >
                  {a.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Open Work Orders */}
      <Panel title="Open Work Orders">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">WO#</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Equipment</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Type</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Priority</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Assigned To</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Due</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.wo} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 font-mono text-ink-primary">{wo.wo}</td>
                  <td className="px-5 py-3 text-ink-primary">{wo.equipment}</td>
                  <td className="px-5 py-3 text-ink-muted">{wo.type}</td>
                  <td className="px-5 py-3"><Badge variant={wo.priorityBadge}>{wo.priority}</Badge></td>
                  <td className="px-5 py-3 text-ink-primary">{wo.assigned}</td>
                  <td className="px-5 py-3">
                    <span className={wo.dueBadge === 'red' ? 'font-mono text-accent-red' : 'font-mono text-ink-muted'}>
                      {wo.due}
                    </span>
                  </td>
                  <td className="px-5 py-3"><Badge variant={wo.statusBadge}>{wo.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Equipment Health Dashboard */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">Equipment Health Dashboard</h3>
        <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
          {equipment.map((eq) => (
            <div key={eq.name} className="bg-base-panel p-5">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-ink-muted" />
                <span className="text-sm font-semibold text-ink-primary">{eq.name}</span>
              </div>

              <div className="mt-4 flex justify-center">
                <HealthRing pct={eq.health} color={ringStroke(eq.health)} />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  <span>Serviced {eq.lastServiced}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {eq.overdue ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-accent-red" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                  )}
                  <span className={eq.overdue ? 'font-semibold text-accent-red' : 'text-ink-muted'}>
                    {eq.nextDue}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
