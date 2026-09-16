import { StatCard, Panel, Badge, InfoBox, BlueButton, OutlineButton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PO {
  number: string;
  supplier: string;
  material: string;
  qty: string;
  amount: string;
  status: 'GRN Pending' | 'Delivered' | 'AI Price Alert' | 'Approved';
  badgeVariant: 'amber' | 'green' | 'red' | 'blue';
  action: string;
}

const poQueue: PO[] = [
  { number: 'PO-2026-1182', supplier: 'Tata Steel', material: 'HR Coil', qty: '50 MT', amount: '₹18.5L', status: 'GRN Pending', badgeVariant: 'amber', action: 'View' },
  { number: 'PO-2026-1181', supplier: 'Greaves Cotton', material: 'Motor B', qty: '20 units', amount: '₹4.2L', status: 'Delivered', badgeVariant: 'green', action: 'Match Invoice' },
  { number: 'PO-2026-1180', supplier: 'SKF India', material: 'Bearings', qty: '500 units', amount: '₹1.8L', status: 'AI Price Alert', badgeVariant: 'red', action: 'Review' },
  { number: 'PO-2026-1179', supplier: 'Asian Paints', material: 'Primer', qty: '200 L', amount: '₹62K', status: 'Approved', badgeVariant: 'blue', action: 'View' },
  { number: 'PO-2026-1178', supplier: 'Bosch', material: 'Filters', qty: '100 units', amount: '₹95K', status: 'GRN Pending', badgeVariant: 'amber', action: 'View' },
];

const priceAnomalies = [
  {
    item: 'SKF Bearings',
    detail: 'Vendor quoted ₹360/unit vs market avg ₹310/unit',
    variance: '+16%',
    hasAnomaly: true,
  },
  {
    item: 'Industrial Lubricants',
    detail: 'Quote matches last month, no anomaly',
    variance: '0%',
    hasAnomaly: false,
  },
];

const supplierPerf = [
  { name: 'Tata Steel', category: 'Raw Material', onTime: '96%', priceVar: '+2%', quality: 'A', risk: 'LOW' as const, riskVariant: 'green' as const },
  { name: 'Greaves Cotton', category: 'Components', onTime: '88%', priceVar: '+8%', quality: 'B', risk: 'MEDIUM' as const, riskVariant: 'amber' as const },
  { name: 'SKF India', category: 'Bearings', onTime: '92%', priceVar: '+16%', quality: 'A', risk: 'HIGH (price)' as const, riskVariant: 'red' as const },
];

export default function Procurement() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open POs" value="47" />
        <StatCard label="POs Pending GRN" value="12" />
        <StatCard label="AI Price Alerts" value="6" variant="red" />
        <StatCard label="Avg PO Cycle Time" value="4.2 days" />
      </div>

      <p className="font-mono text-xs text-ink-muted">Open POs total value: ₹1.8Cr · AI price alerts: vendor quoted above market rate</p>

      {/* Active PO Queue */}
      <Panel title="Active PO Queue">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">PO Number</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Supplier</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Material</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Qty</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Amount</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Status</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Action</th>
              </tr>
            </thead>
            <tbody>
              {poQueue.map((po) => (
                <tr key={po.number} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 font-mono text-ink-primary">{po.number}</td>
                  <td className="px-5 py-3 text-ink-primary">{po.supplier}</td>
                  <td className="px-5 py-3 text-ink-muted">{po.material}</td>
                  <td className="px-5 py-3 font-mono text-ink-primary">{po.qty}</td>
                  <td className="px-5 py-3 font-mono text-ink-primary">{po.amount}</td>
                  <td className="px-5 py-3">
                    <Badge variant={po.badgeVariant}>{po.status}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => showToast(`${po.action} — ${po.number}`)}
                      className="text-accent-blue transition-colors hover:text-blue-400"
                    >
                      {po.action}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* AI Price Intelligence */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-ink-muted">AI detected 6 pricing anomalies this week</h3>
        <div className="grid grid-cols-1 gap-px bg-base-border lg:grid-cols-2">
          {priceAnomalies.map((a) => (
            <div key={a.item} className="bg-base-panel p-5">
              <div className="flex items-center gap-2">
                {a.hasAnomaly ? (
                  <AlertTriangle className="h-5 w-5 text-accent-amber" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-accent-green" />
                )}
                <span className="text-sm font-semibold text-ink-primary">{a.item}</span>
              </div>
              <p className="mt-3 text-sm text-ink-muted">{a.detail}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className={`font-mono text-sm font-semibold ${a.hasAnomaly ? 'text-accent-red' : 'text-accent-green'}`}>
                  {a.variance}
                </span>
                {a.hasAnomaly && (
                  <div className="ml-auto flex gap-2">
                    <OutlineButton onClick={() => showToast('Negotiation request sent')}>Negotiate</OutlineButton>
                    <BlueButton onClick={() => showToast('PO approved at quoted price')}>Approve Anyway</BlueButton>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supplier Performance */}
      <Panel title="Supplier Performance">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Supplier</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Category</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">On-Time %</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Price Variance</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Quality Score</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Risk</th>
              </tr>
            </thead>
            <tbody>
              {supplierPerf.map((s) => (
                <tr key={s.name} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 text-ink-primary">{s.name}</td>
                  <td className="px-5 py-3 text-ink-muted">{s.category}</td>
                  <td className="px-5 py-3 font-mono text-ink-primary">{s.onTime}</td>
                  <td className={`px-5 py-3 font-mono ${s.priceVar === '+16%' ? 'text-accent-red' : s.priceVar === '+8%' ? 'text-accent-amber' : 'text-ink-primary'}`}>
                    {s.priceVar}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`font-mono font-semibold ${s.quality === 'A' ? 'text-accent-green' : 'text-accent-amber'}`}>
                      {s.quality}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={s.riskVariant}>{s.risk}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
