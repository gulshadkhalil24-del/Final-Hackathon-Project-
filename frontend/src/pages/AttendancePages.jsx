import { useState } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { api, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useFetch } from '../lib/hooks';
import { asList, cn, daysInMonth, deptName, fmtDate, fmtTime, hours, humanize, monthISO, monthLabel, shiftMonth, statusTone, todayISO, WEEKDAYS } from '../lib/utils';
import { Alert, Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, FilterBar, Input, Modal, PageHeader, PageLoader, Select, StatusBadge, Tabs, Textarea } from '../components/ui.jsx';
import CheckInWidget from '../components/CheckInWidget.jsx';

/* ===================== Employee: my attendance (#09, #10, #11) ===================== */
const DAY_STYLES = {
  green: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  red: 'bg-red-100 text-red-700 border-red-200',
  violet: 'bg-violet-100 text-violet-800 border-violet-200',
  blue: 'bg-sky-100 text-sky-800 border-sky-200',
  slate: 'bg-slate-100 text-slate-500 border-slate-200',
};

export function MyAttendancePage() {
  const [month, setMonth] = useState(monthISO());
  const { data, loading, error, reload } = useFetch(() => api.get('/attendance/me', { month }), [month]);
  const corrections = useFetch(() => api.get('/attendance/corrections'), []);
  const [picked, setPicked] = useState(null); // date string
  const [form, setForm] = useState({ reason: '', requestedCheckIn: '', requestedCheckOut: '' });
  const [errors, setErrors] = useState({});
  const [run, busy] = useAction();

  const records = Object.fromEntries(asList(data?.records ?? data).map((r) => [String(r.date).slice(0, 10), r]));
  const holidays = new Set((data?.holidays || []).map((h) => String(h.date ?? h).slice(0, 10)));
  const weekend = data?.weekendDays || [0, 6];
  const s = data?.summary || {};
  const today = todayISO();

  const [y, m] = month.split('-').map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  const openCorrection = (date) => {
    setPicked(date);
    setErrors({});
    const r = records[date];
    setForm({ reason: '', requestedCheckIn: r?.checkIn ? fmtTime(r.checkIn) : '', requestedCheckOut: r?.checkOut ? fmtTime(r.checkOut) : '' });
  };

  const submit = async () => {
    const errs = {};
    if (form.reason.trim().length < 5) errs.reason = 'Please explain what went wrong (at least 5 characters).';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await run(() => api.post('/attendance/corrections', { date: picked, ...form }), { success: 'Correction requested. HR will review it.', onError: (e) => setErrors(fieldErrors(e)) });
    if (res) {
      setPicked(null);
      corrections.reload();
    }
  };

  return (
    <>
      <PageHeader title="My attendance" subtitle="Check in, review your month and request corrections." />
      <div className="space-y-5">
        <CheckInWidget onChange={reload} />

        <Card
          title={monthLabel(month)}
          action={
            <div className="flex items-center gap-1">
              <Button variant="secondary" size="sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="secondary" size="sm" disabled={month >= monthISO()} aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          }
        >
          {error ? <ErrorState error={error} onRetry={reload} /> : (
            <>
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {[['Present', s.present, 'green'], ['Late', s.late, 'amber'], ['Absent', s.absent, 'red'], ['Half day', s.half_day ?? s.halfDay, 'violet'], ['On leave', s.on_leave ?? s.onLeave, 'blue']].map(([l, v, t]) => <Badge key={l} tone={t}>{l}: {v ?? 0}</Badge>)}
                <Badge>Hours: {s.hours ?? 0}</Badge>
              </div>
              <div className={cn('grid grid-cols-7 gap-1.5 text-center sm:gap-2', loading && 'opacity-60')}>
                {WEEKDAYS.map((d) => <div key={d} className="pb-1 text-xs font-semibold text-slate-400">{d}</div>)}
                {cells.map((d, i) => {
                  if (!d) return <div key={`b${i}`} />;
                  const rec = records[d];
                  const dow = new Date(`${d}T00:00:00`).getDay();
                  const isOff = weekend.includes(dow) || holidays.has(d);
                  const future = d > today;
                  const tone = rec ? statusTone(rec.status) : 'slate';
                  const clickable = !future && !isOff;
                  return (
                    <button
                      key={d}
                      disabled={!clickable}
                      onClick={() => openCorrection(d)}
                      title={rec ? `${humanize(rec.status)} · ${fmtTime(rec.checkIn)}–${fmtTime(rec.checkOut)}` : isOff ? 'Day off' : future ? '' : 'No record'}
                      className={cn('flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition sm:text-sm', rec ? DAY_STYLES[tone] : isOff || future ? 'border-transparent bg-transparent text-slate-300' : 'border-dashed border-slate-300 text-slate-500', d === today && 'ring-2 ring-brand-500', clickable && 'hover:shadow-md')}
                    >
                      <span className="font-bold">{Number(d.slice(8))}</span>
                      {rec && <span className="hidden text-[10px] font-medium sm:block">{humanize(rec.status).split(' ')[0]}</span>}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">Click a past working day to request a correction.</p>
            </>
          )}
        </Card>

        <Card padded={false} title="My correction requests">
          <DataTable
            rows={asList(corrections.data)}
            loading={corrections.loading}
            error={corrections.error}
            onRetry={corrections.reload}
            columns={[
              { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
              { key: 'reason', header: 'Reason', className: 'max-w-xs truncate' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'comment', header: 'HR comment', render: (r) => r.decisionComment || '—' },
            ]}
            empty={<EmptyState title="No correction requests" description="If a check-in or check-out is wrong, click the day in the calendar." />}
          />
        </Card>
      </div>

      <Modal open={!!picked} onClose={() => setPicked(null)} title={`Request correction · ${fmtDate(picked)}`} size="sm" footer={<><Button variant="secondary" onClick={() => setPicked(null)}>Cancel</Button><Button loading={busy} onClick={submit}>Send request</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Correct check-in"><Input type="time" value={form.requestedCheckIn} onChange={(e) => setForm({ ...form, requestedCheckIn: e.target.value })} /></Field>
            <Field label="Correct check-out"><Input type="time" value={form.requestedCheckOut} onChange={(e) => setForm({ ...form, requestedCheckOut: e.target.value })} /></Field>
          </div>
          <Field label="Reason" required error={errors.reason}><Textarea value={form.reason} error={errors.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Forgot to check out, left at 6 pm." /></Field>
          <Alert tone="info">You cannot edit attendance yourself. HR will approve or reject this.</Alert>
        </div>
      </Modal>
    </>
  );
}

/* ===================== HR/Admin: daily board (#10) ===================== */
const BOARD_STATUSES = ['present', 'late', 'half_day', 'absent', 'on_leave', 'missing_checkout'];

export function AttendanceBoardPage() {
  const [date, setDate] = useState(todayISO());
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const depts = useFetch(() => api.get('/departments'), []);
  const { data, loading, error, reload } = useFetch(() => api.get('/attendance/board', { date, departmentId: dept }), [date, dept]);
  const rows = asList(data?.rows ?? data);
  const shown = status ? rows.filter((r) => r.status === status) : rows;
  const counts = data?.summary || rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});

  return (
    <>
      <PageHeader title="Attendance board" subtitle="Who is in, late, absent or on leave for a day." />
      <FilterBar>
        <Field label="Date"><Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Department"><Select value={dept} onChange={(e) => setDept(e.target.value)} placeholder="All departments" options={asList(depts.data).map((d) => ({ value: d.id, label: d.name }))} /></Field>
      </FilterBar>
      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setStatus('')} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', !status ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600')}>All ({rows.length})</button>
        {BOARD_STATUSES.map((st) => (
          <button key={st} onClick={() => setStatus(status === st ? '' : st)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', status === st ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600')}>
            {humanize(st)} ({counts[st] || 0})
          </button>
        ))}
      </div>
      <Card padded={false}>
        <DataTable
          rows={shown}
          rowKey="employeeId"
          loading={loading}
          error={error}
          onRetry={reload}
          columns={[
            { key: 'name', header: 'Employee', render: (r) => <span className="font-semibold text-slate-800">{r.name || r.employeeName}</span> },
            { key: 'department', header: 'Department', render: deptName },
            { key: 'checkIn', header: 'Check in', render: (r) => fmtTime(r.checkIn) },
            { key: 'checkOut', header: 'Check out', render: (r) => fmtTime(r.checkOut) },
            { key: 'hours', header: 'Hours', render: (r) => (r.hours != null ? hours(r.hours) : '—') },
            { key: 'source', header: 'Source', render: (r) => (r.source ? humanize(r.source) : '—') },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
          empty={<EmptyState title="No records for this day" description={status ? 'No employees with this status.' : 'Nobody has checked in yet, or this is a weekend or holiday.'} />}
        />
      </Card>
    </>
  );
}

/* ===================== HR: approve corrections (#11) ===================== */
export function CorrectionsPage() {
  const { user } = useAuth();
  const canDecide = user.role === 'hr';
  const [tab, setTab] = useState('pending');
  const { data, loading, error, reload } = useFetch(() => api.get('/attendance/corrections', { status: tab === 'all' ? '' : tab }), [tab]);
  const [target, setTarget] = useState(null); // {row, decision}
  const [comment, setComment] = useState('');
  const [run, busy] = useAction();

  const decide = async () => {
    const res = await run(() => api.patch(`/attendance/corrections/${target.row.id}`, { decision: target.decision, comment: comment.trim() }), { success: `Correction ${target.decision}.` });
    if (res) {
      setTarget(null);
      setComment('');
      reload();
    }
  };

  return (
    <>
      <PageHeader title="Attendance corrections" subtitle={canDecide ? 'Approve or reject employee requests.' : 'View only.'} />
      <Tabs tabs={['pending', 'approved', 'rejected', 'all']} value={tab} onChange={setTab} />
      <Card padded={false}>
        <DataTable
          rows={asList(data)}
          loading={loading}
          error={error}
          onRetry={reload}
          columns={[
            { key: 'employee', header: 'Employee', render: (r) => <span className="font-semibold text-slate-800">{r.employeeName || r.employee?.name}</span> },
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'requested', header: 'Requested', render: (r) => `${r.requestedCheckIn || '—'} → ${r.requestedCheckOut || '—'}` },
            { key: 'reason', header: 'Reason', className: 'max-w-xs' },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            {
              key: 'actions', header: '', className: 'text-right',
              render: (r) => canDecide && r.status === 'pending' && (
                <div className="flex justify-end gap-1">
                  <Button size="sm" icon={Check} onClick={() => setTarget({ row: r, decision: 'approved' })}>Approve</Button>
                  <Button size="sm" variant="secondary" icon={X} onClick={() => setTarget({ row: r, decision: 'rejected' })}>Reject</Button>
                </div>
              ),
            },
          ]}
          empty={<EmptyState title={`No ${tab === 'all' ? '' : tab} corrections`} description="Requests from employees show up here." />}
        />
      </Card>
      <Modal open={!!target} onClose={() => setTarget(null)} title={`${target?.decision === 'approved' ? 'Approve' : 'Reject'} correction`} size="sm" footer={<><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button variant={target?.decision === 'approved' ? 'primary' : 'danger'} loading={busy} onClick={decide}>{target?.decision === 'approved' ? 'Approve' : 'Reject'}</Button></>}>
        <p className="mb-3 text-sm text-slate-600"><b>{target?.row.employeeName || target?.row.employee?.name}</b> · {fmtDate(target?.row.date)}<br />“{target?.row.reason}”</p>
        <Field label="Comment (optional)"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
