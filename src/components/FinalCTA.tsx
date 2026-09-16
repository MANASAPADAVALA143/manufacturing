import { useState } from 'react';

export default function FinalCTA() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section id="contact" className="border-b border-base-border">
      <div className="mx-auto max-w-2xl px-6 py-20 text-center lg:py-28">
        <h2 className="text-3xl font-bold leading-tight text-ink-primary sm:text-4xl">
          Book a free operational gap analysis
        </h2>
        <p className="mt-4 text-lg text-ink-muted">
          30 minutes. We map where your business is losing money. No pitch, no commitment — just the diagnosis.
        </p>

        {submitted ? (
          <div className="mt-12 border border-accent-green/30 bg-accent-green/10 p-8">
            <p className="font-mono text-sm text-accent-green">
              Request received. We'll respond within 24 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-12 space-y-5 text-left">
            <Field label="Name">
              <input
                type="text"
                required
                className="w-full border border-base-border bg-base-panel px-4 py-3 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-accent-blue"
                placeholder="Your name"
              />
            </Field>
            <Field label="Company name">
              <input
                type="text"
                required
                className="w-full border border-base-border bg-base-panel px-4 py-3 text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-accent-blue"
                placeholder="Company name"
              />
            </Field>
            <Field label="Industry">
              <select
                required
                defaultValue=""
                className="w-full border border-base-border bg-base-panel px-4 py-3 text-ink-primary outline-none transition-colors focus:border-accent-blue"
              >
                <option value="" disabled>Select industry</option>
                <option>Manufacturing</option>
                <option>Distribution</option>
                <option>Pharma</option>
                <option>Real Estate</option>
                <option>Retail</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Team size">
              <select
                required
                defaultValue=""
                className="w-full border border-base-border bg-base-panel px-4 py-3 text-ink-primary outline-none transition-colors focus:border-accent-blue"
              >
                <option value="" disabled>Select team size</option>
                <option>1-10</option>
                <option>11-50</option>
                <option>51-200</option>
                <option>200+</option>
              </select>
            </Field>
            <button
              type="submit"
              className="w-full bg-accent-blue py-3.5 font-medium text-white transition-colors hover:bg-blue-500"
            >
              Book my free audit
            </button>
          </form>
        )}

        <p className="mt-8 text-sm leading-relaxed text-ink-muted">
          Built by an independent AI Architect — not a software vendor. Response within 24 hours.
        </p>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block font-mono text-xs uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
