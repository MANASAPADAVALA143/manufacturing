const problems = [
  {
    title: 'Missed RFQs and slow quotes',
    body: "Enquiries sit in email for 2-3 days. Competitor responds same day. Deal gone.",
    leak: 'Est. leak: ₹5-8L per season',
  },
  {
    title: 'Manual invoice matching',
    body: 'AP team spends 4-6 hours daily matching invoices to POs. Errors cause payment delays.',
    leak: 'Est. leak: 40+ hours/week',
  },
  {
    title: 'No predictive maintenance',
    body: 'Machine fails. Line stops. Owner finds out when production misses target.',
    leak: 'Est. leak: ₹2-10L per breakdown',
  },
  {
    title: 'No reorder automation',
    body: 'Stock runs out. Supplier called manually. Customer order delayed. Relationship damaged.',
    leak: 'Est. leak: ₹10-20L per season',
  },
];

export default function Problem() {
  return (
    <section className="border-b border-base-border">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight text-ink-primary sm:text-4xl">
            Where manufacturers lose money
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            These are not edge cases. Every manufacturer we talk to has all four.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2">
          {problems.map((p) => (
            <div
              key={p.title}
              className="border-l-2 border-accent-amber bg-base-panel p-8 transition-colors hover:bg-[#1E2630]"
            >
              <h3 className="text-xl font-semibold text-ink-primary">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-muted">{p.body}</p>
              <p className="mt-6 font-mono text-sm font-medium text-accent-amber">{p.leak}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
