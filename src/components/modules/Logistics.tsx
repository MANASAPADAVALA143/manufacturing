import { StatCard, Panel, Badge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { AlertTriangle, Truck, Package, Clock } from 'lucide-react';

const shipments = [
  { id: 'SHP-2026-0892', customer: 'Delta Agro Industries', destination: 'Guntur', carrier: 'BlueDart', eta: 'Today', etaBadge: 'amber' as const, status: 'OUT FOR DELIVERY', statusBadge: 'blue' as const },
  { id: 'SHP-2026-0891', customer: 'Meridian Steel Co.', destination: 'Hyderabad', carrier: 'DTDC', eta: '17 Sep', etaBadge: 'red' as const, status: 'DELAYED', statusBadge: 'red' as const },
  { id: 'SHP-2026-0890', customer: 'Vantage Fabricators', destination: 'Pune', carrier: 'FedEx', eta: '18 Sep', etaBadge: 'grey' as const, status: 'IN TRANSIT', statusBadge: 'blue' as const },
  { id: 'SHP-2026-0889', customer: 'Krishna Industries', destination: 'Vijayawada', carrier: 'TCI', eta: '19 Sep', etaBadge: 'grey' as const, status: 'DISPATCHED', statusBadge: 'blue' as const },
  { id: 'SHP-2026-0888', customer: 'Apex Components', destination: 'Chennai', carrier: 'BlueDart', eta: '20 Sep', etaBadge: 'grey' as const, status: 'PROCESSING', statusBadge: 'grey' as const },
];

const carriers = [
  { name: 'BlueDart', shipments: 58, onTime: 98, avgDelay: '0.2 days', cost: '₹1,240' },
  { name: 'FedEx', shipments: 34, onTime: 96, avgDelay: '0.4 days', cost: '₹1,820' },
  { name: 'DTDC', shipments: 41, onTime: 88, avgDelay: '1.1 days', cost: '₹680' },
  { name: 'TCI', shipments: 15, onTime: 93, avgDelay: '0.7 days', cost: '₹540' },
];

const slaWeeks = [
  { week: 'Week 1', value: 96 },
  { week: 'Week 2', value: 95 },
  { week: 'Week 3', value: 91 },
  { week: 'Week 4', value: 94 },
];

function slaBarColor(pct: number): string {
  if (pct >= 95) return 'bg-accent-green';
  if (pct >= 92) return 'bg-accent-amber';
  return 'bg-accent-red';
}

export default function Logistics() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Shipments This Month" value="148" />
        <StatCard label="On-Time Delivery" value="94.2%" variant="green" />
        <StatCard label="Delayed Shipments" value="4" variant="amber" />
        <StatCard label="Avg Transit Time" value="2.8 days" />
      </div>

      {/* Active Shipments */}
      <Panel title="Active Shipments">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Shipment #</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Customer</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Destination</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Carrier</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">ETA</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((s) => (
                <tr key={s.id} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 font-mono text-ink-primary">{s.id}</td>
                  <td className="px-5 py-3 text-ink-primary">{s.customer}</td>
                  <td className="px-5 py-3 text-ink-muted">{s.destination}</td>
                  <td className="px-5 py-3 text-ink-muted">{s.carrier}</td>
                  <td className="px-5 py-3">
                    <span className={s.etaBadge === 'red' ? 'font-mono text-accent-red' : s.etaBadge === 'amber' ? 'font-mono text-accent-amber' : 'font-mono text-ink-muted'}>
                      {s.eta}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      {s.statusBadge === 'red' && <AlertTriangle className="h-3.5 w-3.5 text-accent-red" />}
                      <Badge variant={s.statusBadge}>{s.status}</Badge>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* AI Delay Alerts */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">AI Delay Alerts</h3>
        <div className="space-y-px bg-base-border">
          <div className="flex items-start gap-4 border border-accent-red/30 bg-accent-red/5 p-5">
            <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-red" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-primary">
                SHP-2026-0891 to Meridian Steel — DTDC delay at Nagpur hub.
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                ETA pushed by 1 day. Auto-notification sent to customer.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => showToast('Viewing shipment SHP-2026-0891')}
                className="border border-base-border px-3 py-1.5 text-xs font-medium text-ink-primary transition-colors hover:bg-base-hover"
              >
                View
              </button>
              <button
                onClick={() => showToast('Reassigning carrier for SHP-2026-0891')}
                className="border border-accent-red/40 px-3 py-1.5 text-xs font-medium text-accent-red transition-colors hover:bg-accent-red/10"
              >
                Reassign Carrier
              </button>
            </div>
          </div>

          <div className="flex items-start gap-4 border border-accent-amber/30 bg-accent-amber/5 p-5">
            <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent-amber" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-primary">
                SHP-2026-0887 — Delivered 1 day late last week.
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Customer satisfaction score: 3.8/5.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SLA Performance */}
      <Panel title="SLA Performance — Last 4 Weeks">
        <div className="p-5">
          <div className="relative">
            {/* Target line at 95% */}
            <div className="relative h-48">
              {/* Target line */}
              <div
                className="absolute left-0 right-0 border-t border-dashed border-accent-amber/50"
                style={{ bottom: `${(95 / 100) * 100}%` }}
              >
                <span className="absolute -top-5 right-0 font-mono text-[10px] uppercase tracking-wider text-accent-amber">
                  Target 95%
                </span>
              </div>

              {/* Bars */}
              <div className="absolute bottom-0 left-0 right-0 flex items-end justify-around gap-4">
                {slaWeeks.map((w) => (
                  <div key={w.week} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-40 w-full max-w-[80px] items-end justify-center">
                      <div
                        className={`w-full max-w-[48px] ${slaBarColor(w.value)} transition-all duration-500`}
                        style={{ height: `${(w.value / 100) * 160}px` }}
                      >
                        <div className="flex h-full items-start justify-center pt-1">
                          <span className="font-mono text-[10px] font-semibold text-white">{w.value}%</span>
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-xs text-ink-muted">{w.week}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Carrier Performance */}
      <Panel title="Carrier Performance">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Carrier</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Shipments</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">On-Time %</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Avg Delay</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Cost/Shipment</th>
              </tr>
            </thead>
            <tbody>
              {carriers.map((c) => (
                <tr key={c.name} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2 text-ink-primary">
                      <Truck className="h-4 w-4 text-ink-muted" />
                      {c.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-ink-primary">{c.shipments}</td>
                  <td className="px-5 py-3">
                    <span className={`font-mono font-semibold ${c.onTime >= 95 ? 'text-accent-green' : c.onTime >= 90 ? 'text-accent-amber' : 'text-accent-red'}`}>
                      {c.onTime}%
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-ink-muted">{c.avgDelay}</td>
                  <td className="px-5 py-3 font-mono text-ink-primary">{c.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Summary icons for quick reference */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-3">
        <div className="flex items-center gap-3 border border-base-border bg-base-panel p-4">
          <Package className="h-5 w-5 text-accent-blue" />
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">Total Active</p>
            <p className="font-mono text-sm font-semibold text-ink-primary">5 shipments</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border border-base-border bg-base-panel p-4">
          <Clock className="h-5 w-5 text-accent-amber" />
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">Avg Transit</p>
            <p className="font-mono text-sm font-semibold text-ink-primary">2.8 days</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border border-base-border bg-base-panel p-4">
          <Truck className="h-5 w-5 text-accent-green" />
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">Best Carrier</p>
            <p className="font-mono text-sm font-semibold text-ink-primary">BlueDart 98%</p>
          </div>
        </div>
      </div>
    </div>
  );
}
