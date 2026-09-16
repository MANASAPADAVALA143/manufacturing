import { Panel, Badge } from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  FileBarChart,
  FileText,
  ShieldCheck,
  Factory,
  Wrench,
  Truck,
  Download,
  RefreshCw,
  Clock,
  Mail,
} from 'lucide-react';

interface ReportCard {
  id: string;
  title: string;
  desc: string;
  lastGenerated: string;
  icon: typeof FileBarChart;
}

const reportCards: ReportCard[] = [
  { id: 'weekly-ops', title: 'Weekly Operations Summary', desc: 'Cross-module weekly rollup', lastGenerated: 'Sep 14, 2026', icon: FileBarChart },
  { id: 'ap-exception', title: 'AP Exception Report', desc: 'Invoice exceptions and resolutions', lastGenerated: 'Sep 15, 2026', icon: FileText },
  { id: 'prod-efficiency', title: 'Production Efficiency Report', desc: 'Line performance and trends', lastGenerated: 'Sep 13, 2026', icon: Factory },
  { id: 'quality-defect', title: 'Quality & Defect Report', desc: 'Batch-wise defect analysis', lastGenerated: 'Sep 12, 2026', icon: ShieldCheck },
  { id: 'maintenance-wo', title: 'Maintenance Work Order Summary', desc: 'Equipment health and WO status', lastGenerated: 'Sep 11, 2026', icon: Wrench },
  { id: 'logistics-sla', title: 'Logistics SLA Report', desc: 'Carrier performance and delivery compliance', lastGenerated: 'Sep 10, 2026', icon: Truck },
];

const recentReports = [
  { name: 'Weekly Ops Summary', type: 'Weekly', typeBadge: 'blue' as const, generated: '14 Sep 2026', generatedBy: 'AI Auto', generatedBadge: 'green' as const },
  { name: 'AP Exception Report', type: 'Daily', typeBadge: 'amber' as const, generated: '15 Sep 2026', generatedBy: 'AI Auto', generatedBadge: 'green' as const },
  { name: 'Production Efficiency', type: 'Weekly', typeBadge: 'blue' as const, generated: '13 Sep 2026', generatedBy: 'Manual', generatedBadge: 'grey' as const },
  { name: 'Quality Report', type: 'Weekly', typeBadge: 'blue' as const, generated: '12 Sep 2026', generatedBy: 'AI Auto', generatedBadge: 'green' as const },
];

const scheduledReports = [
  { name: 'Weekly Ops Summary', schedule: 'Every Monday 7:00 AM', recipient: 'GM email' },
  { name: 'AP Exception Report', schedule: 'Daily 8:00 AM', recipient: 'Purchase Head email' },
  { name: 'Production Efficiency', schedule: 'Every Friday 6:00 PM', recipient: 'Plant Manager email' },
];

export default function Reports() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      {/* Report cards */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-3">
        {reportCards.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.id} className="flex flex-col bg-base-panel p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-base-border bg-base-bg">
                  <Icon className="h-5 w-5 text-accent-blue" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold leading-snug text-ink-primary">{r.title}</h3>
                  <p className="mt-1 text-xs text-ink-muted">{r.desc}</p>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>Last generated: <span className="font-mono text-ink-primary">{r.lastGenerated}</span></span>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => showToast(`Downloading ${r.title} (PDF)`)}
                  className="flex flex-1 items-center justify-center gap-2 border border-base-border px-3 py-2 text-xs font-medium text-ink-primary transition-colors hover:border-accent-blue hover:text-accent-blue"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  onClick={() => showToast(`${r.title} generating... ready in 30 seconds`)}
                  className="flex flex-1 items-center justify-center gap-2 bg-accent-blue px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Generate
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Reports Table */}
      <Panel title="Recent Reports">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Report Name</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Type</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Generated On</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Generated By</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Download</th>
              </tr>
            </thead>
            <tbody>
              {recentReports.map((r) => (
                <tr key={r.name} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 text-ink-primary">{r.name}</td>
                  <td className="px-5 py-3"><Badge variant={r.typeBadge}>{r.type}</Badge></td>
                  <td className="px-5 py-3 font-mono text-ink-muted">{r.generated}</td>
                  <td className="px-5 py-3"><Badge variant={r.generatedBadge}>{r.generatedBy}</Badge></td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => showToast(`Downloading ${r.name} (PDF)`)}
                      className="inline-flex items-center gap-2 text-xs font-medium text-accent-blue transition-colors hover:text-blue-400"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Scheduled Reports */}
      <Panel title="Auto-scheduled Reports">
        <div className="divide-y divide-base-border">
          {scheduledReports.map((s) => (
            <div key={s.name} className="flex items-center gap-4 p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-base-border bg-base-bg">
                <Clock className="h-4 w-4 text-accent-amber" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-primary">{s.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-3 w-3" />
                    {s.schedule}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3 w-3" />
                    {s.recipient}
                  </span>
                </div>
              </div>
              <Badge variant="green">ACTIVE</Badge>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
