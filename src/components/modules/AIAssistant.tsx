import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';

interface Message {
  role: 'user' | 'ai';
  text: string;
}

const initialMessages: Message[] = [
  {
    role: 'user',
    text: 'Show me today\u2019s exceptions',
  },
  {
    role: 'ai',
    text: `Here\u2019s a summary of active exceptions as of today, Sep 16 2026:

\u{1F534} AP Automation \u2014 3 new exceptions
- INV-10482: Price mismatch vs PO-2026-1180 (SKF Bearings, +16%)
- INV-10479: Duplicate bill detected \u2014 same amount from Greaves Cotton
- INV-10475: Missing GRN \u2014 bill received, goods not confirmed

\u{1F7E1} Quality \u2014 1 active alert
- Batch B-2026-441: 18 units rejected, Surface finish defect on Line 1

\u{1F534} Inventory \u2014 1 critical
- Steel Coil A: Stockout risk in 6 days \u2014 reorder not placed yet

Total: 5 exceptions need your attention today.
Want me to open any of these?`,
  },
  {
    role: 'user',
    text: 'Which vendor bills are overdue?',
  },
  {
    role: 'ai',
    text: `3 vendor bills are overdue as of today:

| Supplier        | Bill No   | Amount   | Due Date | Days Overdue |
|-----------------|-----------|----------|----------|--------------|
| Tata Steel      | INV-10471 | \u20B918.5L | Sep 10   | 6 days       |
| Asian Paints    | INV-10465 | \u20B962K   | Sep 12   | 4 days       |
| Bosch India     | INV-10460 | \u20B995K   | Sep 14   | 2 days       |

Total overdue: \u20B919.57L
Recommend: Tata Steel payment is highest priority \u2014 they supply Steel Coil A which is already at stockout risk.

Want me to trigger payment approval workflow?`,
  },
  {
    role: 'user',
    text: 'What is Line 2 OEE today?',
  },
  {
    role: 'ai',
    text: `Line 2 OEE today: 82% (below 85% threshold \u26A0\uFE0F)

Breakdown:
- Availability: 91% (planned downtime: 45 min for shift changeover)
- Performance: 88% (speed loss on Motor M2)
- Quality: 98.4% (1 rejection in last 200 units)

Root cause flagged by AI:
Vibration anomaly on Motor M2 \u2014 detected 3 days ago, trending worse. Maintenance WO-448 is IN PROGRESS (Ravi Kumar).

Predicted impact: If Motor M2 not serviced today, OEE could drop to ~74% by tomorrow.

Want me to escalate WO-448 priority to URGENT?`,
  },
];

interface PromptGroup {
  category: string;
  prompts: string[];
}

const promptGroups: PromptGroup[] = [
  {
    category: 'AP & Finance',
    prompts: [
      'Which vendor bills are overdue?',
      "Show me today's AP exceptions",
      'What is our open payables this week?',
      'Which supplier has the most mismatches?',
    ],
  },
  {
    category: 'Production',
    prompts: [
      'What is Line 2 OEE today?',
      'Which production line is underperforming?',
      "Show me today's output vs target",
    ],
  },
  {
    category: 'Quality',
    prompts: [
      'Any defect alerts today?',
      'Which batch failed QC this week?',
    ],
  },
  {
    category: 'Inventory',
    prompts: [
      'What items are at stockout risk?',
      'Show me excess inventory',
    ],
  },
  {
    category: 'Maintenance',
    prompts: [
      'Which equipment needs urgent attention?',
      'Show open work orders',
    ],
  },
  {
    category: 'Logistics',
    prompts: [
      'Any delayed shipments today?',
      'Which carrier has the worst SLA?',
    ],
  },
];

const cannedResponses: { match: string[]; text: string }[] = [
  {
    match: ['overdue', 'vendor bill'],
    text: `3 vendor bills are overdue as of today:

| Supplier        | Bill No   | Amount   | Due Date | Days Overdue |
|-----------------|-----------|----------|----------|--------------|
| Tata Steel      | INV-10471 | \u20B918.5L | Sep 10   | 6 days       |
| Asian Paints    | INV-10465 | \u20B962K   | Sep 12   | 4 days       |
| Bosch India     | INV-10460 | \u20B995K   | Sep 14   | 2 days       |

Total overdue: \u20B919.57L
Recommend: Tata Steel payment is highest priority \u2014 they supply Steel Coil A which is already at stockout risk.

Want me to trigger payment approval workflow?`,
  },
  {
    match: ['ap exception', 'today\u2019s exception', 'exceptions'],
    text: `Here\u2019s a summary of active exceptions as of today, Sep 16 2026:

\u{1F534} AP Automation \u2014 3 new exceptions
- INV-10482: Price mismatch vs PO-2026-1180 (SKF Bearings, +16%)
- INV-10479: Duplicate bill detected \u2014 same amount from Greaves Cotton
- INV-10475: Missing GRN \u2014 bill received, goods not confirmed

\u{1F7E1} Quality \u2014 1 active alert
- Batch B-2026-441: 18 units rejected, Surface finish defect on Line 1

\u{1F534} Inventory \u2014 1 critical
- Steel Coil A: Stockout risk in 6 days \u2014 reorder not placed yet

Total: 5 exceptions need your attention today.`,
  },
  {
    match: ['oee', 'line 2'],
    text: `Line 2 OEE today: 82% (below 85% threshold \u26A0\uFE0F)

Breakdown:
- Availability: 91% (planned downtime: 45 min for shift changeover)
- Performance: 88% (speed loss on Motor M2)
- Quality: 98.4% (1 rejection in last 200 units)

Root cause: Vibration anomaly on Motor M2 \u2014 WO-448 IN PROGRESS.

Want me to escalate WO-448 priority to URGENT?`,
  },
  {
    match: ['stockout', 'stock out'],
    text: `2 items at stockout risk:

\u{1F534} Steel Coil A \u2014 Stockout in 6 days, reorder not placed
\u{1F7E1} Hydraulic Oil ISO-68 \u2014 Stockout in 12 days, PO pending approval

Recommend: Raise PO for Steel Coil A immediately (Tata Steel, 50 MT).`,
  },
  {
    match: ['delayed shipment', 'delay'],
    text: `1 shipment delayed today:

\u{1F534} SHP-2026-0891 \u2014 Meridian Steel Co., Hyderabad
Carrier: DTDC | Delay at Nagpur hub | ETA pushed by 1 day
Auto-notification sent to customer.

[Reassign Carrier] option available.`,
  },
  {
    match: ['work order', 'maintenance', 'equipment'],
    text: `8 open work orders. 3 predictive alerts:

\u{1F534} Line 2 Motor M2 \u2014 Vibration anomaly, failure predicted in 4\u20137 days
\u{1F7E1} Compressor CU-03 \u2014 Oil pressure trending down
\u{1F7E1} Conveyor CB-Line1 \u2014 1,840 hrs since last replacement

WO-448 (Motor M2) is IN PROGRESS \u2014 Ravi Kumar.`,
  },
  {
    match: ['defect', 'quality', 'qc'],
    text: `1 active quality alert today:

\u{1F534} Batch B-2026-441 \u2014 Steel Frame A12
Surface finish defect \u2014 18 units rejected
Root cause: Coolant contamination (batch CN-2026-09)

Action needed: Schedule coolant batch swap on Line 1.`,
  },
  {
    match: ['carrier', 'sla'],
    text: `Carrier SLA performance (this month):

BlueDart: 98% on-time | \u20B91,240/shipment
FedEx:    96% on-time | \u20B91,820/shipment
TCI:      93% on-time | \u20B9540/shipment
DTDC:     88% on-time | \u20B9680/shipment \u26A0\uFE0F

DTDC is below 95% SLA target \u2014 recommend reviewing DTDC volume.`,
  },
];

function getAIResponse(input: string): string {
  const lower = input.toLowerCase();
  for (const canned of cannedResponses) {
    if (canned.match.some((m) => lower.includes(m))) {
      return canned.text;
    }
  }
  return `I can help with AP & Finance, Production, Quality, Inventory, Maintenance, and Logistics. Try one of the suggested questions on the left, or ask me about today's exceptions, overdue bills, OEE, or shipment delays.`;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setTimeout(() => {
      const aiMsg: Message = { role: 'ai', text: getAIResponse(text) };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 600);
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent-blue" />
            <h2 className="text-lg font-semibold text-ink-primary">AI Assistant</h2>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Ask anything about your operations — powered by Claude AI</p>
        </div>
        <div className="flex items-center gap-2 border border-accent-green/30 bg-accent-green/10 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-green" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-accent-green">Online</span>
        </div>
      </div>

      {/* Body: left prompts + right chat */}
      <div className="flex min-h-0 flex-1 gap-px bg-base-border">
        {/* Left: Quick Prompts */}
        <div className="hidden w-[30%] shrink-0 overflow-y-auto bg-base-panel md:block">
          <div className="sticky top-0 border-b border-base-border bg-base-panel px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-primary">Suggested Questions</h3>
          </div>
          <div className="p-4 space-y-5">
            {promptGroups.map((group) => (
              <div key={group.category}>
                <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                  {group.category}
                </p>
                <div className="space-y-1.5">
                  {group.prompts.map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => send(prompt)}
                      className="block w-full border border-base-border px-3 py-2 text-left text-xs leading-snug text-ink-muted transition-colors hover:border-accent-blue hover:bg-base-hover hover:text-accent-blue"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Chat window */}
        <div className="flex min-w-0 flex-1 flex-col bg-base-panel">
          {/* Messages */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center ${
                    msg.role === 'user' ? 'bg-accent-blue' : 'border border-base-border bg-base-bg'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="h-4 w-4 text-white" />
                  ) : (
                    <Bot className="h-4 w-4 text-accent-blue" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-accent-blue text-white'
                      : 'border border-base-border bg-base-bg text-ink-primary'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-base-border bg-base-bg">
                  <Bot className="h-4 w-4 text-accent-blue" />
                </div>
                <div className="flex items-center gap-1.5 border border-base-border bg-base-bg px-4 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted" />
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="shrink-0 border-t border-base-border">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="p-4"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about AP, Production, Quality, Inventory, Maintenance or Logistics..."
                  className="flex-1 border border-base-border bg-base-bg px-4 py-2.5 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-accent-blue"
                />
                <button
                  type="submit"
                  className="flex items-center gap-2 bg-accent-blue px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-500"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
              </div>
              <p className="mt-2 text-center text-[11px] text-ink-muted">
                AI Assistant has access to all live modules
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
