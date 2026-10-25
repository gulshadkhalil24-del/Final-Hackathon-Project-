import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api, fieldErrors } from '../lib/api';
import { useAction, useFetch } from '../lib/hooks';
import { deptName, desigName, fmtDate, fmtMoney, humanize } from '../lib/utils';
import { Alert, Avatar, Button, Card, ErrorState, Field, Input, PageHeader, PageLoader, StatusBadge, Textarea } from '../components/ui.jsx';

/* Employee self-service profile (#06 own phone & address). Salary, role and attendance are NOT editable here. */
export default function ProfilePage() {
  const { data, loading, error, reload } = useFetch(() => api.get('/employees/me'), []);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [run, busy] = useAction();

  const e = data?.employee || data;
  if (e && !form) setForm({ phone: e.phone || '', address: e.address || '' });

  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
  if (loading || !form) return <PageLoader />;

  const save = async (ev) => {
    ev.preventDefault();
    if (form.phone && !/^[0-9+\-\s()]{7,20}$/.test(form.phone)) return setErrors({ phone: 'Enter a valid phone number.' });
    setErrors({});
    await run(() => api.patch('/me/profile', form), { success: 'Profile updated.', onError: (er) => setErrors(fieldErrors(er)) });
  };

  const row = (l, v) => (<div><dt className="text-xs font-semibold text-slate-500">{l}</dt><dd className="mt-0.5 text-sm text-slate-800">{v || '—'}</dd></div>);

  return (
    <>
      <PageHeader title="My profile" actions={<Link to="/change-password"><Button variant="secondary" icon={KeyRound}>Change password</Button></Link>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-5 flex items-center gap-4">
            <Avatar name={e.name} size="lg" />
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">{e.name}</h2>
              <p className="text-sm text-slate-500">{desigName(e)} · {deptName(e)}</p>
              <div className="mt-1"><StatusBadge status={e.status} /></div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            {row('Employee code', e.code)}{row('Email', e.email)}{row('Gender', humanize(e.gender))}{row('Joined', fmtDate(e.joinDate))}
          </dl>
          <Alert tone="info" className="mt-5">Job details and salary are managed by HR. Contact HR to change them.</Alert>
        </Card>
        <Card title="Contact details" subtitle="You can update your phone and address.">
          <form onSubmit={save} className="space-y-4" noValidate>
            <Field label="Phone" error={errors.phone}><Input value={form.phone} error={errors.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} /></Field>
            <Field label="Address" error={errors.address}><Textarea value={form.address} onChange={(ev) => setForm({ ...form, address: ev.target.value })} /></Field>
            <div className="flex justify-end"><Button type="submit" loading={busy}>Save</Button></div>
          </form>
        </Card>
      </div>
    </>
  );
}
