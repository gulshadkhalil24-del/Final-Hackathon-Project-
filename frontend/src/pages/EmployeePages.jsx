import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Pencil, Plus, Search, Upload } from 'lucide-react';
import { api, errMsg, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useDebounce, useFetch } from '../lib/hooks';
import { asList, asTotal, deptName, desigName, EMPLOYEE_STATUSES, fmtDate, fmtMoney, fmtTime, GENDERS, humanize, todayISO, monthLabel } from '../lib/utils';
import { Alert, Avatar, Badge, Button, Card, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Pagination, Progress, Select, StatusBadge, Tabs, FilterBar } from '../components/ui.jsx';
import { SecretModal } from './OrgPages.jsx';

const PAGE_SIZE = 10;

/* ===================== Directory (#07) ===================== */
export function EmployeesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isHR = user.role === 'hr';
  const [search, setSearch] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search);
  const depts = useFetch(() => api.get('/departments'), []);
  const { data, loading, error, reload } = useFetch(() => api.get('/employees', { search: q, departmentId: dept, status, page, pageSize: PAGE_SIZE }), [q, dept, status, page]);
  const [run, busy] = useAction();

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={isHR ? 'Register employees, edit details, import or export.' : 'Directory of every employee (view only).'}
        actions={
          isHR && (
            <>
              <Button variant="secondary" icon={Download} loading={busy} onClick={() => run(() => api.download('/employees/export', `employees-${todayISO()}.csv`))}>Export</Button>
              <Button variant="secondary" icon={Upload} onClick={() => navigate('/employees/import')}>Import CSV</Button>
              <Button icon={Plus} onClick={() => navigate('/employees/new')}>Register employee</Button>
            </>
          )
        }
      />
      <Card padded={false}>
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search name, code or email" className="pl-9" aria-label="Search employees" />
          </div>
          <Select value={dept} onChange={(e) => { setDept(e.target.value); setPage(1); }} placeholder="All departments" options={asList(depts.data).map((d) => ({ value: d.id, label: d.name }))} aria-label="Department" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} placeholder="All statuses" options={EMPLOYEE_STATUSES} aria-label="Status" />
        </div>
        <DataTable
          rows={asList(data)}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(r) => navigate(`/employees/${r.id}`)}
          columns={[
            { key: 'name', header: 'Employee', render: (r) => (
              <div className="flex items-center gap-3">
                <Avatar name={r.name} size="sm" />
                <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{r.name}</p><p className="truncate text-xs text-slate-500">{r.email}</p></div>
              </div>
            ) },
            { key: 'code', header: 'Code' },
            { key: 'department', header: 'Department', render: deptName },
            { key: 'designation', header: 'Designation', render: desigName },
            { key: 'joinDate', header: 'Joined', render: (r) => fmtDate(r.joinDate) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
          empty={
            <EmptyState
              title={q || dept || status ? 'No employees match these filters' : 'No employees yet'}
              description={q || dept || status ? 'Try clearing the search or filters.' : isHR ? 'Register the first employee. This also creates their login.' : 'HR registers employees. They will appear here.'}
              action={isHR && !q && !dept && !status && <Button icon={Plus} onClick={() => navigate('/employees/new')}>Register employee</Button>}
            />
          }
        />
        <Pagination page={page} pageSize={PAGE_SIZE} total={asTotal(data)} onChange={setPage} />
      </Card>
    </>
  );
}

/* ===================== Register / edit (#06, #14) ===================== */
const EMPTY = { name: '', email: '', code: '', departmentId: '', designationId: '', gender: '', joinDate: todayISO(), status: 'active', phone: '', address: '', basicSalary: '', hraPercent: 40, medicalPercent: 10 };

export function SalaryPreview({ basic, hra = 40, medical = 10 }) {
  const b = Number(basic) || 0;
  const h = (b * Number(hra)) / 100;
  const m = (b * Number(medical)) / 100;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-slate-500">Basic</dt><dd className="font-semibold text-slate-800">{fmtMoney(b)}</dd></div>
      <div><dt className="text-xs text-slate-500">HRA ({hra}%)</dt><dd className="font-semibold text-slate-800">{fmtMoney(h)}</dd></div>
      <div><dt className="text-xs text-slate-500">Medical ({medical}%)</dt><dd className="font-semibold text-slate-800">{fmtMoney(m)}</dd></div>
      <div><dt className="text-xs text-slate-500">Gross</dt><dd className="font-extrabold text-brand-700">{fmtMoney(b + h + m)}</dd></div>
    </dl>
  );
}

export function EmployeeFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const navigate = useNavigate();
  const [f, setF] = useState(EMPTY);
  const [loaded, setLoaded] = useState(!editing);
  const [errors, setErrors] = useState({});
  const [secret, setSecret] = useState(null);
  const [run, busy] = useAction();
  const depts = useFetch(() => api.get('/departments'), []);
  const desigs = useFetch(() => api.get('/designations'), []);
  const existing = useFetch(async () => {
    if (!editing) return null;
    const r = await api.get(`/employees/${id}`);
    const e = r.employee || r;
    setF({
      name: e.name || '', email: e.email || '', code: e.code || '', departmentId: e.departmentId ?? e.department?.id ?? '', designationId: e.designationId ?? e.designation?.id ?? '',
      gender: e.gender || '', joinDate: String(e.joinDate || '').slice(0, 10), status: e.status || 'active', phone: e.phone || '', address: e.address || '',
      basicSalary: e.basicSalary ?? '', hraPercent: e.hraPercent ?? 40, medicalPercent: e.medicalPercent ?? 10,
    });
    setLoaded(true);
    return e;
  }, [id]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const validate = () => {
    const errs = {};
    if (!f.name.trim()) errs.name = 'Required.';
    if (!/^\S+@\S+\.\S+$/.test(f.email)) errs.email = 'Enter a valid email.';
    if (!f.code.trim()) errs.code = 'Required. Must be unique.';
    if (!f.departmentId) errs.departmentId = 'Choose a department.';
    if (!f.designationId) errs.designationId = 'Choose a designation.';
    if (!f.joinDate) errs.joinDate = 'Required.';
    if (!(Number(f.basicSalary) > 0)) errs.basicSalary = 'Salary must be above 0.';
    setErrors(errs);
    return !Object.keys(errs).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const body = { ...f, basicSalary: Number(f.basicSalary), hraPercent: Number(f.hraPercent), medicalPercent: Number(f.medicalPercent) };
    const res = await run(() => (editing ? api.put(`/employees/${id}`, body) : api.post('/employees', body)), {
      success: editing ? 'Employee updated.' : undefined,
      onError: (er) => setErrors(fieldErrors(er)),
    });
    if (!res) return;
    if (editing) navigate(`/employees/${id}`);
    else setSecret({ title: 'Employee registered', message: `Login created for ${f.name}. Share this temporary password; they must change it on first sign-in.`, password: res.temporaryPassword, id: res.employee?.id ?? res.id });
  };

  if (editing && existing.error) return <Card><ErrorState error={existing.error} onRetry={existing.reload} /></Card>;
  if (!loaded || depts.loading || desigs.loading) return <PageLoader />;

  return (
    <>
      <Link to={editing ? `/employees/${id}` : '/employees'} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Back</Link>
      <PageHeader title={editing ? 'Edit employee' : 'Register employee'} subtitle={editing ? 'Update job details and salary.' : 'This also creates the employee’s login with a temporary password.'} />
      <form onSubmit={submit} noValidate className="space-y-5">
        <Card title="Account">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full name" required error={errors.name}><Input value={f.name} onChange={set('name')} error={errors.name} /></Field>
            <Field label="Work email" required error={errors.email}><Input type="email" value={f.email} onChange={set('email')} error={errors.email} disabled={editing} /></Field>
            <Field label="Employee code" required error={errors.code}><Input value={f.code} onChange={set('code')} error={errors.code} placeholder="EMP-001" /></Field>
          </div>
        </Card>
        <Card title="Job details">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Department" required error={errors.departmentId}><Select value={f.departmentId} onChange={set('departmentId')} error={errors.departmentId} placeholder="Select…" options={asList(depts.data).map((d) => ({ value: d.id, label: d.name }))} /></Field>
            <Field label="Designation" required error={errors.designationId}><Select value={f.designationId} onChange={set('designationId')} error={errors.designationId} placeholder="Select…" options={asList(desigs.data).map((d) => ({ value: d.id, label: d.name }))} /></Field>
            <Field label="Gender"><Select value={f.gender} onChange={set('gender')} placeholder="Select…" options={GENDERS} /></Field>
            <Field label="Join date" required error={errors.joinDate}><Input type="date" value={f.joinDate} onChange={set('joinDate')} error={errors.joinDate} /></Field>
            <Field label="Status"><Select value={f.status} onChange={set('status')} options={EMPLOYEE_STATUSES} /></Field>
          </div>
          {(!asList(depts.data).length || !asList(desigs.data).length) && (
            <Alert tone="warn" className="mt-4">No departments or designations found. Ask Admin to add them under Organization first.</Alert>
          )}
        </Card>
        <Card title="Contact">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field>
          </div>
        </Card>
        <Card title="Salary structure" subtitle="Gross = basic + HRA + medical (1.5 × basic with the default 40% / 10%).">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Basic salary (monthly)" required error={errors.basicSalary}><Input type="number" min="0" value={f.basicSalary} onChange={set('basicSalary')} error={errors.basicSalary} /></Field>
            <Field label="HRA %"><Input type="number" min="0" value={f.hraPercent} onChange={set('hraPercent')} /></Field>
            <Field label="Medical %"><Input type="number" min="0" value={f.medicalPercent} onChange={set('medicalPercent')} /></Field>
          </div>
          <div className="mt-4"><SalaryPreview basic={f.basicSalary} hra={f.hraPercent} medical={f.medicalPercent} /></div>
        </Card>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={busy}>{editing ? 'Save changes' : 'Register employee'}</Button>
        </div>
      </form>
      <SecretModal secret={secret} onClose={() => { const sid = secret?.id; setSecret(null); navigate(sid ? `/employees/${sid}` : '/employees'); }} />
    </>
  );
}

/* ===================== Employee 360 (#07) ===================== */
export function Employee360Page() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const { data, loading, error, reload } = useFetch(() => api.get(`/employees/${id}`), [id]);
  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
  if (loading && !data) return <PageLoader />;
  const e = data.employee || data;
  const canSeeMoney = user.role !== 'employee';
  const att = data.attendance || data.attendanceSummary || {};
  const balances = data.leaveBalances || [];
  const leaves = data.leaves || [];
  const payslips = data.payslips || [];

  const tabs = [{ value: 'overview', label: 'Overview' }, { value: 'attendance', label: 'Attendance' }, { value: 'leave', label: 'Leave' }, ...(canSeeMoney ? [{ value: 'payroll', label: 'Payroll' }] : [])];
  const info = (label, value) => (<div><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-0.5 text-sm text-slate-800">{value || '—'}</dd></div>);

  return (
    <>
      <Link to="/employees" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Employees</Link>
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={e.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold text-slate-900">{e.name}</h1>
            <p className="text-sm text-slate-500">{desigName(e)} · {deptName(e)} · {e.code}</p>
            <div className="mt-1.5"><StatusBadge status={e.status} /></div>
          </div>
          {user.role === 'hr' && <Link to={`/employees/${id}/edit`}><Button variant="secondary" icon={Pencil}>Edit</Button></Link>}
        </div>
      </Card>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Profile"><dl className="grid grid-cols-2 gap-4">{info('Email', e.email)}{info('Phone', e.phone)}{info('Gender', humanize(e.gender))}{info('Joined', fmtDate(e.joinDate))}{info('Exit date', e.exitDate ? fmtDate(e.exitDate) : null)}<div className="col-span-2">{info('Address', e.address)}</div></dl></Card>
          <Card title="This month"><dl className="grid grid-cols-3 gap-4 text-center">{[['Present', att.present], ['Late', att.late], ['Absent', att.absent], ['Half day', att.half_day ?? att.halfDay], ['On leave', att.on_leave ?? att.onLeave], ['Hours', att.hours]].map(([l, v]) => (<div key={l}><dd className="text-xl font-extrabold text-slate-900">{v ?? 0}</dd><dt className="text-xs text-slate-500">{l}</dt></div>))}</dl></Card>
        </div>
      )}

      {tab === 'attendance' && (
        <Card padded={false} title="Recent attendance">
          <DataTable rows={data.recentAttendance || []} rowKey="date" columns={[
            { key: 'date', header: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'checkIn', header: 'In', render: (r) => fmtTime(r.checkIn) },
            { key: 'checkOut', header: 'Out', render: (r) => fmtTime(r.checkOut) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]} empty={<EmptyState title="No attendance yet" />} />
        </Card>
      )}

      {tab === 'leave' && (
        <div className="space-y-5">
          <Card title="Balances">
            {balances.length ? (
              <div className="grid gap-4 sm:grid-cols-3">{balances.map((b) => (<div key={b.type}><div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{humanize(b.type)}</span><span className="text-slate-500">{b.unlimited ? 'Unlimited' : `${b.remaining}/${b.quota}`}</span></div>{!b.unlimited && <Progress value={b.remaining} max={b.quota} />}</div>))}</div>
            ) : <p className="text-sm text-slate-500">No leave types configured.</p>}
          </Card>
          <Card padded={false} title="History">
            <DataTable rows={leaves} columns={[
              { key: 'type', header: 'Type', render: (r) => humanize(r.type?.name || r.type) },
              { key: 'startDate', header: 'From', render: (r) => fmtDate(r.startDate) },
              { key: 'endDate', header: 'To', render: (r) => fmtDate(r.endDate) },
              { key: 'days', header: 'Days' },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]} empty={<EmptyState title="No leave requests" />} />
          </Card>
        </div>
      )}

      {tab === 'payroll' && canSeeMoney && (
        <div className="space-y-5">
          <Card title="Salary structure"><SalaryPreview basic={e.basicSalary} hra={e.hraPercent ?? 40} medical={e.medicalPercent ?? 10} /></Card>
          <Card padded={false} title="Payslips">
            <DataTable rows={payslips} columns={[
              { key: 'month', header: 'Month', render: (r) => monthLabel(r.month) },
              { key: 'gross', header: 'Gross', render: (r) => fmtMoney(r.gross) },
              { key: 'net', header: 'Net', render: (r) => <b>{fmtMoney(r.net)}</b> },
              { key: 'pdf', header: '', className: 'text-right', render: (r) => <Button variant="ghost" size="sm" icon={Download} onClick={() => api.download(`/payslips/${r.id}/pdf`, `payslip-${r.month}.pdf`)}>PDF</Button> },
            ]} empty={<EmptyState title="No payslips yet" description="Payslips appear after payroll is finalized." />} />
          </Card>
        </div>
      )}
    </>
  );
}

/* ===================== CSV import with dry run (#08) ===================== */
const CSV_TEMPLATE = 'code,name,email,department,designation,gender,joinDate,basicSalary,phone,address\nEMP-001,Ayesha Khan,ayesha@example.com,Engineering,Developer,female,2026-01-15,80000,03001234567,Karachi\n';

export function ImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [run, busy] = useAction();

  const download = () => {
    const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'employees-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const send = async (dryRun) => {
    setError('');
    const form = new FormData();
    form.append('file', file);
    const res = await run(() => api.upload('/employees/import', form, { dryRun }), { success: dryRun ? undefined : 'Employees imported.', onError: (e) => setError(errMsg(e)) });
    if (!res) return;
    if (dryRun) setReport(res);
    else navigate('/employees');
  };

  const errs = report?.errors || [];
  const valid = report && !errs.length && (report.valid ?? report.total) > 0;

  return (
    <>
      <Link to="/employees" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Employees</Link>
      <PageHeader title="Import employees from CSV" subtitle="Run a dry run first. Nothing is saved until you confirm." actions={<Button variant="secondary" icon={FileSpreadsheet} onClick={download}>Download template</Button>} />
      <Card title="1. Choose a file">
        <p className="mb-3 text-sm text-slate-500">Required: code, name, email, department, designation, joinDate (YYYY-MM-DD), basicSalary. Codes and emails must be unique; departments must already exist.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files?.[0] || null); setReport(null); setError(''); }} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100" aria-label="CSV file" />
        <div className="mt-4"><Button disabled={!file} loading={busy} onClick={() => send(true)}>Run dry run</Button></div>
        {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      </Card>

      {report && (
        <Card className="mt-5" title="2. Dry-run result" subtitle={`${report.total ?? '—'} rows checked`}>
          {errs.length === 0 ? (
            <Alert tone="success">All {report.valid ?? report.total} rows look good.</Alert>
          ) : (
            <>
              <Alert tone="error" className="mb-4">{errs.length} problem{errs.length > 1 ? 's' : ''} found. Fix the file and run the dry run again.</Alert>
              <DataTable rowKey="idx" rows={errs.map((x, i) => ({ ...x, idx: i }))} columns={[{ key: 'row', header: 'Row' }, { key: 'field', header: 'Field' }, { key: 'reason', header: 'Reason' }]} />
            </>
          )}
          <div className="mt-4 flex justify-end"><Button disabled={!valid} loading={busy} onClick={() => send(false)}>Import {report.valid ?? report.total} employees</Button></div>
        </Card>
      )}
    </>
  );
}
