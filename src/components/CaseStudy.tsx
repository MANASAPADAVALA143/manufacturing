const results = [
  { num: '412', label: 'Overdue farmers surfaced in week 1', color: 'text-accent-green', border: 'border-accent-green' },
  { num: '0', label: 'Manual follow-up calls needed', color: 'text-accent-blue', border: 'border-accent-blue' },
  { num: '₹15-20L', label: 'Est. repeat revenue at risk — now tracked', color: 'text-accent-amber', border: 'border-accent-amber' },
];

export default function CaseStudy() {
  return (
    <section className="border-b border-base-border border-l-4 border-l-accent-blue bg-base-panel/50">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-amber">
          Production Case Study
        </span>
        <h2 className="mt-5 max-w-3xl text-3xl font-bold leading-tight text-ink-primary sm:text-4xl">
          Fertilizer manufacturer. 3,000 farmers. Zero manual follow-up.
        </h2>
        <p className="mt-6 max-w-3xl leading-relaxed text-ink-muted text-lg">
          A fertilizer distributor was manually tracking reorders for 3,000 farmers across 300 sales reps. Follow-up was inconsistent. Repeat orders were being missed silently every season.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-px bg-base-border sm:grid-cols-3">
          {results.map((r) => (
            <div key={r.label} className="bg-base-panel p-8">
              <p className={`font-mono text-4xl font-bold ${r.color}`}>{r.num}</p>
              <p className="mt-3 leading-relaxed text-ink-muted">{r.label}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 font-mono text-sm text-ink-muted">
          Stack: Supabase · n8n · WhatsApp Business API
        </p>
      </div>
    </section>
  );
}
