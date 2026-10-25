import { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { api, errMsg } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useFetch } from '../lib/hooks';
import { asList, fmtDate, humanize, todayISO } from '../lib/utils';
import { Alert, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Progress, Select, StatusBadge, Tabs, Textarea } from '../components/ui.jsx';
import { AIBadge } from '../components/AIChat.jsx';

/* ===================== Employee: balance, apply, smart leave, history (#12, #21) ===================== */
export function MyLeavePage() {
  const balance = useFetch(() => api.get('/leave/balance'), []);
  const history = useFetch(() => api.get('/leave/me'), []);
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
  const [formError, setFormError] = useState('');
  const [smartText, setSmartText] = useState('');
  const [smartBusy, setSmartBusy] = useState(false);
  const [smartNote, setSmartNote] = useState(null); // {tone,text}
  const [aiFilled, setAiFilled] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [run, busy] = useAction();

  const types = asList(balance.data);

  const smart = async () => {
    setSmartBusy(true);
    setSmartNote(null);
    try {
      const r = await api.post('/ai/smart-leave', { text: smartText }, { timeout: 20000 });
      const match = types.find((t) => String(t.typeId) === String(r.leaveTypeId)) || types.find((t) => String(t.type).toLowerCase() === String(r.type).toLowerCase());
      setForm({ leaveTypeId: match?.typeId ?? '', startDate: r.start || r.startDate || '', endDate: r.end || r.endDate || '', reason: r.reason || '' });
      setAiFilled(true);
      setSmartNote({ tone: 'ai', text: match ? 'I filled the form below. Please check the dates and confirm. Nothing is saved until you submit.' : 'I filled in what I could, but could not match the leave type. Please choose it.' });
    } catch (e) {
      setSmartNote({ tone: 'warn', text: e.status === 429 ? 'AI limit reached for this hour. Please fill the form manually.' : 'The assistant could not read that. Please fill the form manually.' });
    } finally {
      setSmartBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.leaveTypeId || !form.startDate || !form.endDate) return setFormError('Choose a leave type and both dates.');
    if (form.endDate < form.startDate) return setFormError('End date cannot be before the start date.');
    const res = await run(() => api.post('/leave', form), { success: 'Leave request sent to HR.', onError: (er) => setFormError(er.status === 422 ? `${errMsg(er)} (overlaps another request, or more than your balance)` : errMsg(er)) });
    if (res) {
      setForm({ leaveTypeId: '', startDate: '', endDate: '', reason: '' });
      setAiFilled(false);
      setSmartNote(null);
      setSmartText('');
      balance.reload();
      history.reload();
    }
  };

  const cancel = async () => {
    const res = await run(() => api.patch(`/leave/${cancelling.id}/cancel`), { success: 'Leave cancelled.' });
    if (res) {
      setCancelling(null);
      balance.reload();
      history.reload();
    }
  };

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  return (
    <>
      <PageHeader title="My leave" subtitle="Weekends and public holidays are skipped automatically." />
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balance.error ? <div className="sm:col-span-4"><Card><ErrorState error={balance.error} onRetry={balance.reload} /></Card></div> : types.map((b) => (
            <div key={b.typeId ?? b.type} className="card p-4">
              <p className="text-xs font-semibold text-slate-500">{humanize(b.type)}</p>
              <p className="mt-1 text-2xl font-extrabold text-slate-900">{b.unlimited ? '∞' : b.remaining}<span className="text-sm font-semibold text-slate-400">{b.unlimited ? '' : ` / ${b.quota} days left`}</span></p>
              {!b.unlimited && <Progress className="mt-2" value={b.remaining} max={b.quota} tone={b.remaining <= 1 ? 'red' : 'teal'} />}
              {b.used > 0 && <p className="mt-1.5 text-xs text-slate-500">{b.used} used this year</p>}
            </div>
          ))}
        </div>

        <Card title="Smart leave" subtitle="Describe what you need in plain words (English or Roman Urdu)." action={<AIBadge />}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input value={smartText} onChange={(e) => setSmartText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && smartText.trim() && !smartBusy && smart()} placeholder="e.g. I need next Monday and Tuesday off for my sister’s wedding" maxLength={300} aria-label="Describe your leave" />
            <Button icon={Sparkles} loading={smartBusy} disabled={!smartText.trim()} onClick={smart} className="shrink-0 !bg-accent-violet">Fill form</Button>
          </div>
          {smartNote && <Alert tone={smartNote.tone} className="mt-3">{smartNote.text}</Alert>}
        </Card>

        <Card title="Apply for leave" action={aiFilled && <AIBadge />}>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
            {formError && <div className="sm:col-span-2"><Alert tone="error">{formError}</Alert></div>}
            <Field label="Leave type" required><Select value={form.leaveTypeId} onChange={set('leaveTypeId')} placeholder="Select…" options={types.map((t) => ({ value: t.typeId, label: humanize(t.type) }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" required><Input type="date" min={todayISO()} value={form.startDate} onChange={set('startDate')} /></Field>
              <Field label="To" required><Input type="date" min={form.startDate || todayISO()} value={form.endDate} onChange={set('endDate')} /></Field>
            </div>
            <Field label="Reason" className="sm:col-span-2"><Textarea value={form.reason} onChange={set('reason')} maxLength={300} /></Field>
            <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={busy}>Submit request</Button></div>
          </form>
        </Card>

        <Card padded={false} title="History">
          <DataTable
            rows={asList(history.data)}
            loading={history.loading}
            error={history.error}
            onRetry={history.reload}
            columns={[
              { key: 'type', header: 'Type', render: (r) => humanize(r.type?.name || r.type) },
              { key: 'startDate', header: 'From', render: (r) => fmtDate(r.startDate) },
              { key: 'endDate', header: 'To', render: (r) => fmtDate(r.endDate) },
              { key: 'days', header: 'Days' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'decisionComment', header: 'HR comment', render: (r) => r.decisionComment || '—' },
              { key: 'actions', header: '', className: 'text-right', render: (r) => r.status === 'pending' && <Button variant="ghost" size="sm" onClick={() => setCancelling(r)}>Cancel</Button> },
            ]}
            empty={<EmptyState title="No leave requests yet" description="Your requests and their decisions will be listed here." />}
          />
        </Card>
      </div>
      <ConfirmDialog open={!!cancelling} danger busy={busy} title="Cancel this request?" message={`Your ${humanize(cancelling?.type?.name || cancelling?.type)} request for ${fmtDate(cancelling?.startDate)} – ${fmtDate(cancelling?.endDate)} will be cancelled.`} confirmLabel="Cancel request" onConfirm={cancel} onClose={() => setCancelling(null)} />
    </>
  );
}

/* ===================== HR inbox / Admin view (#13) ===================== */
export function LeaveRequestsPage() {
  const { user } = useAuth();
  const canDecide = user.role === 'hr';
  const [tab, setTab] = useState('pending');
  const { data, loading, error, reload } = useFetch(() => api.get('/leave/requests', { status: tab === 'all' ? '' : tab }), [tab]);
  const [target, setTarget] = useState(null);
  const [comment, setComment] = useState('');
  const [run, busy] = useAction();

  const decide = async () => {
    const res = await run(() => api.patch(`/leave/${target.row.id}/decision`, { decision: target.decision, comment: comment.trim() }), { success: `Leave ${target.decision}.` });
    if (res) {
      setTarget(null);
      setComment('');
      reload();
    }
  };

  return (
    <>
      <PageHeader title={canDecide ? 'Leave inbox' : 'Leave requests'} subtitle={canDecide ? 'Approve or reject with a comment.' : 'View only. HR makes the decisions.'} />
      <Tabs tabs={['pending', 'approved', 'rejected', 'cancelled', 'all']} value={tab} onChange={setTab} />
      <Card padded={false}>
        <DataTable
          rows={asList(data)}
          loading={loading}
          error={error}
          onRetry={reload}
          columns={[
            { key: 'employee', header: 'Employee', render: (r) => <div><p className="font-semibold text-slate-800">{r.employeeName || r.employee?.name}</p><p className="text-xs text-slate-500">{r.department?.name || r.departmentName}</p></div> },
            { key: 'type', header: 'Type', render: (r) => humanize(r.type?.name || r.type) },
            { key: 'dates', header: 'Dates', render: (r) => `${fmtDate(r.startDate)} → ${fmtDate(r.endDate)}` },
            { key: 'days', header: 'Days' },
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
          empty={<EmptyState title={`No ${tab === 'all' ? '' : tab} requests`} description="Leave requests from employees will appear here." />}
        />
      </Card>
      <Modal open={!!target} onClose={() => setTarget(null)} title={`${target?.decision === 'approved' ? 'Approve' : 'Reject'} leave`} size="sm" footer={<><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button variant={target?.decision === 'approved' ? 'primary' : 'danger'} loading={busy} onClick={decide}>{target?.decision === 'approved' ? 'Approve' : 'Reject'}</Button></>}>
        <p className="mb-3 text-sm text-slate-600"><b>{target?.row.employeeName || target?.row.employee?.name}</b> · {humanize(target?.row.type?.name || target?.row.type)} · {target?.row.days} day(s)<br />{fmtDate(target?.row.startDate)} → {fmtDate(target?.row.endDate)}</p>
        <Field label={target?.decision === 'rejected' ? 'Reason for rejection' : 'Comment (optional)'}><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
