import { useState } from 'react';
import { StatCard, Panel, ClickableRow, InfoBox, StatusDot } from '@/components/ui';

interface Line {
  name: string;
  pct: number;
  status: 'green' | 'amber' | 'red';
}

const lines: Line[] = [
  { name: 'Line 1', pct: 98, status: 'green' },
  { name: 'Line 2', pct: 94, status: 'green' },
  { name: 'Line 3', pct: 86, status: 'amber' },
  { name: 'Line 4', pct: 71, status: 'red' },
];

export default function Production() {
  const [selected, setSelected] = useState<Line | null>(null);
  const showDetail = selected && (selected.name === 'Line 3' || selected.name === 'Line 4');

  return (
    <div className="space-y-6">
      <StatCard label="Production today: 92% of target" value="92%" variant="green" />

      <Panel title="Production lines">
        <div className="divide-y divide-base-border">
          {lines.map((line) => (
            <ClickableRow key={line.name} onClick={() => setSelected(line)} active={selected?.name === line.name}>
              <span className="text-sm text-ink-primary">{line.name}</span>
              <span className="font-mono text-sm text-ink-primary">{line.pct}%</span>
              <StatusDot variant={line.status} />
            </ClickableRow>
          ))}
        </div>
      </Panel>

      {showDetail && (
        <Panel title={selected!.name}>
          <div className="p-5 space-y-4">
            <p className="text-sm text-ink-primary">Production is 14% below target.</p>
            <p className="text-sm text-ink-muted">
              Potential causes: Machine downtime, material shortage, changeover delay.
            </p>
            <InfoBox>
              Prioritize Order #4821 after Machine M-14 maintenance is completed.
            </InfoBox>
          </div>
        </Panel>
      )}
    </div>
  );
}
