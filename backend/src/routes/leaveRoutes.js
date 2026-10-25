const express = require('express');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');
const { calculateWorkingDays } = require('../utils/calculations');
const { leaveFlat } = require('../utils/serializers');

const router = express.Router();

async function balancesFor(employeeId) {
  const leaveTypes = await prisma.leaveType.findMany();
  const approved = await prisma.leaveRequest.findMany({ where: { employeeId, status: 'APPROVED' } });
  return leaveTypes.map((lt) => {
    const used = approved.filter((l) => l.leaveTypeId === lt.id).reduce((s, l) => s + l.workingDaysCount, 0);
    const unlimited = lt.yearlyQuota <= 0;
    return { typeId: lt.id, type: lt.name, quota: lt.yearlyQuota, used, remaining: unlimited ? null : Math.max(0, lt.yearlyQuota - used), unlimited };
  });
}

/* ===================== Balance (#12) ===================== */
router.get('/balance', authGuard, async (req, res) => {
  try {
    if (!req.user.employeeId) return res.json({ success: true, items: [] });
    return res.json({ success: true, items: await balancesFor(req.user.employeeId) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== My requests (#12) ===================== */
router.get('/me', authGuard, async (req, res) => {
  try {
    if (!req.user.employeeId) return res.json({ success: true, items: [] });
    const leaves = await prisma.leaveRequest.findMany({
      where: { employeeId: req.user.employeeId },
      include: { leaveType: true, employee: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, items: leaves.map(leaveFlat), total: leaves.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Apply (#12, Rule M5) ===================== */
router.post('/', authGuard, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ success: false, error: 'No employee profile linked to this account.' });

    const { leaveTypeId, startDate, endDate, reason } = req.body;
    if (!leaveTypeId || !startDate || !endDate || !reason) {
      return res.status(422).json({ success: false, error: 'Leave type, both dates and a reason are required.' });
    }

    // 1. Working days only (skip weekends + holidays)
    const setting = await prisma.setting.findFirst();
    let weekend = [0, 6];
    try { weekend = JSON.parse(setting?.weekendDays || '[0,6]'); } catch { /* default */ }
    const holidays = (await prisma.publicHoliday.findMany()).map((h) => h.date);
    const workingDays = calculateWorkingDays(String(startDate).slice(0, 10), String(endDate).slice(0, 10), weekend, holidays);
    if (workingDays <= 0) {
      return res.status(422).json({ success: false, error: 'The selected range has 0 working days (weekends or public holidays).' });
    }

    // 2. Overlap = 422
    const existing = await prisma.leaveRequest.findMany({
      where: { employeeId, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (existing.some((l) => !(endDate < l.startDate || startDate > l.endDate))) {
      return res.status(422).json({ success: false, error: 'You already have a leave request covering these dates.' });
    }

    // 3. Quota check = 422
    const leaveType = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType) return res.status(404).json({ success: false, error: 'Leave type not found.' });

    if (leaveType.yearlyQuota > 0) {
      const year = String(startDate).slice(0, 4);
      const approvedThisYear = await prisma.leaveRequest.findMany({
        where: { employeeId, leaveTypeId, status: 'APPROVED', startDate: { startsWith: year } },
      });
      const used = approvedThisYear.reduce((s, l) => s + l.workingDaysCount, 0);
      const remaining = leaveType.yearlyQuota - used;
      if (workingDays > remaining) {
        return res.status(422).json({
          success: false,
          error: `Insufficient balance: ${workingDays} day(s) requested, ${Math.max(0, remaining)} ${leaveType.name} day(s) remaining.`,
        });
      }
    }

    const request = await prisma.leaveRequest.create({
      data: { employeeId, leaveTypeId, startDate: String(startDate).slice(0, 10), endDate: String(endDate).slice(0, 10), workingDaysCount: workingDays, reason, status: 'PENDING' },
      include: { leaveType: true, employee: true },
    });

    await logAudit({ req, action: 'create', entityType: 'leave', entityId: request.id, afterState: { type: leaveType.name, workingDays, reason } });
    return res.status(201).json({ success: true, item: leaveFlat(request), message: `Leave requested for ${workingDays} working day(s).` });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Cancel (#12) ===================== */
router.patch('/:id/cancel', authGuard, async (req, res) => {
  try {
    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) return res.status(404).json({ success: false, error: 'Leave request not found.' });
    if (req.user.role === 'EMPLOYEE' && leave.employeeId !== req.user.employeeId) {
      return res.status(403).json({ success: false, error: 'You can only cancel your own requests.' });
    }
    if (leave.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: 'Only pending requests can be cancelled.' });
    }

    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { status: 'CANCELLED' },
      include: { leaveType: true, employee: true },
    });

    await logAudit({ req, action: 'update', entityType: 'leave', entityId: leave.id, afterState: { cancelled: true } });
    return res.json({ success: true, item: leaveFlat(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== HR inbox / Admin view (#13) ===================== */
router.get('/requests', authGuard, requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (status) where.status = String(status).toUpperCase();

    const leaves = await prisma.leaveRequest.findMany({
      where,
      include: { leaveType: true, employee: { include: { department: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, items: leaves.map(leaveFlat), total: leaves.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Approve / reject with comment (#13) ===================== */
router.patch('/:id/decision', authGuard, requireRole('HR'), async (req, res) => {
  try {
    const { decision, comment } = req.body;
    const decisionClean = String(decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decisionClean)) {
      return res.status(400).json({ success: false, error: 'Decision must be approved or rejected.' });
    }

    const leave = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!leave) return res.status(404).json({ success: false, error: 'Leave request not found.' });
    if (leave.status !== 'PENDING') return res.status(409).json({ success: false, error: 'This request was already reviewed.' });

    const updated = await prisma.leaveRequest.update({
      where: { id: leave.id },
      data: { status: decisionClean, reviewedBy: req.user.name, reviewComment: comment || null },
      include: { leaveType: true, employee: true },
    });

    const target = await prisma.user.findFirst({ where: { employeeId: leave.employeeId } });
    if (target) {
      await prisma.notification.create({
        data: {
          userId: target.id,
          title: `Leave ${decisionClean.toLowerCase()}`,
          message: `Your ${leave.workingDaysCount}-day leave was ${decisionClean.toLowerCase()} by HR.${comment ? ` Comment: ${comment}` : ''}`,
        },
      });
    }

    await logAudit({ req, action: decisionClean === 'APPROVED' ? 'approve' : 'reject', entityType: 'leave', entityId: leave.id, afterState: { decision: decisionClean, comment } });
    return res.json({ success: true, item: leaveFlat(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
