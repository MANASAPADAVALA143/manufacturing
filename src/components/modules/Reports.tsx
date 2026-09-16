import { Panel, BlueButton } from '@/components/ui';
import { FileBarChart } from 'lucide-react';
import { useToast } from '@/components/Toast';

const reports = [
  { title: 'Weekly Operations Summary', desc: 'Cross-module weekly rollup' },
  { title: 'AP Exception Report', desc: 'Invoice exceptions and resolutions' },
  { title: 'Production Efficiency Report', desc: 'Line performance and trends' },
];

export default function Reports() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      <Panel title="Reports">
        <div className="p-5">
          <p className="text-sm leading-relaxed text-ink-muted">
            This module pulls weekly and monthly rollups across all connected modules — sales pipeline, AP exceptions, production efficiency, and logistics SLA performance — into exportable summaries.
          </p>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-3">
        {reports.map((r) => (
          <div key={r.title} className="bg-base-panel p-5">
            <FileBarChart className="h-6 w-6 text-accent-blue" />
            <h3 className="mt-3 text-sm font-semibold text-ink-primary">{r.title}</h3>
            <p className="mt-1 text-xs text-ink-muted">{r.desc}</p>
            <BlueButton
              onClick={() => showToast('Report generating... ready in 30 seconds')}
              className="mt-4 w-full"
            >
              Generate
            </BlueButton>
          </div>
        ))}
      </div>
    </div>
  );
}
