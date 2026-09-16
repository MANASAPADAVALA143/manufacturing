import { ArrowRight, Activity } from 'lucide-react';

export default function Hero() {
  return (
    <section className="relative w-full border-b border-base-border">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-20 lg:grid-cols-2 lg:gap-16 lg:py-28">
        {/* Left */}
        <div className="flex flex-col justify-center">
          <span className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-accent-amber">
            AI Automation Layer
          </span>
          <h1 className="mt-6 max-w-xl text-4xl font-bold leading-[1.15] text-ink-primary sm:text-5xl lg:text-[3.25rem]">
            Your manufacturing ops are losing money right now.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-muted sm:text-lg">
            We build the AI layer that sits on top of your existing ERP, SAP or Oracle — and fixes the gaps those systems can't see.
          </p>

          <div className="mt-10">
            <a
              href="#contact"
              className="group inline-flex items-center gap-2 bg-accent-blue px-6 py-3.5 font-medium text-white transition-colors hover:bg-blue-500"
            >
              Book a free diagnostic call
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <p className="mt-4 font-mono text-xs text-ink-muted">
              No commitment. 30 minutes. We map your gaps.
            </p>
          </div>
        </div>

        {/* Right — live dashboard snippet */}
        <div className="flex items-center justify-center">
          <div className="w-full max-w-md border border-base-border bg-base-panel">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-base-border px-5 py-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-accent-blue" />
                <span className="font-mono text-sm text-ink-primary">ABC Manufacturing — Live</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-green opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-green"></span>
                </span>
                <span className="font-mono text-xs text-accent-green">Live</span>
              </div>
            </div>

            {/* Stats 2x2 */}
            <div className="grid grid-cols-2 gap-px bg-base-border">
              <StatCard label="Revenue" value="₹48.2 Cr" />
              <StatCard label="Production" value="92%" />
              <StatCard label="Orders" value="1,284" />
              <StatCard label="Exceptions" value="24" danger />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-base-panel px-5 py-6">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">{label}</p>
      <p
        className={`mt-2 font-mono text-2xl font-semibold ${
          danger ? 'text-accent-red' : 'text-ink-primary'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
