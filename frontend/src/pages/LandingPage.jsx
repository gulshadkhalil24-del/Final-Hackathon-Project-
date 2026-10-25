import { Link } from 'react-router-dom';
import {
  ArrowRight, Banknote, BarChart3, Bot, Building2, CalendarCheck, CalendarDays, Megaphone,
  ScrollText, ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { cn } from '../lib/utils';

const HERO_BARS = [
  { h: 40, color: 'bg-brand-500/80', d: '0.2s' },
  { h: 62, color: 'bg-brand-400/70', d: '0.35s' },
  { h: 36, color: 'bg-[#00cfe8]/60', d: '0.5s' },
  { h: 74, color: 'bg-brand-500/80', d: '0.65s' },
  { h: 55, color: 'bg-accent-violet/70', d: '0.8s' },
  { h: 88, color: 'bg-brand-400/80', d: '0.95s' },
  { h: 46, color: 'bg-[#00cfe8]/50', d: '1.1s' },
];

const MODULES = [
  { icon: ShieldCheck, name: 'Auth & Access', desc: 'JWT login, 3 roles, server-side data scope' },
  { icon: Building2, name: 'Organization', desc: 'Departments, designations, quotas, holidays' },
  { icon: Users, name: 'Employees', desc: 'Directory, Employee 360, CSV import/export' },
  { icon: CalendarCheck, name: 'Attendance', desc: 'Web check-in/out, corrections, geofence rules' },
  { icon: CalendarDays, name: 'Leave', desc: 'Balances, approvals, smart leave with AI' },
  { icon: Banknote, name: 'Payroll', desc: 'Monthly runs, PK tax slabs, locked finalizes' },
  { icon: BarChart3, name: 'Dashboards', desc: 'KPIs, trends, top late-comers — all live' },
  { icon: Bot, name: 'AI Assistant', desc: 'Answers from real data, Roman Urdu too' },
  { icon: Megaphone, name: 'Comms & Audit', desc: 'Announcements, notifications, audit trail' },
];

function GradientButton({ to, children, big }) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-xl font-bold text-white transition hover:-translate-y-0.5',
        big ? 'px-7 py-3.5 text-base' : 'px-5 py-2.5 text-sm',
        'shadow-[0_0_0_1px_rgba(200,77,245,.4),0_10px_30px_-8px_rgba(176,38,255,.8)]'
      )}
      style={{ background: 'linear-gradient(135deg,#8f1fe0 0%,#b026ff 55%,#c84df5 100%)' }}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function GhostButton({ to, children, dark, big }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl border font-bold transition hover:-translate-y-0.5',
        big ? 'px-7 py-3.5 text-base' : 'px-5 py-2.5 text-sm',
        dark
          ? 'border-white/15 bg-white/5 text-white hover:bg-white/10'
          : 'border-purple-300 bg-white text-brand-700 hover:bg-brand-50'
      )}
    >
      {children}
    </Link>
  );
}

/** Public landing page: hero → sign in → your dashboard. */
export default function LandingPage() {
  const { user, initialized } = useAuth();

  return (
    <div className="min-h-screen">
      {/* ============ Hero ============ */}
      <div className="relative overflow-hidden bg-ink-900 text-white">
        <div className="animate-orb absolute -right-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-brand-600/35 blur-3xl" />
        <div className="animate-orb-slow absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-accent-violet/25 blur-3xl" />
        <div className="animate-glow absolute left-1/3 top-1/4 h-48 w-48 rounded-full bg-[#00cfe8]/15 blur-3xl" />
        <div className="auth-grid-bg absolute inset-0" />

        {/* Nav */}
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent-violet text-base font-black shadow-[0_0_20px_rgba(176,38,255,.55)]">H</span>
            <span className="text-lg font-extrabold tracking-tight">HCM Lite</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-300 md:flex">
            <a href="#modules" className="transition hover:text-white">Modules</a>
            <a href="#how" className="transition hover:text-white">How it works</a>
            {user ? (
              <GradientButton to="/dashboard">Open dashboard</GradientButton>
            ) : (
              <GradientButton to="/login">Sign in</GradientButton>
            )}
          </nav>
          <div className="md:hidden">
            {user ? <GradientButton to="/dashboard">Dashboard</GradientButton> : <GradientButton to="/login">Sign in</GradientButton>}
          </div>
        </header>

        {/* Hero copy */}
        <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 text-center sm:px-8 sm:pt-20">
          <span className="page-enter mb-6 inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-100">
            <Sparkles className="h-3 w-3" /> Saylani Hackathon 2026 · AI-assisted HR
          </span>
          <h1 className="page-enter mx-auto max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
            HR that runs itself,{' '}
            <span className="bg-gradient-to-r from-[#d8b4fe] via-[#b026ff] to-[#00cfe8] bg-clip-text text-transparent">
              from check-in to payslip.
            </span>
          </h1>
          <p className="page-enter mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            One workspace for employees, attendance, leave and payroll — with an AI assistant
            that answers from your real data. Starts empty; every number is yours.
          </p>

          <div className="page-enter mt-9 flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <>
                <GradientButton to="/dashboard" big>Go to your dashboard</GradientButton>
                <span className="text-sm font-medium text-slate-400">Signed in as {user.email}</span>
              </>
            ) : initialized ? (
              <>
                <GradientButton to="/login" big>Sign in to your workspace</GradientButton>
                <GhostButton to="/setup" dark big>First-run setup</GhostButton>
              </>
            ) : initialized === false ? (
              <>
                <GradientButton to="/setup" big>Set up your company</GradientButton>
                <GhostButton to="/login" dark big>I already have an account</GhostButton>
              </>
            ) : null}
          </div>

          {/* App preview mock */}
          <div className="page-enter relative mx-auto mt-14 max-w-4xl">
            <div className="absolute -inset-6 rounded-3xl bg-brand-500/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur">
              <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-300/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-3 rounded-md bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-400">hcm-lite · dashboard</span>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-[auto_1fr] sm:p-5">
                {/* mini sidebar */}
                <div className="hidden w-40 space-y-2 sm:block">
                  {['Dashboard', 'Employees', 'Attendance', 'Leave', 'Payroll'].map((m, i) => (
                    <div key={m} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold', i === 0 ? 'bg-brand-500/25 text-brand-200 shadow-[0_0_14px_-4px_rgba(176,38,255,.7)]' : 'text-slate-500')}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', i === 0 ? 'bg-brand-400' : 'bg-slate-600')} />
                      {m}
                    </div>
                  ))}
                </div>
                {/* mini content */}
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2.5">
                    {[['Present', '42', 'text-brand-200'], ['On leave', '5', 'text-[#7ce4f5]'], ['Late', '3', 'text-amber-300']].map(([label, val, tone]) => (
                      <div key={label} className="rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2.5 text-left">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                        <p className={cn('text-xl font-extrabold', tone)}>{val}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex h-28 items-end gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    {HERO_BARS.map((b, i) => (
                      <div key={i} className={cn('preview-bar flex-1 rounded-sm', b.color)} style={{ height: `${b.h}%`, animationDelay: b.d }} />
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {[0, 1, 2].map((r) => (
                      <div key={r} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
                        <span className="h-5 w-5 rounded-full bg-brand-500/25" />
                        <span className="h-2 w-24 rounded-full bg-white/10" />
                        <span className="ml-auto h-2 w-12 rounded-full bg-[#00cfe8]/25" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ Stats strip ============ */}
      <div className="border-b border-purple-100 bg-[#f8f5ff]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-5 py-8 text-center sm:grid-cols-4 sm:px-8">
          {[['25', 'functionalities'], ['9', 'modules'], ['3', 'roles with RBAC'], ['AI', 'built-in, offline']].map(([v, l]) => (
            <div key={l}>
              <p className="bg-gradient-to-r from-brand-700 to-accent-violet bg-clip-text text-3xl font-extrabold text-transparent">{v}</p>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ============ Modules ============ */}
      <div id="modules" className="bg-[#f8f5ff] py-16">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Everything covered</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Nine modules, one system</h2>
            <p className="mt-2 text-sm text-slate-500">Every module writes to the same database — dashboards and the AI read from it, so numbers always match.</p>
          </div>
          <div className="stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ icon: Icon, name, desc }) => (
              <div key={name} className="card group p-5 transition hover:-translate-y-1 hover:shadow-xl">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-[#f3d9ff] text-brand-600 transition group-hover:from-brand-600 group-hover:to-accent-violet group-hover:text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-slate-900">{name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ How it works ============ */}
      <div id="how" className="relative overflow-hidden bg-ink-900 py-16 text-white">
        <div className="animate-orb-slow absolute -right-24 top-0 h-72 w-72 rounded-full bg-brand-600/25 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-300">No dummy data</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight">You build it, in four steps</h2>
          </div>
          <div className="stagger mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: '01', t: 'Admin sets up', d: 'Company profile, office rules, geofence — first-run wizard.' },
              { n: '02', t: 'HR registers people', d: 'Employees get logins with temp passwords, CSV import optional.' },
              { n: '03', t: 'Daily work happens', d: 'Check-ins, leave requests, approvals, corrections.' },
              { n: '04', t: 'Payroll & insights', d: 'HR drafts, Admin locks, everyone reads dashboards + payslips.' },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <p className="bg-gradient-to-r from-brand-300 to-[#00cfe8] bg-clip-text text-2xl font-extrabold text-transparent">{s.n}</p>
                <h3 className="mt-2 text-sm font-bold">{s.t}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ============ Final CTA ============ */}
      <div className="bg-[#f8f5ff] py-16">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">
            {user ? 'Welcome back.' : initialized === false ? 'Start with a clean slate.' : 'Your workspace is waiting.'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            {user ? 'Pick up where you left off — your numbers are live.' : 'Set up in 30 seconds. No credit card, no email verification, no demo data.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {user ? (
              <GradientButton to="/dashboard" big>Open dashboard</GradientButton>
            ) : initialized === false ? (
              <GradientButton to="/setup" big>Set up your company</GradientButton>
            ) : (
              <GradientButton to="/login" big>Sign in</GradientButton>
            )}
          </div>
        </div>
      </div>

      {/* ============ Footer ============ */}
      <footer className="border-t border-purple-100 bg-white py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 text-xs text-slate-400 sm:flex-row sm:px-8">
          <span className="flex items-center gap-2 font-bold text-slate-600">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-500 text-[10px] font-black text-white">H</span>
            HCM Lite
          </span>
          <span>Saylani Hackathon · 24 October 2026 · Zaitoon Ashraf IT Park</span>
        </div>
      </footer>
    </div>
  );
}
