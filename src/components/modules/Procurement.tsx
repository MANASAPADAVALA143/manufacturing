import { useState } from 'react';
import { StatCard, Panel, ClickableRow, Badge, InfoBox } from '@/components/ui';

interface PO {
  id: string;
  supplier: string;
  badge: 'red' | 'green';
  badgeText: string;
}

const pos: PO[] = [
  { id: 'PO-88213', supplier: 'Supplier ABC', badge: 'red', badgeText: 'High delay risk' },
  { id: 'PO-88190', supplier: 'Northline Metals', badge: 'green', badgeText: 'On schedule' },
];

export default function Procurement() {
  const [selected, setSelected] = useState<PO | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-3">
        <StatCard label="Open POs" value="438" />
        <StatCard label="Supplier delays" value="17" variant="amber" />
        <StatCard label="At-risk POs" value="9" variant="red" />
      </div>

      <Panel title="Purchase orders">
        <div className="divide-y divide-base-border">
          {pos.map((po) => (
            <ClickableRow key={po.id} onClick={() => setSelected(po)} active={selected?.id === po.id}>
              <span className="font-mono text-sm text-ink-primary">{po.id}</span>
              <span className="text-sm text-ink-muted">{po.supplier}</span>
              <Badge variant={po.badge}>{po.badgeText}</Badge>
            </ClickableRow>
          ))}
        </div>
      </Panel>

      {selected && selected.id === 'PO-88213' && (
        <Panel title={selected.id}>
          <div className="p-5 space-y-4">
            <p className="text-sm text-ink-primary">Supplier ABC is likely to miss delivery date by 4 days.</p>
            <p className="text-sm text-ink-muted">Impact: Production Line 3</p>
            <InfoBox>Recommended action: Contact alternate supplier.</InfoBox>
          </div>
        </Panel>
      )}
    </div>
  );
}
