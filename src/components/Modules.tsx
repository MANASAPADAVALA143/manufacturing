const modules = [
  { name: 'Sales & RFQ', desc: 'AI processes inbound enquiries and generates draft quotes in minutes.' },
  { name: 'Procurement', desc: 'Supplier delays flagged before they hit your production schedule.' },
  { name: 'AP Automation', desc: '3-way invoice matching automated. Exceptions only reach humans.', badge: 'LIVE' },
  { name: 'Production', desc: 'Line performance tracked in real time. AI flags drops before shift ends.' },
  { name: 'Quality', desc: 'Defect pattern detection across batches and production lines.' },
  { name: 'Maintenance', desc: 'Machine health scored daily. Inspection tasks auto-created on risk.' },
  { name: 'Inventory', desc: 'Stock levels monitored. Reorder triggered before stockout window.' },
  { name: 'Logistics', desc: 'Shipment delays detected. Customer communications drafted automatically.' },
  { name: 'AI Assistant', desc: 'Ask your operations data anything. Get answers in plain language.', badge: 'AI' },
];

export default function Modules() {
  return (
    <section className="border-b border-base-border">
      <div className="mx-auto max-w-7xl px-6 py-20 lg:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold leading-tight text-ink-primary sm:text-4xl">
            The AI layer — module by module
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            You don't need all of them. You need the one costing you most right now.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-px bg-base-border sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <div
              key={m.name}
              className="group relative border-l-2 border-accent-blue bg-base-panel p-8 transition-colors hover:bg-[#1E2630]"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-ink-primary">{m.name}</h3>
                {m.badge && (
                  <span
                    className={`font-mono text-[10px] font-semibold uppercase tracking-wider px-2 py-1 ${
                      m.badge === 'LIVE'
                        ? 'bg-accent-green/15 text-accent-green'
                        : 'bg-accent-blue/15 text-accent-blue'
                    }`}
                  >
                    {m.badge}
                  </span>
                )}
              </div>
              <p className="mt-3 leading-relaxed text-ink-muted">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
