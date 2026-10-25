import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, CalendarDays, CalendarCheck, Clock, FileDown, KeyRound, ScrollText, Settings2, Sparkles, TrendingDown, Upload, UserCheck, UserMinus, UserPlus, Users, Hourglass } from 'lucide-react';
import { api } from '../lib/api';
import { useFetch } from '../lib/hooks';
import { asList, fmtDate, fmtDateTime, fmtMoney, fmtNum, hours, monthStartISO, pct, todayISO, monthLabel, humanize } from '../lib/utils';
import { Avatar, Button, Card, DataTable, EmptyState, ErrorState, FilterBar, Field, Input, PageHeader, PageLoader, Progress, Select, StatCard, StatusBadge } from '../components/ui.jsx';
import ChartCard, { AXIS, COLORS, GRID, SERIES, TOOLTIP_STYLE } from '../components/ChartCard.jsx';
import AISummary from '../components/AISummary.jsx';
import CheckInWidget from '../components/CheckInWidget.jsx';
import { openAssistant } from '../components/AIChat.jsx';

/** Role-based shortcuts — one click to the most common task. */
function QuickActions({ actions }) {
  return (
    <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
      {actions.map((a) => {
        const inner = (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-white">
              <a.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{a.label}</p>
              <p className="truncate text-xs text-slate-500">{a.hint}</p>
            </div>
          </>
        );
        return a.to ? (
          <Link key={a.label} to={a.to} className="card group flex items-center gap-3 p-3.5 transition hover:-translate-y-0.5 hover:shadow-lg">
            {inner}
          </Link>
        ) : (
          <button key={a.label} type="button" onClick={a.onClick} className="card group flex items-center gap-3 p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-lg">
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Date range + department filters shared by the HR and Admin dashboards. All numbers are computed on the server. */
function Filters({ value, onChange }) {
  const depts = useFetch(() => api.get('/departments'), []);
  return (
    <FilterBar>
      <Field label="From"><Input type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} /></Field>
      <Field label="To"><Input type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} /></Field>
      <Field label="Department">
        <Select value={value.dept} onChange={(e) => onChange({ ...value, dept: e.target.value })} placeholder="All departments" options={asList(depts.data).map((d) => ({ value: d.id, label: d.name }))} />
      </Field>
      <Button variant="ghost" size="sm" onClick={() => onChange({ from: monthStartISO(), to: todayISO(), dept: '' })}>Reset</Button>
    </FilterBar>
  );
}

const useFilters = () => useState({ from: monthStartISO(), to: todayISO(), dept: '' });
const params = (f) => ({ from: f.from, to: f.to, dept: f.dept });

function BarCard({ title, subtitle, data, x, bars, horizontal, formatter }) {
  return (
    <ChartCard title={title} subtitle={subtitle} data={data}>
      <ResponsiveContainer>
        <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ left: horizontal ? 24 : 0, right: 8, top: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={!horizontal} horizontal={horizontal ? false : true} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey={x} tick={AXIS} width={90} />
            </>
          ) : (
            <>
              <XAxis dataKey={x} tick={AXIS} interval={0} />
              <YAxis tick={AXIS} allowDecimals={false} tickFormatter={formatter} />
            </>
          )}
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={formatter ? (v) => formatter(v) : undefined} />
          {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {bars.map((b, i) => (
            <Bar key={b.key} dataKey={b.key} name={b.name || humanize(b.key)} fill={b.color || SERIES[i]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ----------------------------- HR ----------------------------- */
export function HRDashboard() {
  const [filters, setFilters] = useFilters();
  const { data, loading, error, reload } = useFetch(() => api.get('/dashboard/hr', params(filters)), [filters.from, filters.to, filters.dept]);
  const k = data?.kpis || {};

  return (
    <>
      <PageHeader title="HR dashboard" subtitle="Live numbers from attendance and leave records." />
      <Filters value={filters} onChange={setFilters} />
      {error ? (
        <Card><ErrorState error={error} onRetry={reload} /></Card>
      ) : loading && !data ? (
        <PageLoader />
      ) : (
        <div className="space-y-5">
          <QuickActions
            actions={[
              { to: '/employees/new', icon: UserPlus, label: 'Register employee', hint: 'Creates their login too' },
              { to: '/employees/import', icon: Upload, label: 'Import CSV', hint: 'Dry run first' },
              { to: '/leave/requests', icon: CalendarCheck, label: 'Leave inbox', hint: 'Approve or reject' },
              { to: '/payroll', icon: Banknote, label: 'Run payroll', hint: 'Monthly draft' },
            ]}
          />
          <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Headcount" value={fmtNum(k.headcount)} icon={Users} />
            <StatCard label="Present today" value={fmtNum(k.present)} icon={UserCheck} />
            <StatCard label="On leave" value={fmtNum(k.onLeave)} tone="amber" icon={CalendarDays} />
            <StatCard label="Late today" value={fmtNum(k.lateToday)} tone="violet" icon={Clock} />
            <StatCard label="Pending approvals" value={fmtNum(k.pendingApprovals)} tone="red" icon={Hourglass} hint="Leave + corrections" />
          </div>

          <AISummary scope="hr" filters={params(filters)} />

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Attendance trend" subtitle="Attendance rate by day" data={data?.attendanceTrend}>
              <ResponsiveContainer>
                <LineChart data={data?.attendanceTrend} margin={{ right: 8, top: 8 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={AXIS} tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis tick={AXIS} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => pct(v)} labelFormatter={fmtDate} />
                  <Line type="monotone" dataKey="rate" name="Attendance rate" stroke={COLORS.amber} strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
            <BarCard title="Absenteeism by department" subtitle="Absent days ÷ expected working days" data={data?.absenteeismByDept} x="department" bars={[{ key: 'rate', name: 'Absenteeism %', color: COLORS.red }]} formatter={(v) => `${Number(v).toFixed(1)}%`} />
            <BarCard title="Leave by type" subtitle="Approved days in range" data={data?.leaveByType} x="type" bars={[{ key: 'days', name: 'Days', color: COLORS.violet }]} />
            <Card title="Top 5 late-comers" subtitle="Late arrivals in the selected range">
              {data?.topLateComers?.length ? (
                <ol className="space-y-3">
                  {data.topLateComers.slice(0, 5).map((p, i) => (
                    <li key={p.employeeId || i} className="flex items-center gap-3">
                      <span className="w-4 text-sm font-bold text-slate-400">{i + 1}</span>
                      <Avatar name={p.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{p.name}</p>
                        <p className="truncate text-xs text-slate-500">{p.department}</p>
                      </div>
                      <span className="text-sm font-bold text-accent-amber">{p.count}×</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState icon={Clock} title="No late arrivals" description="Nobody has been late in this range." />
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Admin ----------------------------- */
export function AdminDashboard() {
  const [filters, setFilters] = useFilters();
  const { data, loading, error, reload } = useFetch(() => api.get('/dashboard/admin', params(filters)), [filters.from, filters.to, filters.dept]);
  const k = data?.kpis || {};

  return (
    <>
      <PageHeader title="Company dashboard" subtitle="Headcount, attrition and payroll across the company." />
      <Filters value={filters} onChange={setFilters} />
      {error ? (
        <Card><ErrorState error={error} onRetry={reload} /></Card>
      ) : loading && !data ? (
        <PageLoader />
      ) : (
        <div className="space-y-5">
          <QuickActions
            actions={[
              { to: '/org', icon: Settings2, label: 'Organization', hint: 'Depts, quotas, holidays' },
              { to: '/users', icon: KeyRound, label: 'Manage logins', hint: 'HR accounts & resets' },
              { to: '/payroll', icon: FileDown, label: 'Finalize payroll', hint: 'Lock the month' },
              { to: '/audit', icon: ScrollText, label: 'Audit log', hint: 'Every action, before/after' },
            ]}
          />
          <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Headcount" value={fmtNum(k.headcount)} icon={Users} />
            <StatCard label="Attrition YTD" value={pct(k.attritionYtd)} tone="red" icon={TrendingDown} />
            <StatCard label="Payroll cost" value={fmtMoney(k.payrollCost, { compact: true })} tone="violet" icon={Banknote} hint="Latest finalized month" />
            <StatCard label="Average salary" value={fmtMoney(k.avgSalary, { compact: true })} tone="amber" icon={UserMinus} hint="Mean gross" />
          </div>

          <AISummary scope="admin" filters={params(filters)} />

          <div className="grid gap-5 lg:grid-cols-2">
            <BarCard title="Headcount by department" data={data?.headcountByDept} x="department" bars={[{ key: 'count', name: 'Employees', color: COLORS.teal }]} />
            <BarCard title="Payroll cost by department" subtitle="Gross vs net" data={data?.payrollCostByDept} x="department" formatter={(v) => fmtMoney(v, { compact: true })} bars={[{ key: 'gross', name: 'Gross', color: COLORS.violet }, { key: 'net', name: 'Net', color: COLORS.teal }]} />
            <ChartCard title="Gender" data={data?.gender}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data?.gender} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {data?.gender?.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
            <BarCard title="Tenure" subtitle="Employees by years of service" data={data?.tenure} x="bucket" bars={[{ key: 'count', name: 'Employees', color: COLORS.amber }]} />
          </div>

          <Card title="Recent activity" subtitle="Latest entries from the audit log" action={<Link to="/audit" className="text-xs font-semibold text-brand-700 hover:underline">View all</Link>}>
            <DataTable
              rows={data?.auditFeed}
              empty={<EmptyState title="No activity yet" description="Actions like creating employees or approving leave appear here." />}
              columns={[
                { key: 'at', header: 'When', render: (r) => fmtDateTime(r.at) },
                { key: 'actor', header: 'Actor', render: (r) => r.actor?.name || r.actor || '—' },
                { key: 'action', header: 'Action', render: (r) => humanize(r.action) },
                { key: 'entity', header: 'Entity', render: (r) => humanize(r.entity) },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  );
}

/* ----------------------------- Employee ----------------------------- */
export function EmployeeDashboard() {
  const { data, loading, error, reload } = useFetch(() => api.get('/dashboard/employee'), []);
  const d = data || {};
  const target = d.weeklyTarget || 40;

  return (
    <>
      <PageHeader title="My dashboard" subtitle="Your attendance, leave and payslip at a glance." actions={<Button variant="secondary" icon={Sparkles} onClick={() => openAssistant()}>Ask my assistant</Button>} />
      <div className="space-y-5">
        <CheckInWidget onChange={reload} />
        {error ? (
          <Card><ErrorState error={error} onRetry={reload} /></Card>
        ) : loading && !data ? (
          <PageLoader />
        ) : (
          <>
            <QuickActions
              actions={[
                { to: '/leave', icon: CalendarDays, label: 'Apply for leave', hint: 'Or try smart leave ✦' },
                { to: '/attendance', icon: CalendarCheck, label: 'My attendance', hint: 'Calendar & corrections' },
                { to: '/payslips', icon: Banknote, label: 'My payslips', hint: 'Download PDFs' },
                { onClick: () => openAssistant(), icon: Sparkles, label: 'Ask AI', hint: 'English or Roman Urdu' },
              ]}
            />
            <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              <Card title="Hours this week">
                <p className="text-3xl font-extrabold text-slate-900">{hours(d.hoursThisWeek)} <span className="text-base font-semibold text-slate-400">/ {target} h</span></p>
                <Progress className="mt-3" value={d.hoursThisWeek || 0} max={target} />
              </Card>
              <Card title="Late arrivals">
                <p className="text-3xl font-extrabold text-accent-amber">{fmtNum(d.lateCount ?? 0)}</p>
                <p className="mt-1 text-sm text-slate-500">this month</p>
              </Card>
              <Card title="Last payslip" action={<Link to="/payslips" className="text-xs font-semibold text-brand-700 hover:underline">All payslips</Link>}>
                {d.lastPayslip ? (
                  <>
                    <p className="text-sm text-slate-500">{monthLabel(d.lastPayslip.month)}</p>
                    <p className="text-2xl font-extrabold text-slate-900">{fmtMoney(d.lastPayslip.net)}</p>
                    <p className="text-xs text-slate-500">Net pay</p>
                  </>
                ) : (
                  <p className="text-sm text-slate-500">No payslip yet. It appears once Admin finalizes the month.</p>
                )}
              </Card>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <Card title="Leave balance" action={<Link to="/leave" className="text-xs font-semibold text-brand-700 hover:underline">Apply for leave</Link>}>
                {d.leaveBalance?.length ? (
                  <ul className="space-y-4">
                    {d.leaveBalance.map((b) => (
                      <li key={b.type}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span className="font-semibold text-slate-700">{humanize(b.type)}</span>
                          <span className="text-slate-500">{b.unlimited ? 'Unlimited' : `${b.remaining} of ${b.quota} left`}</span>
                        </div>
                        {!b.unlimited && <Progress value={b.remaining} max={b.quota} tone={b.remaining <= 1 ? 'red' : 'teal'} />}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={CalendarDays} title="No leave types set up" description="Ask Admin to add leave types." />
                )}
              </Card>
              <Card title="Announcements" action={<Link to="/announcements" className="text-xs font-semibold text-brand-700 hover:underline">See all</Link>}>
                {d.announcements?.length ? (
                  <ul className="space-y-3">
                    {d.announcements.slice(0, 3).map((a) => (
                      <li key={a.id} className="rounded-lg border border-slate-100 p-3">
                        <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{a.body}</p>
                        <p className="mt-1 text-xs text-slate-400">{fmtDate(a.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No announcements" description="Company news will show up here." />
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </>
  );
}
