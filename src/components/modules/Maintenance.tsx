import { useState } from 'react';
import { StatCard, Panel, ClickableRow, Badge, InfoBox, BlueButton } from '@/components/ui';
import { ArrowUp } from 'lucide-react';
import { useToast } from '@/components/Toast';

export default function Maintenance() {
  const [showDetail, setShowDetail] = useState(false);
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Machines" value="84" />
        <StatCard label="Healthy" value="72" variant="green" />
        <StatCard label="Attention" value="9" variant="amber" />
        <StatCard label="High risk" value="3" variant="red" />
      </div>

      <Panel title="Flagged machines">
        <ClickableRow onClick={() => setShowDetail(true)} active={showDetail}>
          <span className="text-sm text-ink-primary">Machine M-14</span>
          <Badge variant="red">Failure risk: HIGH</Badge>
        </ClickableRow>
      </Panel>

      {showDetail && (
        <Panel title="Machine M-14">
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2">
              <MetricCell label="Vibration" value="↑ Elevated" variant="red" />
              <MetricCell label="Temperature" value="↑ Elevated" variant="red" />
              <MetricCell label="Runtime" value="↑ Elevated" variant="red" />
              <MetricCell label="Last maintenance" value="183 days ago" variant="red" />
            </div>
            <InfoBox>Schedule inspection within 48 hours.</InfoBox>
            <BlueButton onClick={() => showToast('Maintenance task created')}>
              Create maintenance task
            </BlueButton>
          </div>
        </Panel>
      )}
    </div>
  );
}

function MetricCell({ label, value, variant }: { label: string; value: string; variant: 'red' }) {
  return (
    <div className="bg-base-panel px-4 py-3">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p className={`mt-1 flex items-center gap-1 text-sm text-accent-red`}>
        <ArrowUp className="h-3.5 w-3.5" />
        {value.replace('↑ ', '')}
      </p>
    </div>
  );
}
