import { useEffect, useState } from 'react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { useAction, useFetch } from '../lib/hooks';
import { fmtTime, hours } from '../lib/utils';
import { Card, ErrorState, PageLoader, StatusBadge, Button } from './ui.jsx';
import { useToast } from './toast.jsx';

/** Web check-in / check-out. The SERVER stamps the time; the clock below is display only. */
export default function CheckInWidget({ onChange }) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => api.get('/attendance/today'), []);
  const [run, busy] = useAction();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data) return <Card title="Today"><PageLoader /></Card>;
  if (error) return <Card title="Today"><ErrorState error={error} onRetry={reload} /></Card>;

  const rec = data?.record || data || null;
  const checkedIn = !!rec?.checkIn;
  const checkedOut = !!rec?.checkOut;

  const act = async (kind) => {
    const res = await run(() => api.post(`/attendance/${kind}`), {
      success: kind === 'check-in' ? 'Checked in. Have a productive day!' : 'Checked out. See you tomorrow!',
      onError: (e) => e.status === 409 && toast.info('You have already done this today.'),
    });
    if (res) {
      await reload();
      onChange?.();
    }
  };

  return (
    <Card title="Today" subtitle={now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-3xl font-extrabold tabular-nums text-slate-900">
            <Clock className="h-6 w-6 text-brand-600" />
            {now.toLocaleTimeString('en-GB')}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span>In: <b className="text-slate-700">{fmtTime(rec?.checkIn)}</b></span>
            <span>Out: <b className="text-slate-700">{fmtTime(rec?.checkOut)}</b></span>
            {rec?.hours != null && <span>Worked: <b className="text-slate-700">{hours(rec.hours)}</b></span>}
            {rec?.status && <StatusBadge status={rec.status} />}
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={LogIn} loading={busy} disabled={checkedIn} onClick={() => act('check-in')}>
            Check in
          </Button>
          <Button variant="secondary" icon={LogOut} loading={busy} disabled={!checkedIn || checkedOut} onClick={() => act('check-out')}>
            Check out
          </Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">The official time is recorded by the server, not by your device.</p>
    </Card>
  );
}
