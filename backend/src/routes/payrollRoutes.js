const express = require('express');
const PDFDocument = require('pdfkit');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');
const { computeEmployeePayroll, calculateWorkingDays } = require('../utils/calculations');
const { payslipFlat, payrollRunFlat } = require('../utils/serializers');

const router = express.Router();

/* ---------- shared draft builder (Rule M6) ---------- */
async function buildDraft(runId, month, year, actorName) {
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const setting = await prisma.setting.findFirst();
  let weekend = [0, 6];
  try { weekend = JSON.parse(setting?.weekendDays || '[0,6]'); } catch { /* default */ }
  const holidays = (await prisma.publicHoliday.findMany({ where: { date: { startsWith: monthStr } } })).map((h) => h.date);
  const totalWorkingDays = calculateWorkingDays(`${monthStr}-01`, `${monthStr}-28`, weekend, holidays) || 22;

  const employees = await prisma.employee.findMany({
    where: { status: { in: ['ACTIVE', 'PROBATION'] } },
    include: { salary: true, department: true },
  });

  const rows = [];
  for (const emp of employees) {
    const attendance = await prisma.attendance.findMany({ where: { employeeId: emp.id, date: { startsWith: monthStr } } });
    const presentDays = attendance.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).length;
    const halfDays = attendance.filter((a) => a.status === 'HALF_DAY').length;
    const lateCount = attendance.filter((a) => a.status === 'LATE').length;

    const leaves = await prisma.leaveRequest.findMany({
      where: { employeeId: emp.id, status: 'APPROVED', startDate: { startsWith: monthStr } },
      include: { leaveType: true },
    });
    const unpaidLeaveDays = leaves.filter((l) => l.leaveType.isPaid === false).reduce((s, l) => s + l.workingDaysCount, 0);
    const paidLeaveDays = leaves.filter((l) => l.leaveType.isPaid !== false).reduce((s, l) => s + l.workingDaysCount, 0);

    const accounted = presentDays + halfDays + paidLeaveDays + unpaidLeaveDays;
    const absentDays = Math.max(0, totalWorkingDays - accounted);

    // Prorate joiners/leavers on the calendar of that month
    const [y, m] = monthStr.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    let prorated = null;
    if (String(emp.joiningDate).startsWith(monthStr)) {
      prorated = calculateWorkingDays(String(emp.joiningDate).slice(0, 10), `${monthStr}-${daysInMonth}`, weekend, holidays);
    }

    const calc = computeEmployeePayroll({
      basicSalary: emp.salary?.basicSalary || 0,
      totalWorkingDaysInMonth: totalWorkingDays,
      absentDays,
      unpaidLeaveDays,
      halfDays,
      lateCount,
      proratedDays: prorated,
    });

    rows.push({
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeCode,
      departmentId: emp.departmentId,
      departmentName: emp.department?.name || '',
      month: Number(month),
      year: Number(year),
      presentDays,
      ...calc,
    });
  }

  const totalGross = rows.reduce((s, p) => s + p.gross, 0);
  const totalDeductions = rows.reduce((s, p) => s + p.attendanceDeduction, 0);
  const totalTax = rows.reduce((s, p) => s + p.monthlyTax, 0);
  const totalNet = rows.reduce((s, p) => s + p.netSalary, 0);

  return prisma.$transaction(async (tx) => {
    if (runId) {
      // Update in place so links to /payroll/:id keep working after recalculation
      await tx.payslip.deleteMany({ where: { payrollRunId: runId } });
      await tx.payrollRun.update({
        where: { id: runId },
        data: { status: 'DRAFT', totalGross, totalDeductions, totalTax, totalNet, createdBy: actorName },
      });
      for (const ps of rows) {
        await tx.payslip.create({ data: { payrollRunId: runId, ...ps } });
      }
      return tx.payrollRun.findUnique({ where: { id: runId }, include: { payslips: true } });
    }

    const run = await tx.payrollRun.create({
      data: { month: Number(month), year: Number(year), status: 'DRAFT', totalGross, totalDeductions, totalTax, totalNet, createdBy: actorName },
    });
    for (const ps of rows) {
      await tx.payslip.create({ data: { payrollRunId: run.id, ...ps } });
    }
    return tx.payrollRun.findUnique({ where: { id: run.id }, include: { payslips: true } });
  });
}

/* ===================== Runs list (#15) ===================== */
router.get('/runs', authGuard, requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const runs = await prisma.payrollRun.findMany({
      include: { payslips: { select: { id: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return res.json({ success: true, items: runs.map(payrollRunFlat), total: runs.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Create draft (#15) ===================== */
router.post('/runs', authGuard, requireRole('HR'), async (req, res) => {
  try {
    const monthInput = String(req.body.month || '');
    const match = /^(\d{4})-(\d{2})$/.exec(monthInput);
    if (!match) return res.status(422).json({ success: false, error: 'Month must be in YYYY-MM format.' });
    const [, year, month] = match;

    const existing = await prisma.payrollRun.findUnique({ where: { month_year: { month: Number(month), year: Number(year) } } });
    if (existing?.status === 'FINALIZED') {
      return res.status(409).json({ success: false, error: 'This month is finalized and locked; a draft cannot be recreated.' });
    }

    const run = await buildDraft(existing?.id, Number(month), Number(year), req.user.name);
    await logAudit({ req, action: 'create', entityType: 'payroll_run', entityId: run.id, afterState: { month: monthInput, totalNet: run.totalNet, payslips: run.payslips.length } });
    return res.status(201).json({ success: true, run: payrollRunFlat(run) });
  } catch (err) {
    console.error('PAYROLL DRAFT ERROR:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Run detail (#15, #17) ===================== */
router.get('/runs/:id', authGuard, requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.id },
      include: { payslips: { include: { employee: { include: { department: true } } }, orderBy: { employeeName: 'asc' } } },
    });
    if (!run) return res.status(404).json({ success: false, error: 'Payroll run not found.' });

    const slips = run.payslips.map((p) => payslipFlat({ ...p, department: p.employee?.department }));
    return res.json({ success: true, run: payrollRunFlat(run), payslips: slips });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Recalculate draft (#15) ===================== */
router.post('/runs/:id/recalculate', authGuard, requireRole('HR'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id } });
    if (!run) return res.status(404).json({ success: false, error: 'Payroll run not found.' });
    if (run.status === 'FINALIZED') return res.status(409).json({ success: false, error: 'Finalized runs are locked.' });

    const fresh = await buildDraft(run.id, run.month, run.year, req.user.name);
    await logAudit({ req, action: 'update', entityType: 'payroll_run', entityId: fresh.id, afterState: { recalculated: true, totalNet: fresh.totalNet } });
    return res.json({ success: true, run: payrollRunFlat(fresh) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Finalize & lock (#16, Admin only) ===================== */
router.patch('/runs/:id/finalize', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.id }, include: { payslips: true } });
    if (!run) return res.status(404).json({ success: false, error: 'Payroll run not found.' });
    if (run.status === 'FINALIZED') return res.status(409).json({ success: false, error: 'This run is already finalized.' });

    const finalized = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'FINALIZED', finalizedBy: req.user.name, finalizedAt: new Date() },
    });

    for (const ps of run.payslips) {
      const u = await prisma.user.findFirst({ where: { employeeId: ps.employeeId } });
      if (u) {
        await prisma.notification.create({
          data: {
            userId: u.id,
            title: 'Payslip available',
            message: `Your payslip for ${run.month}/${run.year} has been finalized and is ready to download.`,
          },
        });
      }
    }

    await logAudit({ req, action: 'finalize', entityType: 'payroll_run', entityId: run.id, beforeState: { status: 'draft' }, afterState: { status: 'finalized', by: req.user.name } });
    return res.json({ success: true, run: payrollRunFlat(finalized) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

/* ===================== /api/payslips router (#17) ===================== */
const payslipsRouter = express.Router();

// GET /api/payslips/me - finalized payslips only
payslipsRouter.get('/me', authGuard, async (req, res) => {
  try {
    if (!req.user.employeeId) return res.json({ success: true, items: [] });
    const payslips = await prisma.payslip.findMany({
      where: { employeeId: req.user.employeeId, payrollRun: { status: 'FINALIZED' } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return res.json({ success: true, items: payslips.map(payslipFlat), total: payslips.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/payslips/:id/pdf
payslipsRouter.get('/:id/pdf', authGuard, async (req, res) => {
  try {
    const payslip = await prisma.payslip.findUnique({ where: { id: req.params.id } });
    if (!payslip) return res.status(404).json({ success: false, error: 'Payslip not found.' });

    // Data-scope guard: employees only download their own
    if (req.user.role === 'EMPLOYEE' && payslip.employeeId !== req.user.employeeId) {
      return res.status(403).json({ success: false, error: 'You can only download your own payslip.' });
    }
    // Employees can only download finalized payslips
    const run = await prisma.payrollRun.findUnique({ where: { id: payslip.payrollRunId } });
    if (req.user.role === 'EMPLOYEE' && run?.status !== 'FINALIZED') {
      return res.status(403).json({ success: false, error: 'This payslip is not finalized yet.' });
    }

    const company = await prisma.company.findFirst();
    const NEON = '#8f1fe0';

    const doc = new PDFDocument({ margin: 48 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=payslip-${payslip.employeeCode}-${payslip.year}-${payslip.month}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).fillColor(NEON).text(company?.name || 'HCM Lite', { bold: true });
    doc.fontSize(10).fillColor('#666').text('Monthly Employee Payslip', { underline: false });
    doc.moveDown();

    doc.fillColor('#111').fontSize(11);
    doc.text(`Employee: ${payslip.employeeName}  ·  Code: ${payslip.employeeCode}`);
    doc.text(`Pay period: ${payslip.month}/${payslip.year}  ·  Working days: ${payslip.workingDays}`);
    doc.moveDown();
    doc.strokeColor('#e6defa').lineWidth(1).moveTo(48, doc.y).lineTo(548, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(13).fillColor(NEON).text('Earnings', { underline: true });
    doc.fillColor('#111').fontSize(10);
    doc.text(`Basic: PKR ${payslip.basic.toLocaleString()}`);
    doc.text(`House Rent Allowance (40%): PKR ${payslip.hra.toLocaleString()}`);
    doc.text(`Medical Allowance (10%): PKR ${payslip.medical.toLocaleString()}`);
    doc.text(`Total Gross: PKR ${payslip.gross.toLocaleString()}`, { bold: true });
    doc.moveDown();

    doc.fontSize(13).fillColor(NEON).text('Deductions', { underline: true });
    doc.fillColor('#111').fontSize(10);
    doc.text(`Absent days (${payslip.absentDays}) + unpaid leave (${payslip.unpaidLeaveDays}) + half days (${payslip.halfDays} × 0.5): -PKR ${payslip.attendanceDeduction.toLocaleString()}`);
    doc.text(`Income tax (annual slab ÷ 12): -PKR ${payslip.monthlyTax.toLocaleString()}`);
    doc.moveDown();

    doc.strokeColor('#e6defa').moveTo(48, doc.y).lineTo(548, doc.y).stroke();
    doc.moveDown();
    doc.fontSize(15).fillColor(NEON).text(`Net Payable: PKR ${payslip.netSalary.toLocaleString()}`, { bold: true });
    doc.fontSize(8).fillColor('#999').moveDown().text('System-generated payslip · HCM Lite', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('PAYSLIP PDF ERROR:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.payslips = payslipsRouter;
