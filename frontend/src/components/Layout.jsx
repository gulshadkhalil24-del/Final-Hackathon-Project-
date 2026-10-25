import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Banknote, Bell, Building2, CalendarCheck, CalendarDays, ClipboardCheck, LayoutDashboard, LogOut, Megaphone,
  Menu, Moon, ScrollText, Settings, Sun, UserCircle, UserCog, Users, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import { cn, humanize } from '../lib/utils';
import { Avatar } from './ui.jsx';
import AIChat from './AIChat.jsx';

const MENUS = {
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/employees', label: 'Employees', icon: Users },
    { to: '/attendance/board', label: 'Attendance', icon: CalendarCheck },
    { to: '/leave/requests', label: 'Leave requests', icon: CalendarDays },
    { to: '/payroll', label: 'Payroll', icon: Banknote },
    { to: '/settings', label: 'Company settings', icon: Settings },
    { to: '/org', label: 'Organization', icon: Building2 },
    { to: '/users', label: 'Logins', icon: UserCog },
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
    { to: '/audit', label: 'Audit log', icon: ScrollText },
  ],
  hr: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/employees', label: 'Employees', icon: Users },
    { to: '/attendance/board', label: 'Attendance board', icon: CalendarCheck },
    { to: '/attendance/corrections', label: 'Corrections', icon: ClipboardCheck },
    { to: '/leave/requests', label: 'Leave inbox', icon: CalendarDays },
    { to: '/payroll', label: 'Payroll', icon: Banknote },
    { to: '/settings', label: 'Company settings', icon: Settings },
    { to: '/org', label: 'Organization', icon: Building2 },
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
  employee: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/attendance', label: 'My attendance', icon: CalendarCheck },
    { to: '/leave', label: 'My leave', icon: CalendarDays },
    { to: '/payslips', label: 'Payslips', icon: Banknote },
    { to: '/profile', label: 'My profile', icon: UserCircle },
    { to: '/announcements', label: 'Announcements', icon: Megaphone },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [unread, setUnread] = useState(0);
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const menu = MENUS[user.role] || [];

  useEffect(() => setDrawer(false), [location.pathname]);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      api
        .get('/notifications/unread-count')
        .then((r) => alive && setUnread(r.count ?? 0))
        .catch(() => {});
    poll();
    const t = setInterval(poll, 60000);
    const onRead = () => poll();
    window.addEventListener('hcm:notifications-changed', onRead);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener('hcm:notifications-changed', onRead);
    };
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('hcm_theme', next ? 'dark' : 'light');
    setDark(next);
  };

  const nav = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
      {menu.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/attendance' || to === '/leave' || to === '/dashboard'}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'
            )
          }
        >
          <Icon className="h-[18px] w-[18px]" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-5 py-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent-violet text-sm font-black text-white shadow-[0_0_18px_rgba(176,38,255,.55)]">H</span>
      <div className="leading-tight">
        <p className="text-sm font-extrabold text-white">HCM Lite</p>
        <p className="text-[11px] text-slate-400">AI-assisted HR</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="no-print hidden w-64 shrink-0 flex-col bg-ink-900 lg:fixed lg:inset-y-0 lg:flex">
        {brand}
        {nav}
        <p className="px-5 py-3 text-[11px] text-slate-500">Saylani Hackathon 2026</p>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-ink-900">
            <button onClick={() => setDrawer(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded p-1 text-slate-300 hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
            {brand}
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <button onClick={toggleTheme} aria-label="Toggle dark mode" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <NavLink to="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </NavLink>
          <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          <div className="flex items-center gap-2.5">
            <Avatar name={user.name || user.email} size="sm" />
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-semibold text-slate-800">{user.name || user.email}</p>
              <p className="text-[11px] text-slate-500">{humanize(user.role)}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            aria-label="Sign out"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <div key={location.pathname} className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>

      <AIChat />
    </div>
  );
}
