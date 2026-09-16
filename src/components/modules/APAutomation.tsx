import { useState, useRef } from 'react';
import { StatCard, Panel, ClickableRow, Badge, InfoBox, OutlineButton, BlueButton } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { ArrowDown, CheckCircle2, AlertTriangle, Circle, UploadCloud, FileText, X } from 'lucide-react';

type TabId = 'queue' | 'upload' | 'match' | 'vendor';

const tabs: { id: TabId; label: string }[] = [
  { id: 'queue', label: 'Invoice Queue' },
  { id: 'upload', label: 'Upload Bill' },
  { id: 'match', label: '3-Way Match' },
  { id: 'vendor', label: 'Vendor Master' },
];

interface Invoice {
  id: string;
  badge: 'amber' | 'green' | 'blue';
  badgeText: string;
}

const invoices: Invoice[] = [
  { id: 'INV-10482', badge: 'amber', badgeText: 'Exception' },
  { id: 'INV-10481', badge: 'green', badgeText: 'Matched' },
  { id: 'INV-10480', badge: 'blue', badgeText: 'Pending Approval' },
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

// Vendor master data
interface Vendor {
  name: string;
  category: string;
  risk: 'green' | 'amber' | 'red';
  riskLabel: string;
  totalBills: string;
  exceptions: number;
  lastBill: string;
}

const vendors: Vendor[] = [
  { name: 'Tata Steel Supplies', category: 'Steel', risk: 'green', riskLabel: 'Low', totalBills: '342', exceptions: 4, lastBill: '2026-09-14' },
  { name: 'Jindal Metal Works', category: 'Steel', risk: 'green', riskLabel: 'Low', totalBills: '218', exceptions: 2, lastBill: '2026-09-12' },
  { name: 'Bharat Chemicals Ltd', category: 'Chemicals', risk: 'amber', riskLabel: 'Medium', totalBills: '176', exceptions: 11, lastBill: '2026-09-15' },
  { name: 'PolyPack Industries', category: 'Packaging', risk: 'amber', riskLabel: 'Medium', totalBills: '94', exceptions: 7, lastBill: '2026-09-10' },
  { name: 'FastFreight Logistics', category: 'Logistics', risk: 'red', riskLabel: 'High', totalBills: '58', exceptions: 14, lastBill: '2026-09-15' },
  { name: 'Arcelor Coil Center', category: 'Steel', risk: 'green', riskLabel: 'Low', totalBills: '127', exceptions: 3, lastBill: '2026-09-13' },
];

// 3-way match data
const matchData = {
  po: [
    { field: 'Supplier', value: 'Tata Steel Supplies' },
    { field: 'PO Number', value: 'PO-88213' },
    { field: 'Item', value: 'Steel Coil A36' },
    { field: 'Quantity', value: '4,200 units' },
    { field: 'Unit Price', value: '₹14,200' },
    { field: 'Total', value: '₹5,96,40,000' },
    { field: 'Delivery Date', value: '2026-09-20' },
  ],
  grn: [
    { field: 'Supplier', value: 'Tata Steel Supplies' },
    { field: 'GRN Number', value: 'GRN-5521' },
    { field: 'Item', value: 'Steel Coil A36' },
    { field: 'Quantity', value: '4,200 units' },
    { field: 'Unit Price', value: '—' },
    { field: 'Total', value: '—' },
    { field: 'Received Date', value: '2026-09-18' },
  ],
  bill: [
    { field: 'Supplier', value: 'Tata Steel Supplies' },
    { field: 'Bill Number', value: 'INV-10482' },
    { field: 'Item', value: 'Steel Coil A36' },
    { field: 'Quantity', value: '4,200 units' },
    { field: 'Unit Price', value: '₹14,850' },
    { field: 'Total', value: '₹6,23,70,000' },
    { field: 'Bill Date', value: '2026-09-18' },
  ],
};

const mismatchFields = ['Unit Price', 'Total'];

export default function APAutomation() {
  const [tab, setTab] = useState<TabId>('queue');
  const [selected, setSelected] = useState<Invoice | null>(null);

  return (
    <div className="space-y-6">
      {/* Live banner */}
      <div className="flex items-center gap-3 border border-accent-green/30 bg-accent-green/10 px-5 py-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green"></span>
        </span>
        <span className="font-mono text-sm text-accent-green">Live module — Powered by AP InvoiceFlow</span>
      </div>

      {/* KPI strip (always visible) */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Invoices received" value="1,842" />
        <StatCard label="AI processed" value="1,761" variant="green" />
        <StatCard label="Matched" value="1,643" />
        <StatCard label="Exceptions" value="118" variant="amber" />
        <StatCard label="Pending approval" value="42" />
      </div>

      {/* Tab bar */}
      <div className="flex gap-px border border-base-border bg-base-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-base-panel text-ink-primary'
                : 'bg-base-panel/50 text-ink-muted hover:text-ink-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'queue' && <InvoiceQueue selected={selected} setSelected={setSelected} />}
      {tab === 'upload' && <UploadBill />}
      {tab === 'match' && <ThreeWayMatch />}
      {tab === 'vendor' && <VendorMaster />}
    </div>
  );
}

// ─── TAB 1: Invoice Queue ───
function InvoiceQueue({
  selected,
  setSelected,
}: {
  selected: Invoice | null;
  setSelected: (inv: Invoice | null) => void;
}) {
  return (
    <div className="space-y-6">
      <Panel title="Invoice queue">
        <div className="divide-y divide-base-border">
          {invoices.map((inv) => (
            <ClickableRow
              key={inv.id}
              onClick={() => setSelected(selected?.id === inv.id ? null : inv)}
              active={selected?.id === inv.id}
            >
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

// ─── TAB 2: Upload Bill ───
function UploadBill() {
  const { showToast } = useToast();
  const [extracted, setExtracted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setExtracted(false);
    setTimeout(() => {
      setExtracted(true);
    }, 800);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const extractedFields = [
    { label: 'Supplier Name', value: 'Tata Steel Supplies' },
    { label: 'Bill No', value: 'INV-10482' },
    { label: 'Date', value: '2026-09-18' },
    { label: 'Amount', value: '₹6,23,70,000' },
    { label: 'PO Reference', value: 'PO-88213' },
    { label: 'GST Amount', value: '₹11,22,660' },
  ];

  const lineItems = [
    { desc: 'Steel Coil A36 — 10mm', qty: '4,200 units', rate: '₹14,850', amount: '₹6,23,70,000' },
    { desc: 'Freight & Handling', qty: '1 lot', rate: '₹45,000', amount: '₹45,000' },
  ];

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <Panel>
        <div className="p-5">
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-16 transition-colors ${
              dragging ? 'border-accent-blue bg-accent-blue/5' : 'border-base-border hover:border-ink-muted'
            }`}
          >
            <UploadCloud className={`h-10 w-10 ${dragging ? 'text-accent-blue' : 'text-ink-muted'}`} />
            <p className="mt-3 text-sm text-ink-primary">Drag & drop your bill here</p>
            <p className="mt-1 font-mono text-xs text-ink-muted">PDF · JPG · PNG — max 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {fileName && !extracted && (
            <div className="mt-4 flex items-center gap-3 border border-base-border bg-base-panel px-4 py-3">
              <FileText className="h-5 w-5 text-accent-blue" />
              <span className="text-sm text-ink-primary">{fileName}</span>
              <span className="ml-auto font-mono text-xs text-ink-muted">Extracting...</span>
            </div>
          )}
        </div>
      </Panel>

      {/* Extracted fields */}
      {extracted && (
        <>
          <div className="flex items-center gap-3 border border-accent-amber/30 bg-accent-amber/10 px-5 py-3">
            <AlertTriangle className="h-4 w-4 text-accent-amber" />
            <span className="font-mono text-sm text-accent-amber">AI Extracted — Pending Match</span>
            <button
              onClick={() => { setFileName(null); setExtracted(false); }}
              className="ml-auto text-ink-muted hover:text-ink-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Panel title="Extracted Fields">
            <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-3">
              {extractedFields.map((f) => (
                <div key={f.label} className="bg-base-panel px-4 py-3">
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{f.label}</p>
                  <p className="mt-1 text-sm text-ink-primary">{f.value}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Line Items">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-border">
                    <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Description</th>
                    <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Qty</th>
                    <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Rate</th>
                    <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-base-border last:border-b-0">
                      <td className="px-5 py-3 text-ink-primary">{item.desc}</td>
                      <td className="px-5 py-3 font-mono text-ink-primary">{item.qty}</td>
                      <td className="px-5 py-3 font-mono text-ink-primary">{item.rate}</td>
                      <td className="px-5 py-3 font-mono text-ink-primary">{item.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="flex gap-3">
            <BlueButton onClick={() => showToast('Sent to 3-way match')}>Send to 3-Way Match</BlueButton>
            <OutlineButton onClick={() => { setFileName(null); setExtracted(false); }}>
              Upload Another
            </OutlineButton>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB 3: 3-Way Match ───
function ThreeWayMatch() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">Match Score</span>
        <Badge variant="amber">PARTIAL</Badge>
        <span className="font-mono text-xs text-ink-muted">Bill: INV-10482 · PO: PO-88213 · GRN: GRN-5521</span>
      </div>

      <div className="grid grid-cols-1 gap-px bg-base-border lg:grid-cols-3">
        <MatchColumn title="Purchase Order" data={matchData.po} mismatches={mismatchFields} />
        <MatchColumn title="Goods Receipt Note" data={matchData.grn} mismatches={[]} />
        <MatchColumn title="Supplier Bill" data={matchData.bill} mismatches={mismatchFields} />
      </div>

      <InfoBox variant="amber">
        Price variance detected: PO unit price ₹14,200 vs Bill unit price ₹14,850 — difference of ₹650/unit (₹27,30,000 total).
      </InfoBox>

      <div className="flex flex-wrap gap-3">
        <BlueButton onClick={() => showToast('Invoice approved')}>Approve</BlueButton>
        <OutlineButton onClick={() => showToast('Query sent to supplier')}>Query Supplier</OutlineButton>
        <OutlineButton onClick={() => showToast('Escalation created')}>Escalate</OutlineButton>
      </div>
    </div>
  );
}

function MatchColumn({
  title,
  data,
  mismatches,
}: {
  title: string;
  data: { field: string; value: string }[];
  mismatches: string[];
}) {
  return (
    <div className="bg-base-panel">
      <div className="border-b border-base-border px-4 py-3">
        <h3 className="text-sm font-semibold text-ink-primary">{title}</h3>
      </div>
      <div className="divide-y divide-base-border">
        {data.map((row) => {
          const isMismatch = mismatches.includes(row.field);
          return (
            <div key={row.field} className="px-4 py-3">
              <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{row.field}</p>
              <p
                className={`mt-1 font-mono text-sm ${
                  isMismatch ? 'text-accent-red' : 'text-ink-primary'
                }`}
              >
                {row.value}
                {isMismatch && <span className="ml-2 text-accent-red">⚠</span>}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB 4: Vendor Master ───
function VendorMaster() {
  return (
    <div className="space-y-6">
      <Panel title="Vendor Master">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Name</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Category</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Risk Score</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Total Bills</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Exceptions</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Last Bill Date</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.name} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3 text-ink-primary">{v.name}</td>
                  <td className="px-5 py-3 text-ink-muted">{v.category}</td>
                  <td className="px-5 py-3">
                    <Badge variant={v.risk}>{v.riskLabel}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-ink-primary">{v.totalBills}</td>
                  <td className={`px-5 py-3 text-right font-mono ${v.exceptions > 10 ? 'text-accent-red' : v.exceptions > 5 ? 'text-accent-amber' : 'text-ink-primary'}`}>
                    {v.exceptions}
                  </td>
                  <td className="px-5 py-3 font-mono text-ink-muted">{v.lastBill}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ─── Shared: Workflow Step ───
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
