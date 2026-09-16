const steps = [
  {
    num: '01',
    title: 'We diagnose',
    body: 'One call. We map every place your business is losing money or wasting time. We put a rupee number on each gap.',
  },
  {
    num: '02',
    title: 'We build one thing',
    body: 'The highest-ROI gap gets fixed first. You see results in weeks, not months. Your existing systems stay untouched.',
  },
  {
    num: '03',
    title: 'You expand',
    body: 'Once you see it working, you add the next module. Module by module. Full control, no lock-in.',
  },
];

export default function HowItWorks() {
  return (
    <section className="border-b border-base-border">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight text-ink-primary sm:text-4xl">
            How we work
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            No rip-and-replace. No six-month implementation.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-0">
          {steps.map((s, i) => (
            <div
              key={s.num}
              className={`relative ${i < steps.length - 1 ? 'md:border-r md:border-base-border' : ''} md:px-8 md:first:pl-0 md:last:pr-0`}
            >
              <p className="font-mono text-4xl font-bold text-accent-amber">{s.num}</p>
              <h3 className="mt-4 text-xl font-semibold text-ink-primary">{s.title}</h3>
              <p className="mt-3 leading-relaxed text-ink-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
