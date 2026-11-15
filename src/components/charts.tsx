import { useMemo, useState } from 'react';

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  dashed?: boolean;
}

const fmtTick = (v: number) => (Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : `${Math.round(v * 10) / 10}`);

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

function Legend({ series }: { series: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
      {series.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: s.color, borderTop: s.dashed ? `2px dashed ${s.color}` : undefined, height: s.dashed ? 0 : 2 }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export function LineChart({ labels, series, height = 200, unit = '', minZero = true, target }: {
  labels: string[]; series: Series[]; height?: number; unit?: string; minZero?: boolean; target?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, pl = 40, pr = 12, pt = 12, pb = 24;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (target) all.push(target.value);
  const max = niceMax(Math.max(...all, 0));
  const min = minZero ? 0 : Math.min(...all, 0);
  const x = (i: number) => pl + (labels.length <= 1 ? 0 : (i * (W - pl - pr)) / (labels.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min || 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => min + f * (max - min));
  const every = Math.max(1, Math.ceil(labels.length / 8));
  if (!labels.length) return <p className="py-10 text-center text-sm text-ink-muted">No data for the selected period</p>;
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.name).join(', ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pl) / (W - pl - pr)) * (labels.length - 1));
          setHover(Math.max(0, Math.min(labels.length - 1, i)));
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#E2E8F0" />
            <text x={pl - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94A3B8">{fmtTick(t)}</text>
          </g>
        ))}
        {target && (
          <g>
            <line x1={pl} x2={W - pr} y1={y(target.value)} y2={y(target.value)} stroke="#D97706" strokeDasharray="4 4" />
            <text x={W - pr} y={y(target.value) - 4} textAnchor="end" fontSize="10" fill="#D97706">{target.label}</text>
          </g>
        )}
        {labels.map((l, i) => i % every === 0 && (
          <text key={l + i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#94A3B8">{l}</text>
        ))}
        {series.map((s) => {
          let d = '';
          s.values.forEach((v, i) => {
            if (v === null) return;
            d += `${d && s.values[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
          });
          return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />;
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pt} y2={H - pb} stroke="#CBD5E1" />
            {series.map((s) => s.values[hover] !== null && <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r="3.5" fill={s.color} />)}
          </g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-base-border bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > labels.length / 2 ? '-105%' : '5%'})` }}>
          <p className="mb-1 font-medium text-ink-primary">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 whitespace-nowrap text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}: <span className="font-mono text-ink-primary">{s.values[hover] === null ? '—' : `${Math.round(s.values[hover]! * 10) / 10}${unit}`}</span>
            </p>
          ))}
        </div>
      )}
      <Legend series={series} />
    </div>
  );
}

export function BarChart({ labels, series, height = 200, unit = '', stacked = false, horizontal = false, target }: {
  labels: string[]; series: Series[]; height?: number; unit?: string; stacked?: boolean; horizontal?: boolean; target?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = useMemo(() => labels.map((_, i) => (stacked ? series.reduce((s, x) => s + (x.values[i] ?? 0), 0) : Math.max(...series.map((x) => x.values[i] ?? 0)))), [labels, series, stacked]);
  const max = niceMax(Math.max(...totals, target?.value ?? 0, 0));
  if (!labels.length) return <p className="py-10 text-center text-sm text-ink-muted">No data for the selected period</p>;

  if (horizontal) {
    return (
      <div className="space-y-2.5">
        {labels.map((l, i) => (
          <div key={l + i}>
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className="truncate text-ink-primary">{l}</span>
              <span className="shrink-0 font-mono text-ink-muted">{series.map((s) => `${fmtTick(s.values[i] ?? 0)}${unit}`).join(' / ')}</span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-base-hover">
              {series.map((s, si) => {
                const prev = stacked ? series.slice(0, si).reduce((a, x) => a + (x.values[i] ?? 0), 0) : 0;
                return <div key={s.name} className="absolute inset-y-0 rounded-full" style={{ left: `${(prev / max) * 100}%`, width: `${((s.values[i] ?? 0) / max) * 100}%`, background: s.color, opacity: stacked || si === 0 ? 1 : 0.6 }} />;
              })}
              {target && <div className="absolute inset-y-0 w-0.5 bg-accent-amber" style={{ left: `${(target.value / max) * 100}%` }} />}
            </div>
          </div>
        ))}
        {series.length > 1 && <Legend series={series} />}
      </div>
    );
  }

  const W = 640, H = height, pl = 40, pr = 8, pt = 12, pb = 24;
  const band = (W - pl - pr) / labels.length;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const every = Math.max(1, Math.ceil(labels.length / 10));
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={pl} x2={W - pr} y1={y(f * max)} y2={y(f * max)} stroke="#E2E8F0" />
            <text x={pl - 6} y={y(f * max) + 3} textAnchor="end" fontSize="10" fill="#94A3B8">{fmtTick(f * max)}</text>
          </g>
        ))}
        {labels.map((l, i) => {
          const gx = pl + i * band + band * 0.15;
          const gw = band * 0.7;
          let acc = 0;
          return (
            <g key={l + i} onMouseEnter={() => setHover(i)}>
              <rect x={pl + i * band} y={pt} width={band} height={H - pt - pb} fill={hover === i ? '#F1F5FB' : 'transparent'} />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                if (stacked) {
                  const r = <rect key={s.name} x={gx} y={y(acc + v)} width={gw} height={Math.max(0, y(acc) - y(acc + v))} fill={s.color} rx="2" />;
                  acc += v;
                  return r;
                }
                const w = gw / series.length;
                return <rect key={s.name} x={gx + si * w} y={y(v)} width={Math.max(1, w - 2)} height={Math.max(0, y(0) - y(v))} fill={s.color} rx="2" />;
              })}
              {i % every === 0 && <text x={pl + i * band + band / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#94A3B8">{l}</text>}
            </g>
          );
        })}
        {target && <line x1={pl} x2={W - pr} y1={y(target.value)} y2={y(target.value)} stroke="#D97706" strokeDasharray="4 4" />}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-base-border bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${((pl + (hover + 0.5) * band) / W) * 100}%`, transform: `translateX(${hover > labels.length / 2 ? '-105%' : '5%'})` }}>
          <p className="mb-1 font-medium text-ink-primary">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 whitespace-nowrap text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.name}: <span className="font-mono text-ink-primary">{Math.round((s.values[hover] ?? 0) * 10) / 10}{unit}</span>
            </p>
          ))}
        </div>
      )}
      {series.length > 1 && <Legend series={series} />}
    </div>
  );
}

export function Donut({ segments, size = 120, label }: { segments: { label: string; value: number; color: string }[]; size?: number; label?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 40, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#F1F5F9" strokeWidth="14" />
        {total > 0 && segments.map((s) => {
          const len = (s.value / total) * c;
          const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
        {label && <text x="50" y="54" textAnchor="middle" fontSize="13" fontWeight="600" fill="#0F172A" transform="rotate(90 50 50)">{label}</text>}
      </svg>
      <div className="min-w-0 space-y-1 text-xs">
        {segments.map((s) => (
          <p key={s.label} className="flex items-center gap-2 text-ink-muted">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="truncate">{s.label}</span>
            <span className="ml-auto pl-2 font-mono text-ink-primary">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function Sparkbar({ value, max = 100, color = '#2563EB' }: { value: number; max?: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-hover">
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  );
}

export const CHART = { blue: '#2563EB', teal: '#0D9488', amber: '#D97706', red: '#DC2626', navy: '#16365F', slate: '#94A3B8', violet: '#7C3AED' };
