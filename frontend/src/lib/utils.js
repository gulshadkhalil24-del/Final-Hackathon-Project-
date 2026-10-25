export const cn = (...a) => a.filter(Boolean).join(' ');

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const monthISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const monthStartISO = (d = new Date()) => `${monthISO(d)}-01`;
export const daysInMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
};
export const shiftMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  return monthISO(new Date(y, m - 1 + delta, 1));
};

export function fmtDate(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return `${fmtDate(d)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
export function fmtTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return String(v).slice(0, 5);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export function monthLabel(ym) {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function fmtMoney(n, { compact = false } = {}) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (compact && Math.abs(v) >= 1000) {
    return `PKR ${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)}`;
  }
  return `PKR ${Math.round(v).toLocaleString('en-US')}`;
}
export const fmtNum = (n) => (isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '—');
export const pct = (n) => (isFinite(Number(n)) ? `${Number(n).toFixed(1)}%` : '—');
export const hours = (n) => (isFinite(Number(n)) ? `${Number(n).toFixed(1)} h` : '—');

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('') || '?';

/** Backends return either a plain array or { items, total }. */
export const asList = (r) => (Array.isArray(r) ? r : r?.items ?? r?.data ?? r?.rows ?? []);
export const asTotal = (r) => (Array.isArray(r) ? r.length : r?.total ?? asList(r).length);

export const humanize = (s = '') => String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const TONES = {
  present: 'green',
  late: 'amber',
  absent: 'red',
  half_day: 'violet',
  on_leave: 'blue',
  missing_checkout: 'amber',
  holiday: 'slate',
  weekend: 'slate',
  approved: 'green',
  rejected: 'red',
  pending: 'amber',
  cancelled: 'slate',
  draft: 'amber',
  finalized: 'green',
  active: 'green',
  probation: 'blue',
  inactive: 'slate',
  exited: 'slate',
};
export const statusTone = (s) => TONES[String(s || '').toLowerCase()] || 'slate';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const GENDERS = ['male', 'female', 'other'];
export const EMPLOYEE_STATUSES = ['active', 'probation', 'inactive', 'exited'];

export const deptName = (e) => e?.department?.name || e?.departmentName || e?.department || '—';
export const desigName = (e) => e?.designation?.name || e?.designationName || e?.designation || '—';

export function isStrongPassword(p) {
  return typeof p === 'string' && p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
}
export const PASSWORD_HINT = 'At least 8 characters with a letter and a number.';
