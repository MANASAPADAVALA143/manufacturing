import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User } from 'lucide-react';
import { Panel } from '@/components/ui';

interface Message {
  role: 'user' | 'ai';
  text: string;
}

const initialMessages: Message[] = [
  {
    role: 'ai',
    text: 'Ask your manufacturing AI anything — orders, production, inventory, or logistics.',
  },
];

const quickReplies = [
  'Which orders are at risk of missing delivery this week?',
  'Create an action plan.',
];

function getAIResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes('at risk') || lower.includes('orders')) {
    return `7 orders are currently at risk.

3 related to production delays.
2 affected by supplier delays.
2 have logistics issues.

Highest risk:
Order #4821 — ₹42L
Expected delay: 3 days
Primary cause: Machine M-14 downtime.`;
  }
  if (lower.includes('action plan')) {
    return `✓ Maintenance task created
✓ Procurement notified
✓ Logistics alerted
✓ Customer communication drafted`;
  }
  return `I can help with orders, production, inventory, and logistics. Try asking about at-risk orders or request an action plan.`;
}

export default function AIAssistant() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg: Message = { role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTimeout(() => {
      const aiMsg: Message = { role: 'ai', text: getAIResponse(text) };
      setMessages((prev) => [...prev, aiMsg]);
    }, 400);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Panel>
        <div className="border-b border-base-border px-5 py-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-accent-blue" />
            <h2 className="text-lg font-semibold text-ink-primary">Ask your manufacturing AI</h2>
          </div>
          <p className="mt-1 text-sm text-ink-muted">Orders, production, inventory, logistics — ask anything.</p>
        </div>

        {/* Chat area */}
        <div ref={scrollRef} className="h-[400px] overflow-y-auto p-5 space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center ${
                  msg.role === 'user' ? 'bg-accent-blue' : 'bg-base-border'
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
                    : 'bg-base-border text-ink-primary'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Quick replies */}
        <div className="flex flex-wrap gap-2 border-t border-base-border px-5 py-3">
          {quickReplies.map((qr) => (
            <button
              key={qr}
              onClick={() => send(qr)}
              className="border border-base-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-accent-blue hover:text-accent-blue"
            >
              {qr}
            </button>
          ))}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2 border-t border-base-border p-3"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your question..."
            className="flex-1 border border-base-border bg-base-panel px-4 py-2.5 text-sm text-ink-primary outline-none transition-colors placeholder:text-ink-muted focus:border-accent-blue"
          />
          <button
            type="submit"
            className="flex items-center gap-1 bg-accent-blue px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Send className="h-4 w-4" />
            Send
          </button>
        </form>
      </Panel>
    </div>
  );
}
