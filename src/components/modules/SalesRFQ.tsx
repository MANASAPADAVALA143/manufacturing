import { useState } from 'react';
import { StatCard, Panel, ClickableRow, Badge, InfoBox, BlueButton } from '@/components/ui';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface RFQ {
  id: string;
  customer: string;
  value: string;
  badge: 'amber' | 'green';
  badgeText: string;
}

const rfqs: RFQ[] = [
  { id: 'RFQ-2026-0842', customer: 'Meridian Steel Co.', value: '₹1.2 Cr', badge: 'amber', badgeText: 'Needs approval' },
  { id: 'RFQ-2026-0841', customer: 'Delta Agro Industries', value: '₹68 L', badge: 'green', badgeText: 'Ready' },
  { id: 'RFQ-2026-0839', customer: 'Vantage Fabricators', value: '₹2.4 Cr', badge: 'green', badgeText: 'Ready' },
];

export default function SalesRFQ() {
  const [selected, setSelected] = useState<RFQ | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="RFQs this month" value="286" />
        <StatCard label="AI processed" value="241" variant="green" />
        <StatCard label="Quotes generated" value="212" />
        <StatCard label="Potential value" value="₹8.4 Cr" />
      </div>

      <Panel title="Recent RFQs">
        <div className="divide-y divide-base-border">
          {rfqs.map((rfq) => (
            <ClickableRow key={rfq.id} onClick={() => setSelected(rfq)} active={selected?.id === rfq.id}>
              <span className="font-mono text-sm text-ink-primary">{rfq.id}</span>
              <span className="text-sm text-ink-muted">{rfq.customer}</span>
              <span className="font-mono text-sm text-ink-primary">{rfq.value}</span>
              <Badge variant={rfq.badge}>{rfq.badgeText}</Badge>
            </ClickableRow>
          ))}
        </div>
      </Panel>

      {selected && (
        <Panel title={selected.id}>
          <div className="p-5 space-y-5">
            <p className="text-sm text-ink-muted">
              AI extracted 32 requirements from inbound RFQ document
            </p>
            <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2">
              {[
                ['Customer', selected.customer],
                ['Quantity', '4,200 units'],
                ['Specification', 'ASTM A36 10mm'],
                ['Payment terms', 'Net 45'],
              ].map(([k, v]) => (
                <div key={k} className="bg-base-panel px-4 py-3">
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{k}</p>
                  <p className="mt-1 text-sm text-ink-primary">{v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-3 font-mono text-xs uppercase tracking-wider text-ink-muted">AI Validation</p>
              <div className="space-y-2">
                <ValidationRow ok text="Product exists" />
                <ValidationRow ok text="Specification supported" />
                <ValidationRow ok text="Quantity valid" />
                <ValidationRow warn text="Delivery requires approval" />
              </div>
            </div>
            <BlueButton>Generate quotation</BlueButton>
          </div>
        </Panel>
      )}
    </div>
  );
}

function ValidationRow({ ok, warn, text }: { ok?: boolean; warn?: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok && <CheckCircle2 className="h-4 w-4 text-accent-green" />}
      {warn && <AlertTriangle className="h-4 w-4 text-accent-amber" />}
      <span className={ok ? 'text-accent-green' : 'text-accent-amber'}>{text}</span>
    </div>
  );
}
