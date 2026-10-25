import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Check, Eye, EyeOff, Lock, Mail, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { api, errMsg, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { PASSWORD_HINT, isStrongPassword } from '../lib/utils';
import { Alert, Button, Field, Input, PageLoader } from '../components/ui.jsx';
import { useToast } from '../components/toast.jsx';

/* ===================== Shared shell ===================== */
const PREVIEW_BARS = [
  { h: 42, color: 'bg-brand-500/80', d: '0.15s' },
  { h: 66, color: 'bg-brand-400/70', d: '0.3s' },
  { h: 38, color: 'bg-[#00cfe8]/60', d: '0.45s' },
  { h: 78, color: 'bg-brand-500/80', d: '0.6s' },
  { h: 56, color: 'bg-accent-violet/70', d: '0.75s' },
  { h: 90, color: 'bg-brand-400/80', d: '0.9s' },
  { h: 48, color: 'bg-[#00cfe8]/50', d: '1.05s' },
];

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Showcase panel (desktop) */}
      <div className="relative hidden overflow-hidden bg-ink-900 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* Neon orbs */}
        <div className="animate-orb absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="animate-orb-slow absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-accent-violet/30 blur-3xl" />
        <div className="animate-glow absolute right-40 top-1/3 h-40 w-40 rounded-full bg-[#00cfe8]/20 blur-3xl" />
        <div className="auth-grid-bg absolute inset-0" />

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-lg font-black text-white shadow-[0_0_24px_rgba(176,38,255,.6)]">H</span>
          <div className="leading-tight">
            <p className="text-lg font-extrabold tracking-tight">HCM Lite</p>
            <p className="text-[11px] font-medium text-slate-400">AI-assisted Human Capital Management</p>
          </div>
        </div>

        {/* Pitch */}
        <div className="relative max-w-lg">
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-brand-100">
            <Sparkles className="h-3 w-3" /> Saylani Hackathon 2026
          </span>
          <h2 className="text-[2.6rem] font-extrabold leading-[1.1] tracking-tight">
            HR that runs itself,{' '}
            <span className="bg-gradient-to-r from-[#d8b4fe] via-[#b026ff] to-[#00cfe8] bg-clip-text text-transparent">from check-in to payslip.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
            Employees, attendance, leave and payroll in one place — with an assistant that answers from your real data, not guesses.
          </p>

          {/* Mini live app preview */}
          <div className="mt-8 w-full max-w-md rounded-xl border border-white/10 bg-white/[0.04] p-3 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-1.5 px-1">
              <span className="h-2 w-2 rounded-full bg-red-400/70" />
              <span className="h-2 w-2 rounded-full bg-amber-300/70" />
              <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
              <span className="ml-2 text-[10px] font-semibold tracking-wide text-slate-500">hcm-lite · dashboard</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[['Present', '42'], ['On leave', '5'], ['Late', '3']].map(([label, val]) => (
                <div key={label} className="rounded-lg border border-white/5 bg-white/[0.04] px-2.5 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="text-base font-extrabold text-brand-200">{val}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex h-20 items-end gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              {PREVIEW_BARS.map((b, i) => (
                <div key={i} className={`preview-bar flex-1 rounded-sm ${b.color}`} style={{ height: `${b.h}%`, animationDelay: b.d }} />
              ))}
            </div>
          </div>
        </div>

        {/* Footer chips */}
        <div className="relative flex flex-wrap items-center gap-2 text-[11px] font-semibold">
          {['25 functionalities', '9 modules', '3 roles', 'Starts empty — you create the data'].map((c) => (
            <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">{c}</span>
          ))}
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center bg-[#f8f5ff] p-6 dark:bg-transparent sm:p-10">
        <div className="page-enter w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 font-black text-white shadow-[0_0_20px_rgba(176,38,255,.5)]">H</span>
            <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100">HCM Lite</span>
          </div>

          <div className="auth-glass rounded-2xl p-6 sm:p-7">
            <h1 className="text-[1.6rem] font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            <p className="mb-6 mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{subtitle}</p>
            {children}
          </div>
          {footer && <div className="mt-7 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/* ===================== Inputs ===================== */
function IconInput({ icon: Icon, error, autoComplete, placeholder, type = 'text', value, onChange, disabled }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        type={type}
        value={value}
        onChange={onChange}
        error={error}
        disabled={disabled}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="py-2.5 pl-10 pr-4"
      />
    </div>
  );
}

function PasswordInput({ value, onChange, error, autoComplete, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        error={error}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        className="py-2.5 pl-10 pr-11"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-brand-600"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function PasswordChecks({ value }) {
  const checks = [
    { ok: (value || '').length >= 8, label: '8+ characters' },
    { ok: /[A-Za-z]/.test(value || ''), label: 'A letter' },
    { ok: /\d/.test(value || ''), label: 'A number' },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const meterColor = passed === 0 ? 'bg-slate-300' : passed === 1 ? 'bg-red-400' : passed === 2 ? 'bg-amber-400' : 'bg-emerald-500';
  const meterLabel = passed === 0 ? '' : passed === 1 ? 'Weak' : passed === 2 ? 'Getting there' : 'Strong';
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-[#2c1a44]">
        <div className={`h-full rounded-full transition-all duration-300 ${meterColor}`} style={{ width: `${(passed / 3) * 100}%` }} />
      </div>
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-1.5 text-xs font-medium transition ${c.ok ? 'text-emerald-600' : 'text-slate-400'}`}>
            {c.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {c.label}
          </li>
        ))}
        {passed > 0 && <li className="ml-auto text-xs font-bold text-slate-500">{meterLabel}</li>}
      </ul>
    </div>
  );
}

/* ===================== First-run setup (#01) ===================== */
export function SetupPage() {
  const { initialized, refreshSetup, setupError } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ companyName: '', adminName: '', adminEmail: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (initialized === null && !setupError) return <PageLoader label="Checking setup…" />;
  if (initialized) return <Navigate to="/login" replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!f.companyName.trim()) errs.companyName = 'Company name is required.';
    if (!f.adminName.trim()) errs.adminName = 'Admin name is required.';
    if (!/^\S+@\S+\.\S+$/.test(f.adminEmail)) errs.adminEmail = 'Enter a valid email.';
    if (!isStrongPassword(f.password)) errs.password = PASSWORD_HINT;
    if (f.password !== f.confirm) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.post('/setup', { companyName: f.companyName.trim(), adminName: f.adminName.trim(), adminEmail: f.adminEmail.trim(), password: f.password });
      await refreshSetup();
      toast.success('Company created. Sign in with your Admin account.');
      navigate('/login');
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Set up your company" subtitle="First run: create the company and the Admin account. HR logins and employees come next — everything is built inside the app.">
      <form onSubmit={submit} className="auth-stagger space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}

        <Field label="Company name" required error={errors.companyName}>
          <IconInput icon={BarChart3} placeholder="e.g. Acme Ltd" value={f.companyName} onChange={set('companyName')} error={!!errors.companyName} />
        </Field>
        <Field label="Admin name" required error={errors.adminName}>
          <IconInput icon={Users} placeholder="Your full name" autoComplete="name" value={f.adminName} onChange={set('adminName')} error={!!errors.adminName} />
        </Field>
        <Field label="Admin email" required error={errors.adminEmail}>
          <IconInput icon={Mail} type="email" placeholder="admin@company.com" autoComplete="email" value={f.adminEmail} onChange={set('adminEmail')} error={!!errors.adminEmail} />
        </Field>
        <Field label="Password" required error={errors.password} hint={PASSWORD_HINT}>
          <PasswordInput placeholder="Create a strong password" value={f.password} onChange={set('password')} error={!!errors.password} autoComplete="new-password" />
          <PasswordChecks value={f.password} />
        </Field>
        <Field label="Confirm password" required error={errors.confirm}>
          <PasswordInput placeholder="Repeat the password" value={f.confirm} onChange={set('confirm')} error={!!errors.confirm} autoComplete="new-password" />
        </Field>

        <Button type="submit" loading={busy} className="w-full !py-2.5 text-base" icon={ShieldCheck}>
          Create company
        </Button>
        <p className="text-center text-xs text-slate-400">Takes 30 seconds. No email verification, no setup wizard.</p>
      </form>
    </AuthShell>
  );
}

/* ===================== Login (#02) ===================== */
export function LoginPage() {
  const { user, login, initialized } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (initialized === false) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : '/dashboard'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await login(email.trim(), password);
      navigate(u.mustChangePassword ? '/change-password' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.status === 401 ? 'Incorrect email or password.' : err.status === 403 ? 'This account is deactivated. Contact your Admin.' : errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your HCM Lite workspace."
      footer={
        <div className="space-y-2">
          <div className="text-xs">Forgot your password? Ask your Admin or HR to reset it.</div>
          <Link to="/" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">← Back to home</Link>
        </div>
      }
    >
      <form onSubmit={submit} className="auth-stagger space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Email">
          <IconInput icon={Mail} type="email" placeholder="you@company.com" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <PasswordInput placeholder="Your password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <label className="flex select-none items-center gap-2 text-xs font-medium text-slate-500">
          <input type="checkbox" defaultChecked className="h-3.5 w-3.5 rounded border-purple-300 accent-[#b026ff]" />
          Keep me signed in on this device
        </label>
        <Button type="submit" loading={busy} className="w-full !py-2.5 text-base">
          Sign in <ArrowRight className="h-4 w-4" />
        </Button>
        <p className="text-center text-[11px] font-medium text-slate-400">
          Press <kbd>Enter</kbd> ⏎ to continue
        </p>
      </form>

      <div className="my-7 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        <span className="h-px flex-1 bg-purple-200 dark:bg-[#2c1a44]" /> or <span className="h-px flex-1 bg-purple-200 dark:bg-[#2c1a44]" />
      </div>

      <div className="rounded-xl border border-purple-200/70 bg-white/70 p-4 text-xs leading-relaxed text-slate-500 dark:bg-white/5 dark:text-slate-400">
        <p className="mb-1.5 font-bold text-slate-700 dark:text-slate-200">First time here?</p>
        The first account is created by the first-run setup — no logins exist until then. HR and employee logins are created inside the app by Admin and HR.
      </div>
    </AuthShell>
  );
}

/* ===================== Change password (#02) ===================== */
export function ChangePasswordPage() {
  const { user, reloadUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const forced = user?.mustChangePassword;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!f.currentPassword) errs.currentPassword = 'Enter your current (temporary) password.';
    if (!isStrongPassword(f.newPassword)) errs.newPassword = PASSWORD_HINT;
    if (f.newPassword === f.currentPassword) errs.newPassword = 'Choose a different password.';
    if (f.newPassword !== f.confirm) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword });
      await reloadUser();
      toast.success('Password changed.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={forced ? 'Choose a new password' : 'Change password'}
      subtitle={forced ? 'You signed in with a temporary password. Set your own before continuing.' : 'Use a strong password you do not use elsewhere.'}
      footer={
        forced ? (
          <button className="font-semibold text-brand-700 hover:underline" onClick={async () => { await logout(); navigate('/login'); }}>Sign out instead</button>
        ) : (
          <Link to="/dashboard" className="font-semibold text-brand-700 hover:underline">Back to dashboard</Link>
        )
      }
    >
      <form onSubmit={submit} className="auth-stagger space-y-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="Current password" error={errors.currentPassword}>
          <PasswordInput placeholder="Current or temporary password" autoComplete="current-password" value={f.currentPassword} onChange={set('currentPassword')} error={!!errors.currentPassword} />
        </Field>
        <Field label="New password" error={errors.newPassword} hint={PASSWORD_HINT}>
          <PasswordInput placeholder="New password" autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} error={!!errors.newPassword} />
          <PasswordChecks value={f.newPassword} />
        </Field>
        <Field label="Confirm new password" error={errors.confirm}>
          <PasswordInput placeholder="Repeat the new password" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} error={!!errors.confirm} />
        </Field>
        <Button type="submit" loading={busy} className="w-full !py-2.5 text-base">
          Save password
        </Button>
      </form>
    </AuthShell>
  );
}
