import { useState } from 'react';
import { StatCard, Panel, ClickableRow, Badge, InfoBox } from '@/components/ui';

interface Alert {
  item: string;
  badge: 'red' | 'amber' | 'green';
  badgeText: string;
}

const alerts: Alert[] = [
  { item: 'Steel Coil A', badge: 'red', badgeText: 'Stockout risk in 6 days' },
  { item: 'Motor B', badge: 'amber', badgeText: 'Excess inventory' },
  { item: 'Bearing C', badge: 'green', badgeText: 'Healthy' },
];

export default function Inventory() {
  const [selected, setSelected] = useState<Alert | null>(null);

  return (
    <div className="space-y-6">
      <StatCard label="Inventory value" value="₹12.4 Cr" />

      <Panel title="AI inventory alerts">
        <div className="divide-y divide-base-border">
          {alerts.map((a) => (
            <ClickableRow key={a.item} onClick={() => setSelected(a)} active={selected?.item === a.item}>
              <span className="text-sm text-ink-primary">{a.item}</span>
              <Badge variant={a.badge}>{a.badgeText}</Badge>
            </ClickableRow>
          ))}
        </div>
      </Panel>

      {selected && selected.item === 'Steel Coil A' && (
        <Panel title="Why is Steel Coil A at risk?">
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2">
              <DetailCell label="Current stock" value="1,240 units" />
              <DetailCell label="Avg daily use" value="210 units" />
              <DetailCell label="Supplier lead time" value="12 days" />
              <DetailCell label="Est. stockout" value="6 days" variant="red" />
            </div>
            <InfoBox>Recommended reorder: 2,500 units</InfoBox>
          </div>
        </Panel>
      )}
    </div>
  );
}

function DetailCell({ label, value, variant }: { label: string; value: string; variant?: 'red' }) {
  return (
    <div className="bg-base-panel px-4 py-3">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm ${variant === 'red' ? 'text-accent-red' : 'text-ink-primary'}`}>{value}</p>
    </div>
  );
}
