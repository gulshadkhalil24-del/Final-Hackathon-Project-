// Map database records to the exact shapes the frontend expects.
// Statuses are stored UPPER-CASE in the DB and sent lowercase to the UI.

const MONTH_FMT = (m, y) => `${y}-${String(m).padStart(2, '0')}`;

function percent(part, whole) {
  const w = Number(whole);
  if (!w) return 0;
  return Math.round((Number(part) / w) * 100);
}

function employeeFlat(e) {
  if (!e) return null;
  const salary = e.salary || {};
  const basic = Number(salary.basicSalary || 0);
  return {
    id: e.id,
    name: `${e.firstName} ${e.lastName}`.trim(),
    code: e.employeeCode,
    email: e.email,
    phone: e.phone || '',
    address: e.address || '',
    gender: String(e.gender || '').toLowerCase(),
    departmentId: e.departmentId,
    department: e.department ? { id: e.department.id, name: e.department.name } : null,
    designationId: e.designationId,
    designation: e.designation ? { id: e.designation.id, name: e.designation.title } : null,
    joinDate: String(e.joiningDate || '').slice(0, 10),
    exitDate: e.exitDate ? String(e.exitDate).slice(0, 10) : null,
    status: String(e.status || '').toLowerCase(),
    basicSalary: basic || undefined,
    hraPercent: basic ? percent(salary.hra, basic) : undefined,
    medicalPercent: basic ? percent(salary.medical, basic) : undefined,
    grossSalary: salary.grossSalary != null ? Number(salary.grossSalary) : undefined,
  };
}

function leaveFlat(l) {
  if (!l) return null;
  return {
    id: l.id,
    employeeId: l.employeeId,
    employeeName: l.employee ? `${l.employee.firstName} ${l.employee.lastName}` : undefined,
    department: l.employee?.department ? { id: l.employee.department.id, name: l.employee.department.name } : null,
    type: l.leaveType ? { id: l.leaveType.id, name: l.leaveType.name } : undefined,
    typeId: l.leaveTypeId,
    startDate: String(l.startDate || '').slice(0, 10),
    endDate: String(l.endDate || '').slice(0, 10),
    days: l.workingDaysCount,
    reason: l.reason,
    status: String(l.status || '').toLowerCase(),
    decisionComment: l.reviewComment || '',
    createdAt: l.createdAt,
  };
}

function attendanceFlat(a) {
  if (!a) return null;
  return {
    id: a.id,
    employeeId: a.employeeId,
    date: String(a.date || '').slice(0, 10),
    checkIn: a.checkIn,
    checkOut: a.checkOut,
    hours: a.workHours != null ? Number(a.workHours) : null,
    source: String(a.source || 'web').toLowerCase(),
    status: String(a.status || '').toLowerCase(),
  };
}

function correctionFlat(c) {
  if (!c) return null;
  const time = (d) => (d ? new Date(d).toTimeString().slice(0, 5) : null);
  return {
    id: c.id,
    employeeId: c.employeeId,
    employeeName: c.employee ? `${c.employee.firstName} ${c.employee.lastName}` : undefined,
    date: c.date ? String(c.date).slice(0, 10) : null,
    requestedCheckIn: time(c.requestedCheckIn),
    requestedCheckOut: time(c.requestedCheckOut),
    reason: c.reason,
    status: String(c.status || '').toLowerCase(),
    decisionComment: c.reviewComment || '',
    createdAt: c.createdAt,
  };
}

function payslipFlat(p) {
  if (!p) return null;
  return {
    id: p.id,
    employeeId: p.employeeId,
    employeeName: p.employeeName,
    department: p.department ? { id: p.department.id, name: p.department.name } : (p.departmentName || undefined),
    month: MONTH_FMT(p.month, p.year),
    workingDays: p.workingDays,
    absentDays: p.absentDays,
    unpaidDays: p.unpaidLeaveDays,
    halfDays: p.halfDays,
    gross: p.gross,
    tax: p.monthlyTax,
    net: p.netSalary,
    breakdown: {
      basic: p.basic,
      hra: p.hra,
      medical: p.medical,
      absentDeduction: Math.round((p.absentDays || 0) * (p.dailyRate || 0)),
      unpaidDeduction: Math.round((p.unpaidLeaveDays || 0) * (p.dailyRate || 0)),
      halfDayDeduction: Math.round((p.halfDays || 0) * 0.5 * (p.dailyRate || 0)),
    },
  };
}

function payrollRunFlat(r) {
  if (!r) return null;
  return {
    id: r.id,
    month: MONTH_FMT(r.month, r.year),
    status: String(r.status || '').toLowerCase(),
    employeeCount: r.payslips ? r.payslips.length : undefined,
    totalGross: r.totalGross,
    totalNet: r.totalNet,
    finalizedBy: r.finalizedBy || null,
    finalizedAt: r.finalizedAt || null,
    createdAt: r.createdAt,
  };
}

function announcementFlat(a) {
  if (!a) return null;
  return {
    id: a.id,
    title: a.title,
    body: a.message,
    authorName: a.postedBy,
    createdAt: a.createdAt,
  };
}

function notificationFlat(n) {
  if (!n) return null;
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    isRead: !!n.isRead,
    createdAt: n.createdAt,
  };
}

function auditFlat(l) {
  if (!l) return null;
  const parse = (s) => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return s; }
  };
  return {
    id: l.id,
    at: l.timestamp,
    actorName: l.actorName,
    actorRole: String(l.actorRole || '').toLowerCase(),
    action: String(l.action || '').toLowerCase(),
    entity: String(l.entityType || '').toLowerCase(),
    entityId: l.entityId,
    before: parse(l.beforeState),
    after: parse(l.afterState),
  };
}

module.exports = {
  employeeFlat,
  leaveFlat,
  attendanceFlat,
  correctionFlat,
  payslipFlat,
  payrollRunFlat,
  announcementFlat,
  notificationFlat,
  auditFlat,
  MONTH_FMT,
};
