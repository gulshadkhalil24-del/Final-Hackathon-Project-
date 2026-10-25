import { useEffect } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, X } from 'lucide-react';
import { cn, statusTone, humanize } from '../lib/utils';

export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} aria-label="Loading" />;
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-sm text-slate-500" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function Button({ variant = 'primary', size, loading, icon: Icon, children, className, ...props }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={cn('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, required, as: As = 'label', children, className }) {
  return (
    <As className={cn('block', className)}>
      {label && (
        <span className="label">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-red-600">
          {error}
        </span>
      )}
    </As>
  );
}

export function Input({ error, className, ...props }) {
  return <input {...props} className={cn('input', error && 'input-error', className)} />;
}

export function Select({ options = [], placeholder, error, className, ...props }) {
  return (
    <select {...props} className={cn('input', error && 'input-error', className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const opt = typeof o === 'object' ? o : { value: o, label: humanize(o) };
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        );
      })}
    </select>
  );
}

export function Textarea({ error, className, ...props }) {
  return <textarea rows={3} {...props} className={cn('input', error && 'input-error', className)} />;
}

export function Card({ title, subtitle, action, children, className, padded = true }) {
  return (
    <section className={cn('card', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-slate-800">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

const BADGE = {
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-700',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-sky-100 text-sky-800',
  violet: 'bg-violet-100 text-violet-800',
  slate: 'bg-slate-100 text-slate-700',
};
export function Badge({ tone = 'slate', children, className }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', BADGE[tone], className)}>
      {children}
    </span>
  );
}
export const StatusBadge = ({ status }) =>
  status ? <Badge tone={statusTone(status)}>{humanize(status)}</Badge> : <span className="text-slate-400">—</span>;

const STAT_TONES = {
  teal: 'text-brand-600',
  amber: 'text-accent-amber',
  violet: 'text-accent-violet',
  red: 'text-red-600',
  slate: 'text-slate-800',
};
export function StatCard({ label, value, hint, tone = 'teal', icon: Icon }) {
  return (
    <div className="card stat-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-50 to-[#f3d9ff] text-brand-600">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={cn('mt-1.5 text-2xl font-extrabold tabular-nums tracking-tight', STAT_TONES[tone])}>{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="empty-float mb-3 rounded-full bg-brand-50 p-3.5 text-brand-500">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center" role="alert">
      <div className="mb-3 rounded-full bg-red-50 p-3">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <p className="text-sm font-semibold text-slate-700">Could not load this data</p>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    ai: 'border-violet-200 bg-violet-50 text-violet-900',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? 'mt-0.5' : ''}>{children}</div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };
  return (
    <div className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('modal-in card flex max-h-[92vh] w-full flex-col rounded-b-none sm:rounded-b-xl', widths[size])}>
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, busy, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="bg-gradient-to-r from-slate-900 to-brand-700 bg-clip-text text-xl font-extrabold tracking-tight text-transparent dark:from-slate-100 dark:to-brand-300 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** columns: [{ key, header, render?(row), className? }] */
export function DataTable({ columns, rows, loading, error, onRetry, empty, onRowClick, rowKey = 'id' }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (loading && !rows?.length) return <PageLoader />;
  if (!rows?.length) return empty || <EmptyState />;
  return (
    <div className={cn('overflow-x-auto', loading && 'opacity-60')}>
      <table className="tbl">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.className}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} className={onRowClick ? 'tbl-row' : ''} onClick={onRowClick ? () => onRowClick(r) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.render ? c.render(r) : r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange }) {
  const pages = Math.max(1, Math.ceil((total || 0) / pageSize));
  if (!total || pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      {tabs.map((t) => {
        const tab = typeof t === 'object' ? t : { value: t, label: humanize(t) };
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition',
              active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value = 0, max = 100, tone = 'teal', className }) {
  const p = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const colors = { teal: 'bg-brand-500', amber: 'bg-accent-amber', violet: 'bg-accent-violet', red: 'bg-red-500' };
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', colors[tone])} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 'md' }) {
  const s = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-sm';
  const text = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((x) => x[0].toUpperCase())
    .join('');
  return <span className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700', s)}>{text || '?'}</span>;
}

export function FilterBar({ children }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}
