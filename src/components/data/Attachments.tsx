import { useRef, useState } from 'react';
import { Camera, FileText, Image as ImageIcon, Paperclip, Upload } from 'lucide-react';
import { useApp } from '@/lib/app';
import { useActions, useQuery } from '@/lib/data/hooks';
import type { Attachment, TableName } from '@/lib/data/schema';
import { dateTime } from '@/lib/format';
import { useToast } from '@/components/Toast';

export const ACCEPT = 'image/*,application/pdf,.xlsx,.xls,.csv,.doc,.docx,.txt';
export const MAX_FILE_MB = 15;

export function checkFile(f: File): string | null {
  if (f.size > MAX_FILE_MB * 1024 * 1024) return `${f.name} is larger than ${MAX_FILE_MB} MB`;
  if (!/^(image\/|application\/pdf|text\/|application\/vnd|application\/msword)/.test(f.type) && !/\.(pdf|xlsx?|csv|docx?|txt)$/i.test(f.name)) return `${f.name}: unsupported file type`;
  return null;
}

/** File + camera pickers. On phones, the camera button opens the rear camera directly. */
export function FilePickers({ onFiles, multiple = true, label = 'Attach file' }: { onFiles: (files: File[]) => void; multiple?: boolean; label?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const handle = (list: FileList | null) => {
    const files = [...(list ?? [])];
    const bad = files.map(checkFile).filter(Boolean);
    if (bad.length) showToast(bad.join('; '), 'error');
    const ok = files.filter((f) => !checkFile(f));
    if (ok.length) onFiles(ok);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-ink-muted hover:border-accent-blue hover:text-accent-blue">
        <Upload className="h-4 w-4" /> {label}
      </button>
      <button type="button" onClick={() => camRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-ink-muted hover:border-accent-blue hover:text-accent-blue">
        <Camera className="h-4 w-4" /> Take photo
      </button>
      <input ref={fileRef} type="file" accept={ACCEPT} multiple={multiple} className="hidden" onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

export function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-base-subtle px-3 py-2 text-sm">
          {f.type.startsWith('image/') ? <ImageIcon className="h-4 w-4 text-ink-muted" /> : <FileText className="h-4 w-4 text-ink-muted" />}
          <span className="min-w-0 flex-1 truncate">{f.name}</span>
          <span className="font-mono text-xs text-ink-faint">{(f.size / 1024).toFixed(0)} KB</span>
          <button type="button" onClick={() => onRemove(i)} className="text-xs text-accent-red hover:underline">Remove</button>
        </li>
      ))}
    </ul>
  );
}

export function AttachmentList({ table, recordId, canUpload }: { table: TableName; recordId: string; canUpload: boolean }) {
  const { backend } = useApp();
  const { showToast } = useToast();
  const actions = useActions();
  const { rows, loading } = useQuery<Attachment>('attachments', { where: { entity: table, record_id: recordId }, orderBy: { key: 'created_at', dir: 'desc' } });
  const [busy, setBusy] = useState(false);

  const open = async (a: Attachment) => {
    try {
      const url = await backend.fileUrl(a);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-muted"><Paperclip className="h-3.5 w-3.5" /> Documents & photos</p>
      {loading ? <p className="text-sm text-ink-muted">Loading…</p> : rows.length === 0 ? <p className="text-sm text-ink-muted">No documents attached.</p> : (
        <ul className="space-y-1">
          {rows.map((a) => (
            <li key={a.id}>
              <button onClick={() => void open(a)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-base-hover">
                {a.mime_type.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-accent-blue" /> : <FileText className="h-4 w-4 shrink-0 text-accent-blue" />}
                <span className="min-w-0 flex-1 truncate text-accent-blue">{a.file_name}</span>
                <span className="shrink-0 text-xs text-ink-faint">{dateTime(a.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <div className="mt-3">
          <FilePickers
            onFiles={async (files) => {
              setBusy(true);
              try {
                for (const f of files) await actions.upload(f, table, recordId, f.name);
              } finally {
                setBusy(false);
              }
            }}
          />
          {busy && <p className="mt-2 text-xs text-ink-muted">Uploading…</p>}
        </div>
      )}
    </div>
  );
}
