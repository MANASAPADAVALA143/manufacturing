export interface ExportColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Guard against CSV formula injection when opened in Excel.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV with UTF-8 BOM so Excel opens ₹ and Indian characters correctly. */
export function exportCsv<T>(fileName: string, rows: T[], cols: ExportColumn<T>[]) {
  const lines = [cols.map((c) => csvCell(c.label)).join(','), ...rows.map((r) => cols.map((c) => csvCell(c.value(r))).join(','))];
  download(fileName.endsWith('.csv') ? fileName : `${fileName}.csv`, new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
}

export function exportJson(fileName: string, data: unknown) {
  download(fileName, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Opens a print-ready document; the browser's "Save as PDF" produces the PDF.
 * Returns false if the popup was blocked.
 */
export function printReport<T>(opts: { title: string; subtitle?: string; company: string; rows: T[]; cols: ExportColumn<T>[]; summary?: [string, string][] }): boolean {
  const w = window.open('', '_blank', 'noopener=no,width=1100,height=800');
  if (!w) return false;
  const summary = opts.summary?.length
    ? `<table class="sum">${opts.summary.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>`
    : '';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title>
<style>
  body{font:12px/1.45 Inter,system-ui,sans-serif;color:#0f172a;margin:28px}
  header{display:flex;justify-content:space-between;border-bottom:3px solid #0b1b33;padding-bottom:10px;margin-bottom:16px}
  h1{font-size:18px;margin:0} .muted{color:#64748b}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #e2e8f0;padding:6px 8px;text-align:left}
  thead th{background:#f1f5f9;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
  .sum{width:auto;margin-bottom:16px} .sum th{background:none;color:#64748b;font-weight:500;padding-left:0}
  footer{margin-top:18px;font-size:10px;color:#94a3b8}
  @page{size:A4 landscape;margin:12mm}
</style></head><body>
<header><div><h1>${esc(opts.title)}</h1><div class="muted">${esc(opts.subtitle ?? '')}</div></div>
<div style="text-align:right"><strong>${esc(opts.company)}</strong><div class="muted">Generated ${esc(new Date().toLocaleString('en-IN'))}</div></div></header>
${summary}
<table><thead><tr>${opts.cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody>${opts.rows.map((r) => `<tr>${opts.cols.map((c) => `<td>${esc(c.value(r))}</td>`).join('')}</tr>`).join('')}</tbody></table>
<footer>GNANOVA Manufacturing OS · ${opts.rows.length} rows</footer>
<script>window.onload=()=>{window.focus();window.print();}</script>
</body></html>`);
  w.document.close();
  return true;
}
