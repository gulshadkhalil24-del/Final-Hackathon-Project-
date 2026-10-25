import { useState } from 'react';
import { KeyRound, MapPin, Pencil, Plus, Power, Trash2, UserPlus, Copy } from 'lucide-react';
import { api, errMsg, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useFetch } from '../lib/hooks';
import { asList, fmtDate, WEEKDAYS, PASSWORD_HINT } from '../lib/utils';
import { Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Select, StatusBadge, Tabs } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';

/* ===================== Company settings (#03) ===================== */
export function SettingsPage() {
  const { user } = useAuth();
  const readOnly = user.role !== 'admin';
  const { data, loading, error, reload } = useFetch(() => api.get('/settings'), []);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [run, busy] = useAction();
  const toast = useToast();

  if (data && !form) {
    setForm({
      companyName: data.companyName ?? data.name ?? '',
      officeStart: (data.officeStart ?? '09:00').slice(0, 5),
      graceMinutes: data.graceMinutes ?? 15,
      halfDayHours: data.halfDayHours ?? 5,
      weekendDays: data.weekendDays ?? [0, 6],
      officeLat: data.officeLat ?? '',
      officeLng: data.officeLng ?? '',
      radiusM: data.radiusM ?? 150,
    });
  }

  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
  if (loading || !form) return <PageLoader />;

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const toggleDay = (d) => setForm((s) => ({ ...s, weekendDays: s.weekendDays.includes(d) ? s.weekendDays.filter((x) => x !== d) : [...s.weekendDays, d].sort() }));

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Location is not supported by this browser.');
    navigator.geolocation.getCurrentPosition(
      (p) => setForm((s) => ({ ...s, officeLat: p.coords.latitude.toFixed(6), officeLng: p.coords.longitude.toFixed(6) })),
      () => toast.error('Could not read your location. Allow location access or type the coordinates.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.companyName.trim()) errs.companyName = 'Required.';
    if (form.graceMinutes === '' || Number(form.graceMinutes) < 0) errs.graceMinutes = 'Enter 0 or more minutes.';
    if (!(Number(form.halfDayHours) > 0)) errs.halfDayHours = 'Enter hours above 0.';
    if (form.officeLat !== '' && Math.abs(Number(form.officeLat)) > 90) errs.officeLat = 'Latitude must be between -90 and 90.';
    if (form.officeLng !== '' && Math.abs(Number(form.officeLng)) > 180) errs.officeLng = 'Longitude must be between -180 and 180.';
    if (!(Number(form.radiusM) > 0)) errs.radiusM = 'Radius must be above 0 m.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    await run(
      () =>
        api.put('/settings', {
          ...form,
          graceMinutes: Number(form.graceMinutes),
          halfDayHours: Number(form.halfDayHours),
          radiusM: Number(form.radiusM),
          officeLat: form.officeLat === '' ? null : Number(form.officeLat),
          officeLng: form.officeLng === '' ? null : Number(form.officeLng),
        }),
      { success: 'Settings saved. They apply to new records only.', onError: (er) => setErrors(fieldErrors(er)) }
    );
  };

  return (
    <>
      <PageHeader title="Company settings" subtitle="Office hours, grace time, weekend and the office location used for camera attendance." />
      {readOnly && <Alert tone="info" className="mb-4">You can view these settings. Only Admin can change them.</Alert>}
      <form onSubmit={save} noValidate className="space-y-5">
        <Card title="Company & working hours" subtitle="Changes apply to new records only; past attendance is not recalculated.">
          <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name" required error={errors.companyName} className="sm:col-span-2"><Input value={form.companyName} onChange={set('companyName')} error={errors.companyName} /></Field>
            <Field label="Office start time"><Input type="time" value={form.officeStart} onChange={set('officeStart')} /></Field>
            <Field label="Grace time (minutes)" error={errors.graceMinutes} hint="Late is counted after start time + grace."><Input type="number" min="0" value={form.graceMinutes} onChange={set('graceMinutes')} error={errors.graceMinutes} /></Field>
            <Field label="Half day if worked under (hours)" error={errors.halfDayHours}><Input type="number" min="1" step="0.5" value={form.halfDayHours} onChange={set('halfDayHours')} error={errors.halfDayHours} /></Field>
            <Field as="div" label="Weekend">
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d, i) => (
                  <label key={d} className={`cursor-pointer select-none rounded-lg border px-3 py-1.5 text-sm font-medium ${form.weekendDays.includes(i) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-300 text-slate-600'}`}>
                    <input type="checkbox" className="sr-only" checked={form.weekendDays.includes(i)} onChange={() => toggleDay(i)} />
                    {d}
                  </label>
                ))}
              </div>
            </Field>
          </fieldset>
        </Card>

        <Card title="Office location" subtitle="Camera check-ins are accepted only inside this radius (checked on the server)." action={!readOnly && <Button variant="secondary" size="sm" icon={MapPin} onClick={useMyLocation}>Use my location</Button>}>
          <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-3">
            <Field label="Latitude" error={errors.officeLat}><Input type="number" step="any" value={form.officeLat} onChange={set('officeLat')} error={errors.officeLat} placeholder="24.8607" /></Field>
            <Field label="Longitude" error={errors.officeLng}><Input type="number" step="any" value={form.officeLng} onChange={set('officeLng')} error={errors.officeLng} placeholder="67.0011" /></Field>
            <Field label="Radius (metres)" error={errors.radiusM}><Input type="number" min="10" value={form.radiusM} onChange={set('radiusM')} error={errors.radiusM} /></Field>
          </fieldset>
        </Card>

        {!readOnly && (
          <div className="flex justify-end">
            <Button type="submit" loading={busy}>Save settings</Button>
          </div>
        )}
      </form>
    </>
  );
}

/* ===================== Departments, designations, leave types, holidays (#04) ===================== */
const SECTIONS = {
  departments: {
    label: 'Departments',
    endpoint: '/departments',
    fields: [{ name: 'name', label: 'Name', required: true }],
    columns: [{ key: 'name', header: 'Name' }, { key: 'employeeCount', header: 'Employees', render: (r) => r.employeeCount ?? '—' }],
  },
  designations: {
    label: 'Designations',
    endpoint: '/designations',
    fields: [{ name: 'name', label: 'Name', required: true }],
    columns: [{ key: 'name', header: 'Name' }],
  },
  leaveTypes: {
    label: 'Leave types',
    endpoint: '/leave-types',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'yearlyQuota', label: 'Yearly quota (days)', type: 'number', required: true, hint: 'Use 0 for unlimited / unpaid.' },
      { name: 'isPaid', label: 'Paid', type: 'select', options: [{ value: 'true', label: 'Paid' }, { value: 'false', label: 'Unpaid' }] },
    ],
    columns: [
      { key: 'name', header: 'Name' },
      { key: 'yearlyQuota', header: 'Yearly quota', render: (r) => (Number(r.yearlyQuota) > 0 ? `${r.yearlyQuota} days` : 'Unlimited') },
      { key: 'isPaid', header: 'Pay', render: (r) => <Badge tone={r.isPaid === false ? 'amber' : 'green'}>{r.isPaid === false ? 'Unpaid' : 'Paid'}</Badge> },
    ],
  },
  holidays: {
    label: 'Public holidays',
    endpoint: '/holidays',
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'date', label: 'Date', type: 'date', required: true },
    ],
    columns: [{ key: 'date', header: 'Date', render: (r) => fmtDate(r.date) }, { key: 'name', header: 'Name' }],
  },
};

function CrudSection({ cfg, canEdit }) {
  const { data, loading, error, reload } = useFetch(() => api.get(cfg.endpoint), [cfg.endpoint]);
  const [editing, setEditing] = useState(null); // {} for new, row for edit
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [run, busy] = useAction();

  const open = (row) => {
    setEditing(row);
    setErrors({});
    const f = {};
    cfg.fields.forEach((fl) => (f[fl.name] = row[fl.name] != null ? String(fl.type === 'date' ? String(row[fl.name]).slice(0, 10) : row[fl.name]) : fl.name === 'isPaid' ? 'true' : ''));
    setForm(f);
  };

  const save = async () => {
    const errs = {};
    cfg.fields.forEach((fl) => fl.required && !String(form[fl.name]).trim() && (errs[fl.name] = 'Required.'));
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = { ...form };
    if ('yearlyQuota' in body) body.yearlyQuota = Number(body.yearlyQuota);
    if ('isPaid' in body) body.isPaid = body.isPaid === 'true';
    const res = await run(() => (editing.id ? api.put(`${cfg.endpoint}/${editing.id}`, body) : api.post(cfg.endpoint, body)), {
      success: editing.id ? 'Updated.' : 'Added.',
      onError: (e) => setErrors(fieldErrors(e)),
    });
    if (res) {
      setEditing(null);
      reload();
    }
  };

  const remove = async () => {
    const res = await run(() => api.del(`${cfg.endpoint}/${deleting.id}`), { success: 'Deleted.' });
    if (res) {
      setDeleting(null);
      reload();
    }
  };

  const columns = [
    ...cfg.columns,
    ...(canEdit
      ? [{
          key: 'actions',
          header: '',
          className: 'w-24 text-right',
          render: (r) => (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" aria-label="Edit" onClick={() => open(r)}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" aria-label="Delete" onClick={() => setDeleting(r)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
            </div>
          ),
        }]
      : []),
  ];

  return (
    <Card padded={false} title={cfg.label} action={canEdit && <Button size="sm" icon={Plus} onClick={() => open({})}>Add</Button>}>
      <DataTable
        columns={columns}
        rows={asList(data)}
        loading={loading}
        error={error}
        onRetry={reload}
        empty={<EmptyState title={`No ${cfg.label.toLowerCase()} yet`} description={canEdit ? 'Add the first one to get started.' : 'Admin has not added any yet.'} action={canEdit && <Button size="sm" icon={Plus} onClick={() => open({})}>Add</Button>} />}
      />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`${editing?.id ? 'Edit' : 'Add'} ${cfg.label.toLowerCase().replace(/s$/, '')}`}
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}
      >
        <div className="space-y-4">
          {cfg.fields.map((fl) => (
            <Field key={fl.name} label={fl.label} required={fl.required} error={errors[fl.name]} hint={fl.hint}>
              {fl.type === 'select' ? (
                <Select value={form[fl.name] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [fl.name]: e.target.value }))} options={fl.options} />
              ) : (
                <Input type={fl.type || 'text'} min={fl.type === 'number' ? 0 : undefined} value={form[fl.name] ?? ''} error={errors[fl.name]} onChange={(e) => setForm((s) => ({ ...s, [fl.name]: e.target.value }))} />
              )}
            </Field>
          ))}
        </div>
      </Modal>
      <ConfirmDialog open={!!deleting} danger busy={busy} title="Delete this entry?" message={`“${deleting?.name}” will be removed. This fails if employees or records still use it.`} confirmLabel="Delete" onConfirm={remove} onClose={() => setDeleting(null)} />
    </Card>
  );
}

export function OrgPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('departments');
  return (
    <>
      <PageHeader title="Organization" subtitle="Departments, designations, leave types and yearly quotas, public holidays." />
      {user.role !== 'admin' && <Alert tone="info" className="mb-4">You can view this setup. Only Admin can change it.</Alert>}
      <Tabs tabs={Object.entries(SECTIONS).map(([value, s]) => ({ value, label: s.label }))} value={tab} onChange={setTab} />
      <CrudSection key={tab} cfg={SECTIONS[tab]} canEdit={user.role === 'admin'} />
    </>
  );
}

/* ===================== Logins (#05, Admin) ===================== */
function SecretModal({ secret, onClose }) {
  const toast = useToast();
  return (
    <Modal open={!!secret} onClose={onClose} title={secret?.title || 'Temporary password'} size="sm" footer={<Button onClick={onClose}>Done</Button>}>
      <p className="text-sm text-slate-600">{secret?.message}</p>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5">
        <code className="break-all text-base font-bold text-slate-900">{secret?.password}</code>
        <Button variant="secondary" size="sm" icon={Copy} onClick={() => navigator.clipboard?.writeText(secret.password).then(() => toast.success('Copied.'))}>Copy</Button>
      </div>
      <Alert tone="warn" className="mt-3">This is shown only once. The user must change it on first sign-in.</Alert>
    </Modal>
  );
}
export { SecretModal };

export function UsersPage() {
  const [role, setRole] = useState('');
  const { data, loading, error, reload } = useFetch(() => api.get('/users', { role }), [role]);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [secret, setSecret] = useState(null);
  const [confirm, setConfirm] = useState(null); // {type,user}
  const [run, busy] = useAction();

  const create = async () => {
    const errs = {};
    if (!f.name.trim()) errs.name = 'Required.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) errs.email = 'Enter a valid email.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await run(() => api.post('/users/hr', { name: f.name.trim(), email: f.email.trim(), password: f.password || undefined }), { onError: (e) => setErrors(fieldErrors(e)) });
    if (res) {
      setCreating(false);
      setF({ name: '', email: '', password: '' });
      setSecret({ title: 'HR login created', message: `Share this temporary password with ${res.user?.name || f.name}.`, password: res.temporaryPassword });
      reload();
    }
  };

  const doConfirm = async () => {
    const { type, user } = confirm;
    const res = await run(
      () => (type === 'reset' ? api.post(`/users/${user.id}/reset-password`) : api.patch(`/users/${user.id}/${type}`)),
      { success: type === 'reset' ? undefined : type === 'deactivate' ? 'Login deactivated.' : 'Login activated.' }
    );
    if (res) {
      setConfirm(null);
      if (type === 'reset') setSecret({ title: 'Password reset', message: `New temporary password for ${user.name}.`, password: res.temporaryPassword });
      reload();
    }
  };

  const rows = asList(data);
  return (
    <>
      <PageHeader
        title="Logins"
        subtitle="Create HR logins, deactivate or reset any login. Employee logins are created when HR registers the employee."
        actions={<Button icon={UserPlus} onClick={() => setCreating(true)}>New HR login</Button>}
      />
      <Card padded={false}>
        <div className="border-b border-slate-100 p-4 sm:w-64">
          <Select value={role} onChange={(e) => setRole(e.target.value)} placeholder="All roles" options={[{ value: 'hr', label: 'HR' }, { value: 'employee', label: 'Employee' }, { value: 'admin', label: 'Admin' }]} aria-label="Filter by role" />
        </div>
        <DataTable
          rows={rows}
          loading={loading}
          error={error}
          onRetry={reload}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="font-semibold text-slate-800">{r.name || '—'}</span> },
            { key: 'email', header: 'Email' },
            { key: 'role', header: 'Role', render: (r) => <Badge tone={r.role === 'admin' ? 'violet' : r.role === 'hr' ? 'blue' : 'slate'}>{String(r.role).toUpperCase()}</Badge> },
            { key: 'isActive', header: 'Status', render: (r) => <StatusBadge status={r.isActive === false ? 'inactive' : 'active'} /> },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              render: (r) =>
                r.role === 'admin' ? null : (
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => setConfirm({ type: 'reset', user: r })}>Reset</Button>
                    {r.isActive === false ? (
                      <Button variant="ghost" size="sm" icon={Power} onClick={() => setConfirm({ type: 'activate', user: r })}>Activate</Button>
                    ) : (
                      <Button variant="ghost" size="sm" icon={Power} onClick={() => setConfirm({ type: 'deactivate', user: r })}>Deactivate</Button>
                    )}
                  </div>
                ),
            },
          ]}
          empty={<EmptyState title="No logins yet" description="Create the first HR login so HR can register employees." />}
        />
      </Card>

      <Modal open={creating} onClose={() => setCreating(false)} title="New HR login" size="sm" footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button loading={busy} onClick={create}>Create login</Button></>}>
        <div className="space-y-4">
          <Field label="Full name" required error={errors.name}><Input value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email" required error={errors.email}><Input type="email" value={f.email} error={errors.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Temporary password (optional)" error={errors.password} hint={`Leave blank to generate one. ${PASSWORD_HINT}`}><Input value={f.password} error={errors.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        danger={confirm?.type === 'deactivate'}
        title={confirm?.type === 'reset' ? 'Reset password?' : confirm?.type === 'deactivate' ? 'Deactivate login?' : 'Activate login?'}
        message={
          confirm?.type === 'reset'
            ? `${confirm?.user?.name} will get a new temporary password and must change it on next sign-in.`
            : confirm?.type === 'deactivate'
            ? `${confirm?.user?.name} will no longer be able to sign in. Their records are kept.`
            : `${confirm?.user?.name} will be able to sign in again.`
        }
        confirmLabel={confirm?.type === 'reset' ? 'Reset' : confirm?.type === 'deactivate' ? 'Deactivate' : 'Activate'}
        onConfirm={doConfirm}
        onClose={() => setConfirm(null)}
      />
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
    </>
  );
}
