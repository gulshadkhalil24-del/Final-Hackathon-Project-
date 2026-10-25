import { Fragment, useState } from 'react';
import { Bell, ChevronDown, ChevronRight, Megaphone, Plus } from 'lucide-react';
import { api, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useFetch } from '../lib/hooks';
import { asList, asTotal, cn, fmtDateTime, humanize } from '../lib/utils';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, FilterBar, Input, Modal, PageHeader, PageLoader, Pagination, Select, Textarea, Alert } from '../components/ui.jsx';

/* ===================== Announcements (#23) ===================== */
export function AnnouncementsPage() {
  const { user } = useAuth();
  const canPost = user.role !== 'employee';
  const { data, loading, error, reload } = useFetch(() => api.get('/announcements'), []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', body: '' });
  const [errors, setErrors] = useState({});
  const [run, busy] = useAction();

  const post = async () => {
    const errs = {};
    if (!f.title.trim()) errs.title = 'Required.';
    if (!f.body.trim()) errs.body = 'Required.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await run(() => api.post('/announcements', { title: f.title.trim(), body: f.body.trim() }), { success: 'Announcement posted.', onError: (e) => setErrors(fieldErrors(e)) });
    if (res) {
      setOpen(false);
      setF({ title: '', body: '' });
      reload();
    }
  };

  return (
    <>
      <PageHeader title="Announcements" subtitle="Company news. Everyone sees these on their dashboard." actions={canPost && <Button icon={Plus} onClick={() => setOpen(true)}>Post announcement</Button>} />
      {error ? <Card><ErrorState error={error} onRetry={reload} /></Card> : loading && !data ? <PageLoader /> : asList(data).length === 0 ? (
        <Card><EmptyState icon={Megaphone} title="No announcements yet" description={canPost ? 'Post the first one to share news with everyone.' : 'Company news will appear here.'} action={canPost && <Button icon={Plus} onClick={() => setOpen(true)}>Post announcement</Button>} /></Card>
      ) : (
        <div className="space-y-3">
          {asList(data).map((a) => (
            <Card key={a.id}>
              <div className="flex items-start gap-3">
                <Avatar name={a.author?.name || a.authorName || 'A'} size="sm" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-slate-900">{a.title}</h2>
                  <p className="text-xs text-slate-500">{a.author?.name || a.authorName} · {fmtDateTime(a.createdAt)}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.body}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Post announcement" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={post}>Post</Button></>}>
        <div className="space-y-4">
          <Field label="Title" required error={errors.title}><Input value={f.title} error={errors.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Message" required error={errors.body}><Textarea rows={6} value={f.body} error={errors.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        </div>
      </Modal>
    </>
  );
}

/* ===================== Notifications (#24) ===================== */
export function NotificationsPage() {
  const { data, loading, error, reload } = useFetch(() => api.get('/notifications'), []);
  const [run, busy] = useAction();
  const list = asList(data);
  const notify = () => window.dispatchEvent(new Event('hcm:notifications-changed'));

  const markRead = async (n) => {
    if (n.isRead || n.read) return;
    await run(() => api.patch(`/notifications/${n.id}/read`));
    notify();
    reload();
  };
  const markAll = async () => {
    await run(() => api.patch('/notifications/read-all'), { success: 'All marked as read.' });
    notify();
    reload();
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Leave decisions, payslips and other updates." actions={list.some((n) => !(n.isRead || n.read)) && <Button variant="secondary" loading={busy} onClick={markAll}>Mark all as read</Button>} />
      {error ? <Card><ErrorState error={error} onRetry={reload} /></Card> : loading && !data ? <PageLoader /> : (
        <Card padded={false}>
          {list.length === 0 ? <EmptyState icon={Bell} title="You are all caught up" description="New notifications will show up here." /> : (
            <ul className="divide-y divide-slate-100">
              {list.map((n) => {
                const unread = !(n.isRead || n.read);
                return (
                  <li key={n.id}>
                    <button onClick={() => markRead(n)} className={cn('flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-slate-50', unread && 'bg-brand-50/50')}>
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-brand-500' : 'bg-transparent')} />
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm', unread ? 'font-semibold text-slate-900' : 'text-slate-700')}>{n.title || n.message}</p>
                        {n.title && n.message && <p className="text-sm text-slate-500">{n.message}</p>}
                        <p className="mt-0.5 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

/* ===================== Audit log (#25, Admin, read-only) ===================== */
const PAGE_SIZE = 15;
function Json({ label, value }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-xs font-semibold text-slate-500">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{value ? JSON.stringify(value, null, 2) : '—'}</pre>
    </div>
  );
}

export function AuditLogPage() {
  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const { data, loading, error, reload } = useFetch(() => api.get('/audit-logs', { ...filters, page, pageSize: PAGE_SIZE }), [filters.action, filters.entity, filters.from, filters.to, page]);
  const set = (k) => (e) => { setFilters((s) => ({ ...s, [k]: e.target.value })); setPage(1); };
  const rows = asList(data);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every important action: who, what, when, with before/after values. Entries can never be edited or deleted." />
      <FilterBar>
        <Field label="Action"><Select value={filters.action} onChange={set('action')} placeholder="All actions" options={['create', 'update', 'approve', 'reject', 'finalize', 'deactivate', 'reset_password', 'login']} /></Field>
        <Field label="Entity"><Select value={filters.entity} onChange={set('entity')} placeholder="All entities" options={['employee', 'user', 'leave', 'attendance_correction', 'payroll_run', 'settings', 'department', 'designation', 'leave_type', 'holiday', 'announcement']} /></Field>
        <Field label="From"><Input type="date" value={filters.from} onChange={set('from')} /></Field>
        <Field label="To"><Input type="date" value={filters.to} onChange={set('to')} /></Field>
      </FilterBar>
      <Card padded={false}>
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !rows.length ? <PageLoader /> : rows.length === 0 ? <EmptyState title="No audit entries" description="Entries appear as people create, update, approve and finalize things." /> : (
          <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
            <table className="tbl">
              <thead><tr><th className="w-8" /><th>When</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const open = openId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="tbl-row" onClick={() => setOpenId(open ? null : r.id)}>
                        <td>{open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}</td>
                        <td className="whitespace-nowrap">{fmtDateTime(r.at || r.createdAt)}</td>
                        <td>{r.actor?.name || r.actorName || r.actor || '—'}</td>
                        <td><Badge tone={/approve|finalize|create/.test(r.action) ? 'green' : /reject|deactivate|delete/.test(r.action) ? 'red' : 'blue'}>{humanize(r.action)}</Badge></td>
                        <td>{humanize(r.entity)}{r.entityId ? <span className="text-slate-400"> #{String(r.entityId).slice(0, 8)}</span> : null}</td>
                      </tr>
                      {open && (
                        <tr key={`${r.id}-d`}>
                          <td colSpan={5} className="bg-slate-50">
                            <div className="flex flex-col gap-3 py-1 sm:flex-row"><Json label="Before" value={r.before} /><Json label="After" value={r.after} /></div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={asTotal(data)} onChange={setPage} />
      </Card>
    </>
  );
}
