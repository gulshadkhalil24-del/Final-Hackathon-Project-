import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { Alert, Button } from './ui.jsx';
import { AIBadge } from './AIChat.jsx';

/** "Summarize" button for dashboards. The server builds the KPIs for the current filters and asks the LLM. */
export default function AISummary({ scope, filters }) {
  const [bullets, setBullets] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/ai/summarize', { scope, ...filters }, { timeout: 20000 });
      const list = res.bullets || res.insights || (res.summary ? String(res.summary).split('\n') : []);
      setBullets(list.map((b) => String(b).replace(/^[-•*]\s*/, '')).filter(Boolean));
    } catch (e) {
      setError(e.status === 429 ? 'AI request limit reached for this hour. Please try again later.' : `The summary is not available right now. ${e.status ? '' : errMsg(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card border-violet-200 bg-violet-50/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent-violet" />
          <h2 className="text-sm font-bold text-slate-800">AI summary</h2>
        </div>
        <Button size="sm" loading={busy} onClick={run} className="!bg-accent-violet hover:brightness-110">
          {bullets ? 'Refresh summary' : 'Summarize'}
        </Button>
      </div>
      {error && <Alert tone="warn" className="mt-3">{error}</Alert>}
      {!bullets && !error && <p className="mt-2 text-sm text-slate-500">Get 3–5 plain-language insights from the numbers on this dashboard, using the current filters.</p>}
      {bullets && (
        <>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <div className="mt-3">
            <AIBadge />
          </div>
        </>
      )}
    </div>
  );
}
