const express = require('express');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { calculateWorkingDays } = require('../utils/calculations');
const { auditFlat } = require('../utils/serializers');

const router = express.Router();

async function scopeEmployees(deptId) {
  return prisma.employee.findMany({
    where: {
      status: { in: ['ACTIVE', 'PROBATION'] },
      ...(deptId && deptId !== 'ALL' ? { departmentId: deptId } : {}),
    },
    include: { department: true, salary: true },
  });
}

function workingDaysBetween(from, to, weekend, holidays) {
  return calculateWorkingDays(from, to, weekend, holidays);
}

/* ===================== Admin (#18) ===================== */
router.get('/admin', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { from, to, dept } = req.query;
    const employees = await scopeEmployees(dept);

    const headcount = employees.length;
    const exited = await prisma.employee.count({ where: { status: 'EXITED', ...(dept && dept !== 'ALL' ? { departmentId: dept } : {}) } });
    const avgHeadcount = Math.max(1, headcount + exited / 2);
    const attritionYtd = Math.round((exited / avgHeadcount) * 1000) / 10;

    // Payroll cost from the latest finalized run (per-department split)
    const latestRun = await prisma.payrollRun.findFirst({
      where: { status: 'FINALIZED' },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { payslips: true },
    });
    const payrollCost = latestRun?.totalNet ?? employees.reduce((s, e) => s + (e.salary?.grossSalary || 0), 0);
    const avgSalary = headcount ? Math.round(employees.reduce((s, e) => s + (e.salary?.grossSalary || 0), 0) / headcount) : 0;

    // Headcount by department
    const byDept = new Map();
    for (const e of employees) {
      const name = e.department?.name || 'Unassigned';
      byDept.set(name, (byDept.get(name) || 0) + 1);
    }
    const headcountByDept = [...byDept.entries()].map(([department, count]) => ({ department, count }));

    // Payroll cost by department (latest finalized run if present, else salary structures)
    const payrollCostByDept = new Map();
    if (latestRun) {
      for (const p of latestRun.payslips) {
        const emp = employees.find((e) => e.id === p.employeeId);
        if (dept && dept !== 'ALL' && !emp) continue;
        const entry = payrollCostByDept.get(p.departmentName || emp?.department?.name || '—') || { gross: 0, net: 0 };
        entry.gross += p.gross;
        entry.net += p.netSalary;
        payrollCostByDept.set(p.departmentName || emp?.department?.name || '—', entry);
      }
    } else {
      for (const e of employees) {
        const name = e.department?.name || 'Unassigned';
        const entry = payrollCostByDept.get(name) || { gross: 0, net: 0 };
        entry.gross += e.salary?.grossSalary || 0;
        entry.net += e.salary?.grossSalary || 0;
        payrollCostByDept.set(name, entry);
      }
    }
    const payrollByDept = [...payrollCostByDept.entries()].map(([department, v]) => ({ department, gross: Math.round(v.gross), net: Math.round(v.net) }));

    // Gender split
    const genderMap = new Map();
    for (const e of employees) {
      const label = String(e.gender || 'other').toLowerCase();
      genderMap.set(label, (genderMap.get(label) || 0) + 1);
    }
    const gender = [...genderMap.entries()].map(([label, count]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), count }));

    // Tenure buckets
    const now = new Date();
    const buckets = { '< 1 yr': 0, '1–3 yrs': 0, '3–5 yrs': 0, '5+ yrs': 0 };
    for (const e of employees) {
      const years = (now - new Date(e.joiningDate)) / (365.25 * 24 * 3600 * 1000);
      if (years < 1) buckets['< 1 yr']++;
      else if (years < 3) buckets['1–3 yrs']++;
      else if (years < 5) buckets['3–5 yrs']++;
      else buckets['5+ yrs']++;
    }
    const tenure = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

    // Audit feed
    const audit = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' }, take: 8 });

    return res.json({
      success: true,
      kpis: { headcount, attritionYtd, payrollCost, avgSalary },
      headcountByDept,
      payrollCostByDept: payrollByDept,
      gender,
      tenure,
      auditFeed: audit.map(auditFlat),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== HR (#18) ===================== */
router.get('/hr', authGuard, requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const { from, to, dept } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = String(from || today.slice(0, 8) + '01');
    const toDate = String(to || today);

    const setting = await prisma.setting.findFirst();
    let weekend = [0, 6];
    try { weekend = JSON.parse(setting?.weekendDays || '[0,6]'); } catch { /* default */ }

    const employees = await scopeEmployees(dept);
    const empIds = employees.map((e) => e.id);
    const headcount = employees.length;

    // Today's snapshot
    const todayRecords = await prisma.attendance.findMany({ where: { date: today, employeeId: { in: empIds } } });
    const present = todayRecords.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).length;
    const lateToday = todayRecords.filter((a) => a.status === 'LATE').length;
    const onLeave = await prisma.leaveRequest.count({
      where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today }, employeeId: { in: empIds } },
    });

    const pendingLeaves = await prisma.leaveRequest.count({ where: { status: 'PENDING', employeeId: { in: empIds } } });
    const pendingCorrections = await prisma.attendanceCorrection.count({ where: { status: 'PENDING', employeeId: { in: empIds } } });

    // Range data
    const rangeRecords = await prisma.attendance.findMany({ where: { date: { gte: fromDate, lte: toDate }, employeeId: { in: empIds } } });
    const holidays = (await prisma.publicHoliday.findMany()).map((h) => h.date);

    // Attendance trend by day
    const trend = new Map();
    for (let d = new Date(fromDate); d <= new Date(toDate); d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      if (weekend.includes(d.getDay()) || holidays.includes(iso)) continue;
      const dayRecords = rangeRecords.filter((a) => a.date === iso);
      const good = dayRecords.filter((a) => ['PRESENT', 'LATE', 'MISSING_CHECKOUT'].includes(a.status)).length + 0.5 * dayRecords.filter((a) => a.status === 'HALF_DAY').length;
      trend.set(iso, headcount > 0 ? Math.round((good / headcount) * 100) : 0);
    }
    const attendanceTrend = [...trend.entries()].map(([date, rate]) => ({ date, rate }));

    // Absenteeism by department
    const expectedDays = workingDaysBetween(fromDate, toDate, weekend, holidays);
    const deptMap = new Map(employees.map((e) => [e.id, e.department?.name || '—']));
    const absByDept = new Map();
    for (const e of employees) {
      absByDept.set(e.id, { department: deptMap.get(e.id), absent: 0 });
    }
    const approvedLeaveInRange = await prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', employeeId: { in: empIds }, startDate: { lte: toDate }, endDate: { gte: fromDate } },
    });
    for (const e of employees) {
      const rec = absByDept.get(e.id);
      const presentDays = rangeRecords.filter((a) => a.employeeId === e.id && ['PRESENT', 'LATE', 'HALF_DAY', 'MISSING_CHECKOUT'].includes(a.status)).length;
      const leaveDays = approvedLeaveInRange.filter((l) => l.employeeId === e.id).reduce((s, l) => s + l.workingDaysCount, 0);
      rec.absent = Math.max(0, expectedDays - presentDays - leaveDays);
    }
    const deptAgg = new Map();
    for (const rec of absByDept.values()) {
      const entry = deptAgg.get(rec.department) || { department: rec.department, absent: 0, count: 0 };
      entry.absent += rec.absent;
      entry.count += 1;
      deptAgg.set(rec.department, entry);
    }
    const absenteeismByDept = [...deptAgg.values()].map((d) => ({
      department: d.department,
      rate: expectedDays * d.count > 0 ? Math.round((d.absent / (expectedDays * d.count)) * 1000) / 10 : 0,
    }));

    // Leave by type (approved days in range)
    const leaveByTypeMap = new Map();
    for (const l of approvedLeaveInRange) {
      const t = l.leaveTypeId;
      let name = 'Other';
      const lt = await prisma.leaveType.findUnique({ where: { id: t } });
      if (lt) name = lt.name;
      leaveByTypeMap.set(name, (leaveByTypeMap.get(name) || 0) + l.workingDaysCount);
    }
    const leaveByType = [...leaveByTypeMap.entries()].map(([type, days]) => ({ type, days }));

    // Top 5 late-comers
    const lateCounts = new Map();
    for (const a of rangeRecords.filter((r) => r.status === 'LATE')) {
      const entry = lateCounts.get(a.employeeId) || { employeeId: a.employeeId, name: '', department: deptMap.get(a.employeeId), count: 0 };
      entry.count++;
      lateCounts.set(a.employeeId, entry);
    }
    const names = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
    const topLateComers = [...lateCounts.values()]
      .map((x) => ({ ...x, name: names.get(x.employeeId) || '—' }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return res.json({
      success: true,
      kpis: { headcount, present, onLeave, lateToday, pendingApprovals: pendingLeaves + pendingCorrections },
      attendanceTrend,
      absenteeismByDept,
      leaveByType,
      topLateComers,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Employee (#18) ===================== */
router.get('/employee', authGuard, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(404).json({ success: false, error: 'No employee profile linked to this account.' });

    const today = new Date().toISOString().slice(0, 10);
    const monthStr = today.slice(0, 7);

    // Hours this week (Mon–today)
    const day = new Date().getDay();
    const monday = new Date();
    monday.setDate(monday.getDate() - ((day + 6) % 7));
    const mondayIso = monday.toISOString().slice(0, 10);
    const weekRecords = await prisma.attendance.findMany({ where: { employeeId, date: { gte: mondayIso, lte: today } } });
    const hoursThisWeek = Math.round(weekRecords.reduce((s, a) => s + (a.workHours || 0), 0) * 10) / 10;

    const monthRecords = await prisma.attendance.findMany({ where: { employeeId, date: { startsWith: monthStr } } });
    const lateCount = monthRecords.filter((a) => a.status === 'LATE').length;

    const leaveTypes = await prisma.leaveType.findMany();
    const approved = await prisma.leaveRequest.findMany({ where: { employeeId, status: 'APPROVED' } });
    const leaveBalance = leaveTypes.map((lt) => {
      const used = approved.filter((l) => l.leaveTypeId === lt.id).reduce((s, l) => s + l.workingDaysCount, 0);
      const unlimited = lt.yearlyQuota <= 0;
      return { type: lt.name, quota: lt.yearlyQuota, used, remaining: unlimited ? null : Math.max(0, lt.yearlyQuota - used), unlimited };
    });

    const lastPayslipRow = await prisma.payslip.findFirst({
      where: { employeeId, payrollRun: { status: 'FINALIZED' } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    const lastPayslip = lastPayslipRow
      ? { id: lastPayslipRow.id, month: `${lastPayslipRow.year}-${String(lastPayslipRow.month).padStart(2, '0')}`, net: lastPayslipRow.netSalary }
      : null;

    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });

    return res.json({
      success: true,
      hoursThisWeek,
      lateCount,
      lastPayslip,
      leaveBalance,
      announcements: announcements.map((a) => ({ id: a.id, title: a.title, body: a.message, createdAt: a.createdAt })),
      weeklyTarget: 40,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
