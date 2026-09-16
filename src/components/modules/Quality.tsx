import { StatCard, Panel, InfoBox } from '@/components/ui';

export default function Quality() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-3">
        <StatCard label="Inspections" value="4,820" />
        <StatCard label="Passed" value="4,701" variant="green" />
        <StatCard label="Defects" value="119" variant="red" />
      </div>

      <Panel title="AI signal">
        <div className="p-5 space-y-5">
          <p className="text-sm text-ink-primary">
            Unusual increase in defects detected for Product X.
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">Defect rate</span>
            <span className="font-mono text-lg font-semibold text-accent-red">2.1% → 3.8%</span>
          </div>
          <InfoBox>
            Possible correlation: Production Line 3 + Supplier Batch #782. Flagged for quality engineer review.
          </InfoBox>
        </div>
      </Panel>
    </div>
  );
}
