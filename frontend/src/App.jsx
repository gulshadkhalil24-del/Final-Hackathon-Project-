import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import Layout from './components/Layout.jsx';
import { Button, ErrorState, PageLoader } from './components/ui.jsx';
import { ChangePasswordPage, LoginPage, SetupPage } from './pages/AuthPages.jsx';
import { AdminDashboard, EmployeeDashboard, HRDashboard } from './pages/Dashboards.jsx';
import { OrgPage, SettingsPage, UsersPage } from './pages/OrgPages.jsx';
import { Employee360Page, EmployeeFormPage, EmployeesPage, ImportPage } from './pages/EmployeePages.jsx';
import { AttendanceBoardPage, CorrectionsPage, MyAttendancePage } from './pages/AttendancePages.jsx';
import { LeaveRequestsPage, MyLeavePage } from './pages/LeavePages.jsx';
import { PayrollPage, PayrollRunPage, PayslipsPage } from './pages/PayrollPages.jsx';
import { AnnouncementsPage, AuditLogPage, NotificationsPage } from './pages/CommsPages.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import LandingPage from './pages/LandingPage.jsx';

/** Server-side RBAC is the real guard. These route guards only keep the UI tidy. */
function Guard({ roles, children }) {
  const { user } = useAuth();
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <h1 className="text-xl font-extrabold text-slate-900">No access</h1>
        <p className="mt-2 text-sm text-slate-500">Your role does not have permission to open this page.</p>
        <Link to="/dashboard"><Button className="mt-5">Go to dashboard</Button></Link>
      </div>
    );
  }
  return children;
}

function Protected() {
  const { user, loading, initialized, setupError, refreshSetup } = useAuth();
  if (setupError && initialized === null) return <div className="p-8"><ErrorState error={setupError} onRetry={refreshSetup} /></div>;
  if (loading || initialized === null) return <PageLoader />;
  if (initialized === false) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <Layout />;
}

function DashboardSwitch() {
  const { user } = useAuth();
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'hr') return <HRDashboard />;
  return <EmployeeDashboard />;
}

function ChangePasswordRoute() {
  const { user, loading, initialized } = useAuth();
  if (loading || initialized === null) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <ChangePasswordPage />;
}

const ADMIN = ['admin'];
const HR = ['hr'];
const STAFF = ['admin', 'hr'];
const EMP = ['employee'];

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordRoute />} />

      <Route element={<Protected />}>
        <Route path="/dashboard" element={<DashboardSwitch />} />

        {/* Company setup: Admin manages, HR views */}
        <Route path="/settings" element={<Guard roles={STAFF}><SettingsPage /></Guard>} />
        <Route path="/org" element={<Guard roles={STAFF}><OrgPage /></Guard>} />
        <Route path="/users" element={<Guard roles={ADMIN}><UsersPage /></Guard>} />

        {/* Employees: HR manages, Admin views */}
        <Route path="/employees" element={<Guard roles={STAFF}><EmployeesPage /></Guard>} />
        <Route path="/employees/new" element={<Guard roles={HR}><EmployeeFormPage /></Guard>} />
        <Route path="/employees/import" element={<Guard roles={HR}><ImportPage /></Guard>} />
        <Route path="/employees/:id" element={<Guard roles={STAFF}><Employee360Page /></Guard>} />
        <Route path="/employees/:id/edit" element={<Guard roles={HR}><EmployeeFormPage /></Guard>} />

        {/* Attendance */}
        <Route path="/attendance" element={<Guard roles={EMP}><MyAttendancePage /></Guard>} />
        <Route path="/attendance/board" element={<Guard roles={STAFF}><AttendanceBoardPage /></Guard>} />
        <Route path="/attendance/corrections" element={<Guard roles={STAFF}><CorrectionsPage /></Guard>} />

        {/* Leave */}
        <Route path="/leave" element={<Guard roles={EMP}><MyLeavePage /></Guard>} />
        <Route path="/leave/requests" element={<Guard roles={STAFF}><LeaveRequestsPage /></Guard>} />

        {/* Payroll */}
        <Route path="/payroll" element={<Guard roles={STAFF}><PayrollPage /></Guard>} />
        <Route path="/payroll/:id" element={<Guard roles={STAFF}><PayrollRunPage /></Guard>} />
        <Route path="/payslips" element={<Guard roles={EMP}><PayslipsPage /></Guard>} />

        {/* Comms & audit */}
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/audit" element={<Guard roles={ADMIN}><AuditLogPage /></Guard>} />
        <Route path="/profile" element={<Guard roles={EMP}><ProfilePage /></Guard>} />

        <Route path="*" element={<div className="card mx-auto mt-10 max-w-md p-8 text-center"><h1 className="text-xl font-extrabold">Page not found</h1><Link to="/dashboard"><Button className="mt-5">Go to dashboard</Button></Link></div>} />
      </Route>
    </Routes>
  );
}
