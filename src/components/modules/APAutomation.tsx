import { useState, useRef } from 'react';
import {
  StatCard,
  Panel,
  ClickableRow,
  Badge,
  InfoBox,
  OutlineButton,
  BlueButton,
  StatusDot,
} from '@/components/ui';
import { useToast } from '@/components/Toast';
import {
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  Circle,
  UploadCloud,
  FileText,
  X,
  Search,
  Plus,
  ScanLine,
  XCircle,
  Clock,
  Copy,
} from 'lucide-react';

type TabId = 'queue' | 'upload' | 'match' | 'vendor';

const tabs: { id: TabId; label: string }[] = [
  { id: 'queue', label: 'Invoice Queue' },
  { id: 'upload', label: 'Scan & Upload Invoice (OCR)' },
  { id: 'match', label: '3-Way Match' },
  { id: 'vendor', label: 'Vendor Master' },
];

// ─── Invoice Queue data ───
interface Invoice {
  id: string;
  vendor: string;
  amount: string;
  badge: 'amber' | 'green' | 'blue' | 'red';
  badgeText: string;
}

const invoices: Invoice[] = [
  { id: 'INV-10482', vendor: 'SKF India', amount: '₹1.8L', badge: 'amber', badgeText: 'Exception' },
  { id: 'INV-10481', vendor: 'Tata Steel', amount: '₹18.5L', badge: 'green', badgeText: 'Matched' },
  { id: 'INV-10480', vendor: 'Greaves Cotton', amount: '₹4.2L', badge: 'blue', badgeText: 'Pending Approval' },
  { id: 'INV-10479', vendor: 'Greaves Cotton', amount: '₹4.2L', badge: 'red', badgeText: 'Duplicate Detected' },
  { id: 'INV-10478', vendor: 'Asian Paints', amount: '₹62K', badge: 'green', badgeText: 'Matched' },
];

type StepStatus = 'completed' | 'flagged' | 'pending';

const workflowSteps: { label: string; status: StepStatus }[] = [
  { label: 'Supplier invoice', status: 'completed' },
  { label: 'AI extraction', status: 'completed' },
  { label: 'PO match', status: 'completed' },
  { label: 'GRN match', status: 'pending' },
  { label: 'Business rules', status: 'completed' },
  { label: 'Exception detection', status: 'flagged' },
  { label: 'Approval', status: 'pending' },
  { label: 'ERP', status: 'pending' },
];

// ─── Vendor Master data ───
interface Vendor {
  name: string;
  category: string;
  gstin: string;
  risk: 'green' | 'amber' | 'red';
  riskLabel: string;
  totalBills: number;
  exceptions: number;
  lastBill: string;
  status: string;
}

const vendors: Vendor[] = [
  { name: 'SKF India', category: 'Bearings', gstin: '27AABCS1681G1ZN', risk: 'red', riskLabel: 'HIGH', totalBills: 24, exceptions: 6, lastBill: '15 Sep', status: 'Active' },
  { name: 'Tata Steel', category: 'Raw Material', gstin: '27AATCS0447N1ZS', risk: 'green', riskLabel: 'LOW', totalBills: 86, exceptions: 2, lastBill: '14 Sep', status: 'Preferred' },
  { name: 'Greaves Cotton', category: 'Components', gstin: '27AABCG0569P1ZX', risk: 'amber', riskLabel: 'MEDIUM', totalBills: 31, exceptions: 4, lastBill: '13 Sep', status: 'Active' },
  { name: 'Asian Paints', category: 'Consumables', gstin: '27AAACA9929L1Z5', risk: 'green', riskLabel: 'LOW', totalBills: 18, exceptions: 1, lastBill: '12 Sep', status: 'Active' },
  { name: 'Bosch India', category: 'Filters', gstin: '27AABCB2690N1ZA', risk: 'green', riskLabel: 'LOW', totalBills: 12, exceptions: 0, lastBill: '10 Sep', status: 'Preferred' },
];

// ─── 3-Way Match data ───
const poData = [
  { field: 'Supplier', value: 'SKF India' },
  { field: 'Item', value: 'Ball Bearings SKF-204' },
  { field: 'Quantity', value: '500 units' },
  { field: 'Unit Price', value: '₹310' },
  { field: 'Total', value: '₹1,55,000' },
  { field: 'PO Date', value: '01 Sep 2026' },
  { field: 'Approved by', value: 'Procurement Head' },
];

const grnData = [
  { field: 'GRN Status', value: 'NOT RECEIVED YET', warning: true },
  { field: 'Expected delivery', value: '16 Sep 2026' },
  { field: 'Store In-charge', value: 'Pending' },
  { field: 'Note', value: 'GRN required before bill approval' },
];

const billData = [
  { field: 'Invoice', value: 'SKF/2026/09/4821' },
  { field: 'Quantity', value: '500 units', ok: true },
  { field: 'Unit Price', value: '₹360', mismatch: true },
  { field: 'Total', value: '₹2,12,400', mismatch: true },
  { field: 'GST', value: '₹32,400' },
];

// ─── OCR extracted fields ───
const extractedFields = [
  { label: 'Supplier Name', value: 'SKF India Pvt Ltd' },
  { label: 'Supplier GSTIN', value: '27AABCS1681G1ZN' },
  { label: 'Invoice Number', value: 'SKF/2026/09/4821' },
  { label: 'Invoice Date', value: '15 Sep 2026' },
  { label: 'Due Date', value: '15 Oct 2026' },
  { label: 'PO Reference', value: 'PO-2026-1180' },
  { label: 'HSN Code', value: '84829900 (Ball Bearings)' },
  { label: 'Quantity', value: '500 units' },
  { label: 'Unit Price', value: '₹360' },
  { label: 'Subtotal', value: '₹1,80,000' },
  { label: 'GST (18%)', value: '₹32,400' },
  { label: 'Total Amount', value: '₹2,12,400' },
];

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
        <span className="font-mono text-sm text-accent-green">Live module — Powered by AP InvoiceFlow AI</span>
      </div>

      {/* KPI strip (always visible) */}
      <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Invoices Received" value="1,842" />
        <StatCard label="AI Processed" value="1,761" variant="green" />
        <StatCard label="Matched" value="1,643" />
        <StatCard label="Exceptions" value="118" variant="amber" />
        <StatCard label="Pending Approval" value="42" />
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
      <Panel title="Invoice Queue">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Invoice ID</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Vendor</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Amount</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Status</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => setSelected(selected?.id === inv.id ? null : inv)}
                  className={`cursor-pointer border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover ${selected?.id === inv.id ? 'bg-base-hover' : ''}`}
                >
                  <td className="px-5 py-4 font-mono text-ink-primary">{inv.id}</td>
                  <td className="px-5 py-4 text-ink-primary">{inv.vendor}</td>
                  <td className="px-5 py-4 text-right font-mono text-ink-primary">{inv.amount}</td>
                  <td className="px-5 py-4">
                    <Badge variant={inv.badge}>{inv.badgeText}</Badge>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-mono text-xs text-accent-blue hover:underline">View</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

// ─── TAB 2: Scan & Upload Invoice (OCR) ───
function UploadBill() {
  const { showToast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploaded, setUploaded] = useState(true); // demo state: pre-uploaded
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = () => {
    setUploaded(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-px bg-base-border lg:grid-cols-2">
        {/* LEFT SIDE: Upload + Preview */}
        <div className="bg-base-panel p-5 space-y-4">
          <h3 className="text-sm font-semibold text-ink-primary">Upload Vendor Bill</h3>

          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-12 transition-colors ${
              dragging ? 'border-accent-blue bg-accent-blue/5' : 'border-base-border hover:border-ink-muted'
            }`}
          >
            <UploadCloud className={`h-10 w-10 ${dragging ? 'text-accent-blue' : 'text-ink-muted'}`} />
            <p className="mt-3 text-sm text-ink-primary">Drop vendor bill here or click to upload</p>
            <p className="mt-1 font-mono text-xs text-ink-muted">Supported: PDF, JPG, PNG, Excel</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(); }}
            />
          </div>

          {/* Sample invoice thumbnails */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex h-28 items-center justify-center bg-base-hover border border-base-border">
                <FileText className="h-8 w-8 text-ink-muted/40" />
              </div>
              <p className="text-center font-mono text-xs text-ink-muted">Sample: Tata Steel Bill</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex h-28 items-center justify-center bg-base-hover border border-base-border">
                <FileText className="h-8 w-8 text-ink-muted/40" />
              </div>
              <p className="text-center font-mono text-xs text-ink-muted">Sample: SKF Invoice</p>
            </div>
          </div>

          {/* Document preview (demo: shown by default) */}
          {uploaded && (
            <div className="space-y-2 border border-base-border bg-base-panel">
              <div className="flex items-center gap-2 border-b border-base-border px-4 py-2">
                <ScanLine className="h-4 w-4 text-accent-blue" />
                <span className="font-mono text-xs text-ink-primary">INV-10483 — SKF India — Uploaded</span>
                <button
                  onClick={() => { setUploaded(false); showToast('Document removed'); }}
                  className="ml-auto text-ink-muted hover:text-ink-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative h-80 bg-gradient-to-b from-base-hover to-base-panel flex items-center justify-center p-6">
                {/* Mock invoice preview */}
                <div className="w-full max-w-xs space-y-3 opacity-60">
                  <div className="h-6 bg-ink-muted/20 w-3/4" />
                  <div className="h-px bg-base-border" />
                  <div className="space-y-1.5">
                    <div className="h-3 bg-ink-muted/15 w-full" />
                    <div className="h-3 bg-ink-muted/15 w-5/6" />
                    <div className="h-3 bg-ink-muted/15 w-4/5" />
                    <div className="h-3 bg-ink-muted/15 w-3/4" />
                  </div>
                  <div className="h-px bg-base-border" />
                  <div className="space-y-1.5">
                    <div className="h-3 bg-ink-muted/15 w-full" />
                    <div className="h-3 bg-ink-muted/15 w-2/3" />
                  </div>
                  <div className="h-px bg-base-border" />
                  <div className="h-5 bg-ink-muted/20 w-1/3 ml-auto" />
                </div>
                <span className="absolute bottom-3 right-4 font-mono text-xs text-ink-muted">Scanned Bill Preview</span>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT SIDE: AI Extracted Data */}
        <div className="bg-base-panel p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-primary">AI Extracted Data</h3>
          </div>

          {/* OCR confidence badge */}
          <div className="flex items-center gap-3 border border-accent-green/30 bg-accent-green/10 px-4 py-3">
            <CheckCircle2 className="h-4 w-4 text-accent-green" />
            <span className="font-mono text-sm text-accent-green">OCR Extraction Complete — 94% confidence</span>
          </div>

          {/* Extracted fields grid */}
          <div className="grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2">
            {extractedFields.map((f) => (
              <div key={f.label} className="bg-base-panel px-4 py-3">
                <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{f.label}</p>
                <p className="mt-1 text-sm text-ink-primary">{f.value}</p>
              </div>
            ))}
          </div>

          {/* AI Validation Alerts */}
          <div className="space-y-2">
            <h4 className="font-mono text-xs uppercase tracking-wider text-ink-muted">AI Validation Alerts</h4>
            <ValidationAlert variant="amber" text="Price Mismatch: PO unit price is ₹310 — vendor billed ₹360 (+16.1% variance)" />
            <ValidationAlert variant="green" text="GSTIN Valid — matches vendor master" />
            <ValidationAlert variant="green" text="PO Reference found — PO-2026-1180" />
            <ValidationAlert variant="amber" text="Quantity matches PO but GRN not yet received" />
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 pt-1">
            <BlueButton onClick={() => showToast('Sent to 3-Way Match')}>Send to 3-Way Match</BlueButton>
            <OutlineButton onClick={() => showToast('Exception flagged')}>Flag Exception</OutlineButton>
            <OutlineButton onClick={() => showToast('GRN request sent')}>Request GRN</OutlineButton>
            <button
              onClick={() => { setUploaded(false); showToast('Bill rejected'); }}
              className="border border-accent-red/40 bg-transparent px-4 py-2 font-medium text-accent-red transition-colors hover:bg-accent-red/10"
            >
              Reject Bill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValidationAlert({ variant, text }: { variant: 'green' | 'amber'; text: string }) {
  const Icon = variant === 'green' ? CheckCircle2 : AlertTriangle;
  const color = variant === 'green' ? 'text-accent-green' : 'text-accent-amber';
  const border = variant === 'green' ? 'border-accent-green/20' : 'border-accent-amber/20';
  return (
    <div className={`flex items-start gap-2 border ${border} px-3 py-2.5`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <span className="text-sm text-ink-primary leading-snug">{text}</span>
    </div>
  );
}

// ─── TAB 3: 3-Way Match ───
function ThreeWayMatch() {
  const { showToast } = useToast();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-wider text-ink-muted">Reference:</span>
        <span className="font-mono text-sm text-ink-primary">PO-2026-1180 · Invoice: SKF/2026/09/4821</span>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 gap-px bg-base-border lg:grid-cols-3">
        {/* Column 1: PO */}
        <div className="bg-base-panel">
          <div className="border-b border-base-border px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-primary">Purchase Order (PO-2026-1180)</h3>
          </div>
          <div className="divide-y divide-base-border">
            {poData.map((row) => (
              <div key={row.field} className="px-4 py-3">
                <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{row.field}</p>
                <p className="mt-1 font-mono text-sm text-ink-primary">{row.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: GRN */}
        <div className="bg-base-panel">
          <div className="border-b border-base-border px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-primary">Goods Receipt Note</h3>
          </div>
          <div className="divide-y divide-base-border">
            {grnData.map((row) => (
              <div key={row.field} className="px-4 py-3">
                <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{row.field}</p>
                <p className={`mt-1 font-mono text-sm ${row.warning ? 'text-accent-amber' : 'text-ink-primary'}`}>
                  {row.warning && <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />}
                  {row.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: Supplier Bill */}
        <div className="bg-base-panel">
          <div className="border-b border-base-border px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-primary">Supplier Bill</h3>
          </div>
          <div className="divide-y divide-base-border">
            {billData.map((row) => (
              <div key={row.field} className="px-4 py-3">
                <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{row.field}</p>
                <p className={`mt-1 font-mono text-sm flex items-center gap-1.5 ${row.mismatch ? 'text-accent-red' : 'text-ink-primary'}`}>
                  {row.value}
                  {row.ok && <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />}
                  {row.mismatch && <XCircle className="h-3.5 w-3.5 text-accent-red" />}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Match result banner */}
      <div className="border border-accent-red/40 bg-accent-red/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-accent-red" />
          <span className="font-mono text-sm font-semibold text-accent-red">
            EXCEPTION — Price variance +16.1% | GRN pending
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <BlueButton onClick={() => showToast('Invoice approved anyway')}>Approve Anyway</BlueButton>
        <OutlineButton onClick={() => showToast('Query sent to supplier')}>Query Supplier</OutlineButton>
        <OutlineButton onClick={() => showToast('On hold until GRN received')}>Hold for GRN</OutlineButton>
        <button
          onClick={() => showToast('Escalation created')}
          className="border border-accent-red/40 bg-transparent px-4 py-2 font-medium text-accent-red transition-colors hover:bg-accent-red/10"
        >
          Escalate
        </button>
      </div>
    </div>
  );
}

// ─── TAB 4: Vendor Master ───
function VendorMaster() {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');

  const filtered = vendors.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.category.toLowerCase().includes(search.toLowerCase()) ||
    v.gstin.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by name, category, GSTIN..."
            className="w-full border border-base-border bg-base-panel px-10 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-accent-blue focus:outline-none"
          />
        </div>
        <BlueButton onClick={() => showToast('Add Supplier dialog opened')}>
          <span className="flex items-center gap-2"><Plus className="h-4 w-4" /> Add Supplier</span>
        </BlueButton>
      </div>

      <Panel title="Vendor Master">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border">
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Supplier</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Category</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">GSTIN</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Risk Score</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Total Bills</th>
                <th className="px-5 py-3 text-right font-mono text-xs uppercase tracking-wider text-ink-muted">Exceptions</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Last Bill</th>
                <th className="px-5 py-3 text-left font-mono text-xs uppercase tracking-wider text-ink-muted">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.name} className="border-b border-base-border last:border-b-0 transition-colors hover:bg-base-hover">
                  <td className="px-5 py-3.5 text-ink-primary">{v.name}</td>
                  <td className="px-5 py-3.5 text-ink-muted">{v.category}</td>
                  <td className="px-5 py-3.5 font-mono text-xs text-ink-muted">{v.gstin}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <StatusDot variant={v.risk} />
                      <span className={v.risk === 'red' ? 'text-accent-red' : v.risk === 'amber' ? 'text-accent-amber' : 'text-accent-green'}>
                        {v.riskLabel}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-right font-mono text-ink-primary">{v.totalBills}</td>
                  <td className={`px-5 py-3.5 text-right font-mono ${v.exceptions > 5 ? 'text-accent-red' : v.exceptions > 2 ? 'text-accent-amber' : 'text-ink-primary'}`}>
                    {v.exceptions}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-ink-muted">{v.lastBill}</td>
                  <td className="px-5 py-3.5">
                    <span className={v.status === 'Preferred' ? 'text-accent-green' : 'text-ink-primary'}>
                      {v.status === 'Preferred' ? '★ Preferred' : v.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-ink-muted">No suppliers found</td>
                </tr>
              )}
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
