import { useState } from 'react';
import { StatCard, Panel, ClickableRow, Badge } from '@/components/ui';
import { ArrowDown, CheckCircle2, AlertTriangle, Circle } from 'lucide-react';

interface Invoice {
  id: string;
  badge: 'amber' | 'green';
  badgeText: string;
}

const invoices: Invoice[] = [
  { id: 'INV-10482', badge: 'amber', badgeText: 'Exception' },
  { id: 'INV-10481', badge: 'green', badgeText: 'Matched' },
];

type StepStatus = 'completed' | 'flagged' | 'pending';

const workflowSteps: { label: string; status: StepStatus }[] = [
  { label: 'Supplier invoice', status: 'completed' },
  { label: 'AI extraction', status: 'completed' },
  { label: 'PO match', status: 'completed' },
  { label: 'GRN match', status: 'completed' },
  { label: 'Business rules', status: 'completed' },
  { label: 'Exception detection', status: 'flagged' },
  { label: 'Approval', status: 'pending' },
  { label: 'ERP', status: 'pending' },
];

export default function APAutomation() {
  const [selected, setSelected] = useState<Invoice | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 border border-accent-green/30 bg-accent-green/10 px-5 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green"></span>
        </span>
        <span className="font-mono text-sm text-accent-green">Live module — Powered by AP InvoiceFlow</span>
      </div>

      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Invoices received" value="1,842" />
        <StatCard label="AI processed" value="1,761" variant="green" />
        <StatCard label="Matched" value="1,643" />
        <StatCard label="Exceptions" value="118" variant="amber" />
        <StatCard label="Pending approval" value="42" />
      </div>

      <Panel title="Invoice queue">
        <div className="divide-y divide-base-border">
          {invoices.map((inv) => (
            <ClickableRow key={inv.id} onClick={() => setSelected(inv)} active={selected?.id === inv.id}>
              <span className="font-mono text-sm text-ink-primary">{inv.id}</span>
              <Badge variant={inv.badge}>{inv.badgeText}</Badge>
            </ClickableRow>
          ))}
        </div>
      </Panel>

      {selected && selected.id === 'INV-10482' && (
        <Panel title={`${selected.id} — Workflow`}>
          <div className="p-5">
            <div className="flex flex-col items-start gap-0">
              {workflowSteps.map((step, i) => (
                <div key={step.label}>
                  <WorkflowStep label={step.label} status={step.status} />
                  {i < workflowSteps.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowDown className="h-4 w-4 text-ink-muted" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function WorkflowStep({ label, status }: { label: string; status: StepStatus }) {
  const styles = {
    completed: { border: 'border-accent-green/30', text: 'text-accent-green', bg: 'bg-accent-green/10', icon: CheckCircle2 },
    flagged: { border: 'border-accent-amber/30', text: 'text-accent-amber', bg: 'bg-accent-amber/10', icon: AlertTriangle },
    pending: { border: 'border-base-border', text: 'text-ink-muted', bg: 'bg-base-panel', icon: Circle },
  }[status];
  const Icon = styles.icon;
  return (
    <div className={`flex items-center gap-3 border px-4 py-3 ${styles.border} ${styles.bg}`}>
      <Icon className={`h-4 w-4 ${styles.text}`} />
      <span className={`text-sm ${styles.text}`}>{label}</span>
    </div>
  );
}
