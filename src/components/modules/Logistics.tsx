import { useState } from 'react';
import { StatCard, Panel, ClickableRow, Badge, OutlineButton } from '@/components/ui';
import { useToast } from '@/components/Toast';

export default function Logistics() {
  const [showDetail, setShowDetail] = useState(false);
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-3">
        <StatCard label="Shipments" value="1,284" />
        <StatCard label="On time" value="91%" variant="green" />
        <StatCard label="Delayed" value="83" variant="red" />
      </div>

      <Panel title="Delayed shipments">
        <ClickableRow onClick={() => setShowDetail(true)} active={showDetail}>
          <span className="font-mono text-sm text-ink-primary">SH-28491</span>
          <Badge variant="red">Delivery risk</Badge>
        </ClickableRow>
      </Panel>

      {showDetail && (
        <Panel title="SH-28491">
          <div className="p-5 space-y-4">
            <p className="text-sm text-ink-primary">AI found: Carrier delay + production delay.</p>
            <p className="text-sm text-ink-muted">Customer delivery likely to miss SLA by 2 days.</p>
            <div className="flex flex-wrap gap-3">
              <OutlineButton onClick={() => showToast('Operations notified')}>Notify operations</OutlineButton>
              <OutlineButton onClick={() => showToast('Customer message drafted')}>Draft customer message</OutlineButton>
              <OutlineButton onClick={() => showToast('Escalation created')}>Create escalation</OutlineButton>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
