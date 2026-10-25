import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { cn } from '../lib/utils';
import { Spinner } from './ui.jsx';

const SUGGESTIONS = {
  admin: ['How many active employees do we have?', 'What is this month’s attendance rate?', 'Who is on leave today?', 'What is the payroll summary this month?'],
  hr: ['Who came late most often this month?', 'What is this month’s attendance rate?', 'Who is on leave today?', 'How many active employees are in each department?'],
  employee: ['How many sick leaves do I have left this year?', 'What is the late arrival rule?', 'How is my salary tax calculated?', 'Mujhe kitni casual leaves bachi hain?'],
};

export const openAssistant = (prompt) => window.dispatchEvent(new CustomEvent('hcm:open-ai', { detail: { prompt } }));

export function AIBadge({ className }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700', className)}>
      <Sparkles className="h-3 w-3" /> AI-generated
    </span>
  );
}

export default function AIChat() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const res = await api.post('/ai/chat', { message, history }, { timeout: 20000 });
      setMessages((m) => [...m, { role: 'assistant', content: res.reply || res.answer || 'I could not find an answer.', tool: res.tool }]);
    } catch (e) {
      const content =
        e.status === 429
          ? 'You have reached the hourly limit of about 20 questions. Please try again later, or use the dashboards for now.'
          : e.status === 403
          ? 'I am not allowed to share that information with your account.'
          : 'The assistant is not available right now. Please try again in a moment, or use the dashboards and menus instead.';
      setMessages((m) => [...m, { role: 'assistant', content, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (e) => {
      setOpen(true);
      const p = e.detail?.prompt;
      if (p) setTimeout(() => send(p), 50);
    };
    window.addEventListener('hcm:open-ai', handler);
    return () => window.removeEventListener('hcm:open-ai', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div className="no-print">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-accent-violet px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:brightness-110"
          aria-label="Open AI assistant"
        >
          <Sparkles className="h-5 w-5" />
          <span className="hidden sm:inline">Ask AI</span>
        </button>
      )}

      {open && (
        <aside
          className="modal-in card fixed bottom-0 right-0 z-40 flex h-[85vh] w-full flex-col overflow-hidden rounded-b-none shadow-2xl sm:bottom-4 sm:right-4 sm:h-[600px] sm:max-h-[85vh] sm:w-[390px] sm:rounded-b-xl"
          aria-label="AI assistant"
        >
          <header className="flex items-center justify-between bg-accent-violet px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <div>
                <p className="text-sm font-bold leading-tight">HCM Assistant</p>
                <p className="text-[11px] text-violet-200">Answers from your real data only</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded p-1 hover:bg-white/20">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {messages.length === 0 && (
              <div>
                <p className="text-sm text-slate-600">
                  Hi {user?.name?.split(' ')[0] || 'there'}! Ask me about {user?.role === 'employee' ? 'your leave, attendance, payslips or company policy' : 'headcount, attendance, leave, payroll or policy'}. You can write in English or Roman Urdu.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(SUGGESTIONS[user?.role] || SUGGESTIONS.employee).map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-violet-700 hover:bg-violet-50">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn('chat-in flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm',
                    m.role === 'user' ? 'rounded-br-sm bg-brand-600 text-white' : m.error ? 'rounded-bl-sm border border-amber-200 bg-amber-50 text-amber-900' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-700'
                  )}
                >
                  {m.content}
                  {m.role === 'assistant' && !m.error && (
                    <div className="mt-2">
                      <AIBadge />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Spinner className="h-4 w-4" /> Thinking…
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              maxLength={500}
              className="input"
              aria-label="Message"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary px-3" aria-label="Send">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </aside>
      )}
    </div>
  );
}
