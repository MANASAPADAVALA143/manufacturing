import { useState, type ReactNode } from 'react';
import { CheckCircle2, CircleDashed, FileSearch, Loader2, UploadCloud } from 'lucide-react';
import { useApp } from '@/lib/app';
import { AI_BACKEND_ENABLED } from '@/lib/config';
import { entity } from '@/lib/data/entities';
import { useRefMaps } from '@/lib/data/hooks';
import { SupabaseBackend } from '@/lib/data/supabaseBackend';
import type { TableName } from '@/lib/data/schema';
import { fileText, type Extraction } from '@/lib/extract';
import { InfoBox } from '@/components/ui';
import { useToast } from '@/components/Toast';
import type { BaseRow } from '@/lib/data/schema';
import { FilePickers, checkFile } from './Attachments';
import { RecordForm } from './EntityManager';
import { useRefTables } from './FieldInput';
import { setParam } from '@/lib/router';

async function toBase64(f: File) {
  const buf = new Uint8Array(await f.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Upload → extract → review → save. Text documents use the rule-based parser.
 * PDF/images need the `document-extract` Edge Function (OCR + LLM, server-side
 * keys); without it the user enters fields manually and the file is attached.
 */
export function DocumentCapture({ table, kind, parse, title, hint }: {
  table: TableName; kind: 'rfq' | 'invoice'; title: string; hint: ReactNode;
  parse: (text: string, maps: Record<string, Map<string, BaseRow>>) => Extraction;
}) {
  const { backend, company } = useApp();
  const { showToast } = useToast();
  const def = entity(table);
  const extraTables: TableName[] = kind === 'invoice' ? ['purchase_orders'] : [];
  const refTables = useRefTables(def.fields);
  const { maps } = useRefMaps([...refTables, ...extraTables]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<{ file: File; ex: Extraction | null; reason?: string } | null>(null);

  const handle = async (file: File) => {
    const bad = checkFile(file);
    if (bad) return showToast(bad, 'error');
    setBusy(true);
    try {
      const text = await fileText(file);
      if (text) {
        setResult({ file, ex: parse(text, maps) });
      } else if (AI_BACKEND_ENABLED && backend instanceof SupabaseBackend) {
        const ex = await backend.invoke<Extraction>('document-extract', { kind, company_id: company?.id, file_name: file.name, mime_type: file.type, data_base64: await toBase64(file) });
        setResult({ file, ex: { ...ex, method: 'ai' } });
      } else {
        setResult({ file, ex: null, reason: 'Automatic reading of PDF and image documents requires the AI extraction service (Supabase Edge Function “document-extract”), which is not configured in this environment. Enter the details below — the document will be attached to the record.' });
      }
    } catch (e) {
      setResult({ file, ex: null, reason: `Extraction failed: ${(e as Error).message}. Enter the details manually.` });
    } finally {
      setBusy(false);
    }
  };

  const banner = result && (
    result.ex ? (
      <InfoBox variant={result.ex.confidence >= 0.8 ? 'green' : 'amber'}>
        <p className="font-medium">
          {result.ex.method === 'ai' ? 'AI extraction' : 'Rule-based extraction'} from {result.file.name}: {result.ex.found.length} of {result.ex.found.length + result.ex.missing.length} fields found
          {result.ex.method === 'ai' ? ` (model confidence ${(result.ex.confidence * 100).toFixed(0)}%)` : ''}. Review every field before saving.
        </p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {result.ex.found.map((k) => <li key={k} className="flex items-center gap-1 text-accent-green"><CheckCircle2 className="h-3.5 w-3.5" />{def.fields.find((f) => f.key === k)?.label ?? k}</li>)}
          {result.ex.missing.map((k) => <li key={k} className="flex items-center gap-1 text-ink-muted"><CircleDashed className="h-3.5 w-3.5" />{def.fields.find((f) => f.key === k)?.label ?? k}</li>)}
        </ul>
        {result.ex.notes.map((n) => <p key={n} className="mt-1 text-xs text-accent-amber">{n}</p>)}
      </InfoBox>
    ) : <InfoBox variant="amber">{result.reason}</InfoBox>
  );

  return (
    <div className="rounded-xl border border-base-border bg-base-panel p-4 shadow-card sm:p-5">
      <h3 className="flex items-center gap-2 font-semibold text-ink-primary"><FileSearch className="h-5 w-5 text-accent-blue" />{title}</h3>
      <div className="mt-1 text-sm text-ink-muted">{hint}</div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void handle(f); }}
        className={`mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${dragging ? 'border-accent-blue bg-accent-blue/5' : 'border-slate-300'}`}
      >
        {busy ? <Loader2 className="h-9 w-9 animate-spin text-accent-blue" /> : <UploadCloud className="h-9 w-9 text-ink-faint" />}
        <p className="mt-2 text-sm text-ink-primary">Drop a document here, choose a file, or take a photo</p>
        <p className="mt-1 font-mono text-xs text-ink-faint">PDF, JPG, PNG, TXT, CSV · max 15 MB</p>
        <div className="mt-3"><FilePickers multiple={false} onFiles={(fs) => fs[0] && void handle(fs[0])} label="Choose file" /></div>
      </div>
      {result && (
        <RecordForm def={def} row={null} maps={maps} initial={result.ex?.values} initialFiles={[result.file]} banner={banner}
          title={`New ${def.label.toLowerCase()} from document`}
          onClose={() => setResult(null)}
          onSaved={(id) => { setResult(null); if (id) setParam('id', id); }} />
      )}
    </div>
  );
}
