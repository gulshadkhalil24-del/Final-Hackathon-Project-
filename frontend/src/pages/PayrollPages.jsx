import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, Lock, Plus, RefreshCw, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { useAction, useFetch } from '../lib/hooks';
import { asList, fmtDateTime, fmtMoney, monthISO, monthLabel, shiftMonth } from '../lib/utils';
import { Alert, Badge, Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Progress, StatCard, StatusBadge } from '../components/ui.jsx';
import ChartCard, { AXIS, COLORS, GRID, TOOLTIP_STYLE } from '../components/ChartCard.jsx';

/* ===================== Runs list (#15) ===================== */
export function PayrollPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canCreate = user.role === 'hr';
  const { data, loading, error, reload } = useFetch(() => api.get('/payroll/runs'), []);
  const [creating, setCreating] = useState(false);
  const [month, setMonth] = useState(shiftMonth(monthISO(), -1));
  const [run, busy] = useAction();

  const create = async () => {
    const res = await run(() => api.post('/payroll/runs', { month }), { success: 'Payroll draft created.' });
    if (res) {
      setCreating(false);
      navigate(`/payroll/${res.run?.id ?? res.id}`);
    }
  };

  const runs = asList(data);
  const chartData = [...runs].reverse().map((r) => ({
    key: r.month,
    month: monthLabel(r.month).split(' ')[0],
    gross: Math.round(Number(r.totalGross) || 0),
    net: Math.round(Number(r.totalNet) || 0),
  }));

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle={canCreate ? 'Prepare the monthly draft. Admin finalizes and locks it.' : 'Review runs prepared by HR and finalize them.'}
        actions={canCreate && <Button icon={Plus} onClick={() => setCreating(true)}>Create payroll draft</Button>}
      />
      {chartData.length > 0 && (
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Gross vs net by month" subtitle="All payroll runs, oldest to newest" data={chartData}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ right: 8, top: 8 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={AXIS} interval={0} />
                  <YAxis tick={AXIS} tickFormatter={(v) => fmtMoney(v, { compact: true })} width={92} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtMoney(v)} labelFormatter={(l) => monthLabel(chartData.find((d) => d.month === l)?.key)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="gross" name="Gross" fill={COLORS.teal} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="net" name="Net" fill={COLORS.violet} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-1">
            <StatCard label="Runs" value={runs.length} hint={`${runs.filter((r) => r.status === 'finalized').length} finalized`} />
            <StatCard label="Total net paid" value={fmtMoney(runs.reduce((a, r) => a + (r.status === 'finalized' ? Number(r.totalNet) || 0 : 0), 0), { compact: true })} tone="violet" hint="Finalized months only" />
          </div>
        </div>
      )}
      <Card padded={false}>
        <DataTable
          rows={asList(data)}
          loading={loading}
          error={error}
          onRetry={reload}
          onRowClick={(r) => navigate(`/payroll/${r.id}`)}
          columns={[
            { key: 'month', header: 'Month', render: (r) => <span className="font-semibold text-slate-800">{monthLabel(r.month)}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'employeeCount', header: 'Employees' },
            { key: 'totalGross', header: 'Total gross', render: (r) => fmtMoney(r.totalGross) },
            { key: 'totalNet', header: 'Total net', render: (r) => <b>{fmtMoney(r.totalNet)}</b> },
            { key: 'finalizedAt', header: 'Finalized', render: (r) => (r.finalizedAt ? fmtDateTime(r.finalizedAt) : '—') },
          ]}
          empty={<EmptyState title="No payroll runs yet" description={canCreate ? 'Create a draft for a month once attendance and leave are recorded.' : 'HR has not prepared a payroll draft yet.'} action={canCreate && <Button icon={Plus} onClick={() => setCreating(true)}>Create payroll draft</Button>} />}
        />
      </Card>
      <Modal open={creating} onClose={() => setCreating(false)} title="Create payroll draft" size="sm" footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button loading={busy} onClick={create}>Create draft</Button></>}>
        <Field label="Month" required hint="Deductions come from absent days, unpaid leave and half days in that month."><Input type="month" value={month} max={monthISO()} onChange={(e) => setMonth(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

/* ===================== Run detail: review, recalc, finalize (#15, #16, #17) ===================== */
function PayslipDetail({ slip, onClose }) {
  const b = slip?.breakdown || {};
  const line = (l, v, strong) => (
    <div className={`flex justify-between py-1.5 text-sm ${strong ? 'border-t border-slate-200 font-extrabold text-slate-900' : 'text-slate-600'}`}><span>{l}</span><span>{fmtMoney(v)}</span></div>
  );
  const totalDeduction = (b.absentDeduction || 0) + (b.unpaidDeduction || 0) + (b.halfDayDeduction || 0) + (slip?.tax || 0);
  const pdfName = `payslip-${slip?.month || ''}-${slip?.employeeName || 'employee'}.pdf`;
  const pdfUrl = `/payslips/${slip?.id}/pdf`;
  return (
    <Modal
      open={!!slip}
      onClose={onClose}
      title={`Payslip · ${slip?.employeeName || ''}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {slip?.id && <Button icon={Download} onClick={() => api.download(pdfUrl, pdfName)}>PDF</Button>}
        </>
      }
    >
      {slip && (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-600">{monthLabel(slip.month)}</p>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Earnings</p>
          {line('Basic', b.basic)}{line('HRA', b.hra)}{line('Medical', b.medical)}{line('Gross', slip.gross, true)}
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Deductions</p>
          {line(`Absent (${slip.absentDays ?? 0} d)`, b.absentDeduction)}{line(`Unpaid leave (${slip.unpaidDays ?? 0} d)`, b.unpaidDeduction)}{line(`Half days (${slip.halfDays ?? 0})`, b.halfDayDeduction)}{line('Income tax', slip.tax)}
          <div className="mt-1 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700">Total deductions: {fmtMoney(totalDeduction)}</div>
          <div className="mt-3 flex items-baseline justify-between rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
            <span className="text-sm font-bold text-slate-700">Net pay</span>
            <span className="text-2xl font-extrabold text-brand-700">{fmtMoney(slip.net)}</span>
          </div>
          <p className="mt-3 text-xs text-slate-400">Working days: {slip.workingDays ?? '—'}. Per-day rate = gross ÷ working days.</p>
        </div>
      )}
    </Modal>
  );
}

export function PayrollRunPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useFetch(() => api.get(`/payroll/runs/${id}`), [id]);
  const [slip, setSlip] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'finalize' | 'recalc'
  const [run, busy] = useAction();

  if (error) return <Card><ErrorState error={error} onRetry={reload} /></Card>;
  if (loading && !data) return <PageLoader />;
  const r = data.run || data;
  const slips = data.payslips || [];
  const finalized = r.status === 'finalized';

  const doConfirm = async () => {
    const res = await run(() => (confirm === 'finalize' ? api.patch(`/payroll/runs/${id}/finalize`) : api.post(`/payroll/runs/${id}/recalculate`)), { success: confirm === 'finalize' ? 'Payroll finalized and locked. Payslips are available to employees.' : 'Draft recalculated.' });
    if (res) {
      setConfirm(null);
      reload();
    }
  };

  const totalGross = slips.reduce((a, s) => a + Number(s.gross || 0), 0);
  const totalTax = slips.reduce((a, s) => a + Number(s.tax || 0), 0);
  const totalNet = slips.reduce((a, s) => a + Number(s.net || 0), 0);
  const totalDeductions = totalGross - totalNet;

  return (
    <>
      <Link to="/payroll" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Payroll</Link>
      <PageHeader
        title={`Payroll · ${monthLabel(r.month)}`}
        subtitle={finalized ? `Finalized ${fmtDateTime(r.finalizedAt)}${r.finalizedBy ? ` by ${r.finalizedBy.name || r.finalizedBy}` : ''}` : 'Draft: HR can recalculate until Admin finalizes.'}
        actions={
          !finalized && (
            <>
              {user.role === 'hr' && <Button variant="secondary" icon={RefreshCw} onClick={() => setConfirm('recalc')}>Recalculate</Button>}
              {user.role === 'admin' && <Button icon={Lock} disabled={!slips.length} onClick={() => setConfirm('finalize')}>Finalize payroll</Button>}
            </>
          )
        }
      />
      {finalized ? <Alert tone="success" className="mb-4">This run is finalized and locked. It can no longer be edited.</Alert> : user.role === 'hr' && <Alert tone="info" className="mb-4">Only Admin can finalize. Review the numbers, then ask Admin to lock this month.</Alert>}
      <div className="stagger mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Employees" value={slips.length} />
        <StatCard label="Total gross" value={fmtMoney(totalGross, { compact: true })} tone="violet" />
        <StatCard label="Deductions" value={fmtMoney(totalDeductions, { compact: true })} tone="red" hint="Absent + unpaid + half days + tax" />
        <StatCard label="Income tax" value={fmtMoney(totalTax, { compact: true })} tone="amber" />
        <StatCard label="Total net" value={fmtMoney(totalNet, { compact: true })} tone="teal" />
      </div>

      {slips.length > 0 && (
        <div className="mb-5 grid gap-5 lg:grid-cols-3">
          <ChartCard title="Net pay by department" subtitle="Share of this month's net" data={slips} height={240}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={Object.entries(
                    slips.reduce((acc, s) => {
                      const k = s.department?.name || s.department || '—';
                      acc[k] = (acc[k] || 0) + Number(s.net || 0);
                      return acc;
                    }, {})
                  ).map(([name, value]) => ({ name, value }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {(Object.keys(
                    slips.reduce((acc, s) => {
                      const k = s.department?.name || s.department || '—';
                      acc[k] = (acc[k] || 0) + 1;
                      return acc;
                    }, {})
                  )).map((_, i) => (
                    <Cell key={i} fill={[COLORS.teal, COLORS.violet, COLORS.amber, COLORS.blue, COLORS.red, COLORS.slate][i % 6]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => fmtMoney(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <Card title="Top payslips" subtitle="Highest net pay this month" className="lg:col-span-2" padded={false}>
            <ol className="divide-y divide-slate-100 dark:divide-[#241436]">
              {[...slips]
                .sort((a, b) => Number(b.net || 0) - Number(a.net || 0))
                .slice(0, 4)
                .map((s, i) => (
                  <li key={s.employeeId} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-brand-50 text-brand-700'}`}>
                      {i === 0 ? <Trophy className="h-4 w-4" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{s.employeeName}</p>
                      <p className="truncate text-xs text-slate-500">{s.department?.name || s.department || '—'} · gross {fmtMoney(s.gross)}</p>
                    </div>
                    <div className="w-28 shrink-0 text-right">
                      <p className="text-sm font-extrabold text-brand-700">{fmtMoney(s.net)}</p>
                      <Progress className="mt-1" value={Number(s.net || 0)} max={Math.max(...slips.map((x) => Number(x.net || 0)), 1)} />
                    </div>
                  </li>
                ))}
            </ol>
          </Card>
        </div>
      )}
      <Card padded={false}>
        <DataTable
          rows={slips}
          rowKey="employeeId"
          columns={[
            { key: 'employeeName', header: 'Employee', render: (s) => <span className="font-semibold text-slate-800">{s.employeeName}</span> },
            { key: 'department', header: 'Department', render: (s) => s.department?.name || s.department || '—' },
            { key: 'workingDays', header: 'Work days' },
            { key: 'absentDays', header: 'Absent', render: (s) => s.absentDays ?? 0 },
            { key: 'unpaidDays', header: 'Unpaid', render: (s) => s.unpaidDays ?? 0 },
            { key: 'halfDays', header: 'Half', render: (s) => s.halfDays ?? 0 },
            { key: 'gross', header: 'Gross', render: (s) => fmtMoney(s.gross) },
            { key: 'deductions', header: 'Deductions', render: (s) => { const d = (s.breakdown?.absentDeduction || 0) + (s.breakdown?.unpaidDeduction || 0) + (s.breakdown?.halfDayDeduction || 0) + (s.tax || 0); return d > 0 ? <span className="text-red-600">-{fmtMoney(d)}</span> : fmtMoney(0); } },
            { key: 'net', header: 'Net', render: (s) => <b className="text-brand-700">{fmtMoney(s.net)}</b> },
            { key: 'view', header: '', className: 'text-right', render: (s) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" icon={Eye} onClick={() => setSlip({ ...s, month: r.month })}>View</Button>
                <Button variant="ghost" size="sm" aria-label="Download PDF" onClick={() => api.download(`/payslips/${s.id}/pdf`, `payslip-${r.month}-${s.employeeName}.pdf`)}><Download className="h-4 w-4" /></Button>
              </div>
            ) },
          ]}
          empty={<EmptyState title="No payslips in this run" description="There were no active employees for this month." />}
        />
      </Card>
      <PayslipDetail slip={slip} onClose={() => setSlip(null)} />
      <ConfirmDialog
        open={!!confirm}
        busy={busy}
        danger={confirm === 'finalize'}
        title={confirm === 'finalize' ? `Finalize ${monthLabel(r.month)}?` : 'Recalculate draft?'}
        message={confirm === 'finalize' ? 'This locks the month. Nobody can edit it afterwards and employees will be able to download their payslips.' : 'The draft is rebuilt from the latest attendance, leave and salary data.'}
        confirmLabel={confirm === 'finalize' ? 'Finalize & lock' : 'Recalculate'}
        onConfirm={doConfirm}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

/* ===================== Employee payslips (#17) ===================== */
export function PayslipsPage() {
  const { data, loading, error, reload } = useFetch(() => api.get('/payslips/me'), []);
  const [slip, setSlip] = useState(null);
  const [run, busy] = useAction();
  const items = asList(data);
  const totalGross = items.reduce((a, r) => a + Number(r.gross || 0), 0);
  const totalNet = items.reduce((a, r) => a + Number(r.net || 0), 0);
  const totalTax = items.reduce((a, r) => a + Number(r.tax || 0), 0);
  return (
    <>
      <PageHeader title="My payslips" subtitle="Payslips appear after Admin finalizes the month." />
      {items.length > 0 && (
        <div className="stagger mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Payslips" value={items.length} hint="Finalized months" />
          <StatCard label="Total gross" value={fmtMoney(totalGross, { compact: true })} tone="violet" />
          <StatCard label="Total tax" value={fmtMoney(totalTax, { compact: true })} tone="amber" />
          <StatCard label="Total net paid" value={fmtMoney(totalNet, { compact: true })} tone="teal" />
        </div>
      )}
      <Card padded={false}>
        <DataTable
          rows={asList(data)}
          loading={loading}
          error={error}
          onRetry={reload}
          columns={[
            { key: 'month', header: 'Month', render: (r) => <span className="font-semibold text-slate-800">{monthLabel(r.month)}</span> },
            { key: 'gross', header: 'Gross', render: (r) => fmtMoney(r.gross) },
            { key: 'tax', header: 'Tax', render: (r) => fmtMoney(r.tax) },
            { key: 'net', header: 'Net pay', render: (r) => <b>{fmtMoney(r.net)}</b> },
            {
              key: 'actions', header: '', className: 'text-right',
              render: (r) => (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" icon={Eye} onClick={() => setSlip({ ...r, employeeName: 'You' })}>View</Button>
                  <Button variant="secondary" size="sm" icon={Download} loading={busy} onClick={() => run(() => api.download(`/payslips/${r.id}/pdf`, `payslip-${r.month}.pdf`))}>PDF</Button>
                </div>
              ),
            },
          ]}
          empty={<EmptyState title="No payslips yet" description="Your first payslip shows up once your company finalizes payroll." />}
        />
      </Card>
      <PayslipDetail slip={slip} onClose={() => setSlip(null)} />
    </>
  );
}
