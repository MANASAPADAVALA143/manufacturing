import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Database, Send, Sparkles, Trash2, User } from 'lucide-react';
import { useApp } from '@/lib/app';
import { AI_BACKEND_ENABLED } from '@/lib/config';
import { answer, type Answer } from '@/lib/assistant';
import { defaultFilters } from '@/lib/analytics';
import { useDataset } from '@/lib/useDataset';
import { DEFAULT_COMPANY_SETTINGS } from '@/lib/data/schema';
import { SupabaseBackend } from '@/lib/data/supabaseBackend';
import { navigate, setParam, useRoute } from '@/lib/router';
import { Badge } from '@/components/ui';

interface Message { role: 'user' | 'ai'; text?: string; answer?: Answer; mode?: 'rules' | 'llm'; error?: string }

const promptGroups = [
  { category: 'Production', prompts: ['What is today’s production?', 'Which products are below production targets?', 'What is the OEE this week?'] },
  { category: 'Maintenance', prompts: ['Which machine has the highest downtime?', 'Which machines require maintenance?', 'Show open work orders'] },
  { category: 'Inventory & purchasing', prompts: ['Which raw material will run out first?', 'Which purchase orders are delayed?'] },
  { category: 'Quality & cost', prompts: ['What is the rejection percentage?', 'What is the manufacturing cost per unit?'] },
  { category: 'Finance & logistics', prompts: ['Which vendor bills are overdue?', 'Show invoice exceptions', 'Any delayed shipments?'] },
];

const STORE = 'gnanova.assistant.history';

export default function AIAssistant() {
  const { company, backend, mode } = useApp();
  const route = useRoute();
  const ds = useDataset(defaultFilters(90), { lookbackDays: 90 });
  const settings = useMemo(() => ({ ...DEFAULT_COMPANY_SETTINGS, ...(company?.settings ?? {}) }), [company]);
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(`${STORE}.${company?.id}`) ?? '[]') as Message[]; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const llm = AI_BACKEND_ENABLED && backend instanceof SupabaseBackend;

  useEffect(() => {
    sessionStorage.setItem(`${STORE}.${company?.id}`, JSON.stringify(messages.slice(-40)));
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, company?.id]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || ds.loading) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      if (llm) {
        const res = await (backend as SupabaseBackend).invoke<Answer>('ai-assistant', { question: text, company_id: company?.id });
        setMessages((m) => [...m, { role: 'ai', answer: res, mode: 'llm' }]);
      } else {
        setMessages((m) => [...m, { role: 'ai', answer: answer(text, ds, settings), mode: 'rules' }]);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: 'ai', answer: answer(text, ds, settings), mode: 'rules', error: `AI service unavailable (${(e as Error).message}). Showing rule-based answer.` }]);
    } finally {
      setBusy(false);
    }
  }, [ds, settings, llm, backend, company?.id]);

  const q = route.params.get('q');
  useEffect(() => {
    if (q && !ds.loading) {
      setParam('q', null);
      void send(q);
    }
  }, [q, ds.loading, send]);

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[480px] flex-col lg:h-[calc(100dvh-7.5rem)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent-blue" />
          <p className="text-sm text-ink-muted">Answers are computed from {company?.name}’s records only{mode === 'demo' ? ' (demo data)' : ''}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={llm ? 'green' : 'blue'}>{llm ? 'AI model via secure backend' : 'Rule-based analytics'}</Badge>
          {messages.length > 0 && <button onClick={() => setMessages([])} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-accent-red"><Trash2 className="h-3.5 w-3.5" />Clear</button>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-px overflow-hidden rounded-xl border border-base-border bg-base-border shadow-card">
        <aside className="hidden w-[30%] max-w-xs shrink-0 overflow-y-auto bg-base-panel md:block">
          <div className="sticky top-0 border-b border-base-border bg-base-panel px-4 py-3"><h3 className="text-sm font-semibold">Suggested questions</h3></div>
          <div className="space-y-5 p-4">
            {promptGroups.map((g) => (
              <div key={g.category}>
                <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{g.category}</p>
                <div className="space-y-1.5">
                  {g.prompts.map((p) => (
                    <button key={p} onClick={() => void send(p)} className="block w-full rounded-lg border border-base-border px-3 py-2 text-left text-xs leading-snug text-ink-muted hover:border-accent-blue hover:bg-base-hover hover:text-accent-blue">{p}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-base-panel">
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5" aria-live="polite">
            {!messages.length && (
              <div className="mx-auto max-w-md py-8 text-center">
                <Bot className="mx-auto h-10 w-10 text-accent-blue" />
                <p className="mt-3 font-medium">Ask about production, downtime, stock, purchasing, quality, cost, maintenance, payables or logistics.</p>
                <p className="mt-1 text-sm text-ink-muted">Every answer lists the records it used. If something is not in your data, I will say so rather than guess.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${m.role === 'user' ? 'bg-accent-blue' : 'border border-base-border bg-base-subtle'}`}>
                  {m.role === 'user' ? <User className="h-4 w-4 text-white" /> : <Bot className="h-4 w-4 text-accent-blue" />}
                </div>
                {m.role === 'user' ? (
                  <div className="max-w-[85%] rounded-xl bg-accent-blue px-4 py-2.5 text-sm text-white">{m.text}</div>
                ) : m.answer ? <AnswerView a={m.answer} error={m.error} /> : null}
              </div>
            ))}
            {busy && <div className="flex gap-1.5 pl-11"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.3s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint [animation-delay:-0.15s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-faint" /></div>}
          </div>

          <div className="scrollbar-none flex gap-2 overflow-x-auto border-t border-base-border px-3 pt-3 md:hidden">
            {promptGroups.flatMap((g) => g.prompts).slice(0, 8).map((p) => (
              <button key={p} onClick={() => void send(p)} className="shrink-0 rounded-full border border-base-border px-3 py-1.5 text-xs text-ink-muted">{p}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="flex gap-2 p-3 sm:p-4">
            <input value={input} onChange={(e) => setInput(e.target.value)} disabled={ds.loading} placeholder={ds.loading ? 'Loading company data…' : 'Ask a question…'} aria-label="Question" className="input min-w-0 flex-1" />
            <button type="submit" disabled={!input.trim() || busy} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-blue px-4 font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Send className="h-4 w-4" /><span className="hidden sm:inline">Send</span></button>
          </form>
        </section>
      </div>
    </div>
  );
}

function AnswerView({ a, error }: { a: Answer; error?: string }) {
  return (
    <div className="min-w-0 max-w-[92%] space-y-3 rounded-xl border border-base-border bg-base-subtle px-4 py-3 text-sm leading-relaxed">
      {error && <p className="text-xs text-accent-amber">{error}</p>}
      <p>{a.summary}</p>
      {a.bullets && <ul className="list-disc space-y-1 pl-5 text-ink-muted">{a.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
      {a.table && a.table.rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-base-border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-base-subtle"><tr>{a.table.headers.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-mono font-semibold uppercase tracking-wider text-ink-muted">{h}</th>)}</tr></thead>
            <tbody>{a.table.rows.map((r, i) => <tr key={i} className="border-t border-base-border">{r.map((c, j) => <td key={j} className="whitespace-nowrap px-3 py-2">{String(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {a.actions && a.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {a.actions.map((x) => <button key={x.link} onClick={() => navigate(x.link)} className="rounded-lg border border-accent-blue/30 bg-white px-3 py-1.5 text-xs font-medium text-accent-blue hover:bg-accent-blue/5">{x.label} →</button>)}
        </div>
      )}
      {a.sources.length > 0 && (
        <p className="flex flex-wrap items-center gap-1 text-[11px] text-ink-faint"><Database className="h-3 w-3" />Sources: {a.sources.join(' · ')}{a.period ? ` · period: ${a.period}` : ''}</p>
      )}
    </div>
  );
}
