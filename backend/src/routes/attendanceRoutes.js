const express = require('express');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');
const { calculateHaversineDistance } = require('../utils/calculations');
const { attendanceFlat, correctionFlat } = require('../utils/serializers');

const router = express.Router();

const todayStr = () => new Date().toISOString().slice(0, 10);

async function getSettings() {
  return prisma.setting.findFirst();
}

/* ===================== Today's record (#09) ===================== */
router.get('/today', authGuard, async (req, res) => {
  try {
    if (!req.user.employeeId) return res.json({ success: true, record: null });
    const record = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId: req.user.employeeId, date: todayStr() } },
    });
    return res.json({ success: true, record: record ? attendanceFlat(record) : null });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Check in (#09, Rule M4) ===================== */
router.post('/check-in', authGuard, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ success: false, error: 'No employee profile linked to this account.' });

    const today = todayStr();
    const existing = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: today } } });
    if (existing) {
      // Rule M4: one record per employee per day; second check-in = 409
      return res.status(409).json({ success: false, error: 'You have already checked in today.' });
    }

    const setting = await getSettings();
    const officeStart = setting?.officeStartTime || '09:00';
    const graceMinutes = setting?.graceMinutes ?? 15;

    // Server stamps the time
    const now = new Date();
    const [sh, sm] = officeStart.split(':').map(Number);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const status = currentMinutes > sh * 60 + sm + graceMinutes ? 'LATE' : 'PRESENT';

    // Optional camera + geofence (bonus): source=camera
    const { source = 'WEB', lat, lng, accuracy } = req.body || {};
    let distanceMeters = null;
    if (String(source).toUpperCase() === 'CAMERA') {
      if (accuracy !== undefined && Number(accuracy) > 100) {
        return res.status(422).json({ success: false, error: `GPS accuracy (${Math.round(accuracy)}m) is worse than the 100m requirement.` });
      }
      if (lat !== undefined && lng !== undefined && setting) {
        distanceMeters = calculateHaversineDistance(setting.officeLat, setting.officeLng, Number(lat), Number(lng));
        if (distanceMeters > setting.radiusMeters) {
          return res.status(422).json({ success: false, error: `You are ${distanceMeters}m from the office; the allowed radius is ${setting.radiusMeters}m.` });
        }
      }
    }

    const record = await prisma.attendance.create({
      data: {
        employeeId,
        date: today,
        checkIn: now,
        status,
        source: String(source).toUpperCase(),
        locationLat: lat !== undefined ? Number(lat) : null,
        locationLng: lng !== undefined ? Number(lng) : null,
        distanceMeters,
      },
    });

    await logAudit({ req, action: 'create', entityType: 'attendance', entityId: record.id, afterState: { date: today, status, source } });
    return res.status(201).json({ success: true, record: attendanceFlat(record) });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'You have already checked in today.' });
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Check out (#09) ===================== */
router.post('/check-out', authGuard, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ success: false, error: 'No employee profile linked to this account.' });

    const record = await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date: todayStr() } } });
    if (!record) return res.status(404).json({ success: false, error: 'No check-in found for today.' });
    if (record.checkOut) return res.status(409).json({ success: false, error: 'You have already checked out today.' });

    const now = new Date();
    const workHours = Math.round(((now - new Date(record.checkIn)) / 3600000) * 10) / 10;
    const setting = await getSettings();
    const halfDayHours = setting?.halfDayHours ?? 5;

    // Rule M4: under N hours = half day
    const finalStatus = workHours < halfDayHours ? 'HALF_DAY' : record.status;

    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: { checkOut: now, workHours, status: finalStatus },
    });

    await logAudit({ req, action: 'update', entityType: 'attendance', entityId: record.id, afterState: { workHours, status: finalStatus } });
    return res.json({ success: true, record: attendanceFlat(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== My month calendar (#10 Own) ===================== */
router.get('/me', authGuard, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(404).json({ success: false, error: 'No employee profile linked to this account.' });

    const month = String(req.query.month || todayStr().slice(0, 7));
    const records = await prisma.attendance.findMany({ where: { employeeId, date: { startsWith: month } }, orderBy: { date: 'asc' } });
    const holidays = await prisma.publicHoliday.findMany({ where: { date: { startsWith: month } } });
    const setting = await getSettings();
    let weekend = [0, 6];
    try { weekend = JSON.parse(setting?.weekendDays || '[0,6]'); } catch { /* default */ }

    const onLeave = await prisma.leaveRequest.findMany({
      where: { employeeId, status: 'APPROVED', startDate: { lte: `${month}-31` }, endDate: { gte: `${month}-01` } },
    });

    // Mark approved-leave days so the calendar shows them
    const leaveDays = new Set();
    for (const l of onLeave) {
      for (let d = new Date(l.startDate); d <= new Date(l.endDate); d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (iso.startsWith(month)) leaveDays.add(iso);
      }
    }
    const withLeave = records.map((r) => (leaveDays.has(r.date) ? { ...r, status: 'ON_LEAVE' } : r));

    return res.json({
      success: true,
      records: withLeave.map(attendanceFlat),
      holidays: holidays.map((h) => h.date),
      weekendDays: weekend,
      summary: {
        present: withLeave.filter((r) => r.status === 'PRESENT').length,
        late: withLeave.filter((r) => r.status === 'LATE').length,
        absent: withLeave.filter((r) => r.status === 'ABSENT').length,
        half_day: withLeave.filter((r) => r.status === 'HALF_DAY').length,
        on_leave: withLeave.filter((r) => r.status === 'ON_LEAVE').length,
        hours: Math.round(withLeave.reduce((s, r) => s + (r.workHours || 0), 0) * 10) / 10,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Daily board (#10 All) ===================== */
router.get('/board', authGuard, requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const date = String(req.query.date || todayStr());
    const { departmentId } = req.query;

    const employees = await prisma.employee.findMany({
      where: {
        status: { in: ['ACTIVE', 'PROBATION'] },
        ...(departmentId && departmentId !== 'ALL' ? { departmentId } : {}),
      },
      include: { department: true },
      orderBy: { firstName: 'asc' },
    });

    const records = await prisma.attendance.findMany({ where: { date } });
    const byEmp = new Map(records.map((r) => [r.employeeId, r]));

    const approvedLeave = await prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
    });
    const onLeaveEmp = new Set(approvedLeave.map((l) => l.employeeId));

    const rows = employees.map((e) => {
      const r = byEmp.get(e.id);
      let status = 'ABSENT';
      let checkIn = null;
      let checkOut = null;
      let hours = null;
      let source = null;
      if (onLeaveEmp.has(e.id)) status = 'ON_LEAVE';
      else if (r) {
        status = r.status === 'MISSING_CHECKOUT' ? 'MISSING_CHECKOUT' : r.status;
        checkIn = r.checkIn;
        checkOut = r.checkOut;
        hours = r.workHours;
        source = r.source;
      }
      return {
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`,
        department: e.department ? { id: e.department.id, name: e.department.name } : null,
        checkIn,
        checkOut,
        hours,
        source: source ? String(source).toLowerCase() : null,
        status: String(status).toLowerCase(),
      };
    });

    const summary = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
    return res.json({ success: true, rows, summary });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Corrections (#11) ===================== */
router.post('/corrections', authGuard, async (req, res) => {
  try {
    const employeeId = req.user.employeeId;
    if (!employeeId) return res.status(400).json({ success: false, error: 'No employee profile linked to this account.' });

    const { date, reason, requestedCheckIn, requestedCheckOut } = req.body;
    if (!reason || String(reason).trim().length < 5) {
      return res.status(422).json({ success: false, error: 'Explain what went wrong (at least 5 characters).', errors: [{ field: 'reason', reason: 'At least 5 characters.' }] });
    }

    const attendance = date
      ? await prisma.attendance.findUnique({ where: { employeeId_date: { employeeId, date } } })
      : null;

    const mkTime = (hhmm) => (hhmm && /^\d{2}:\d{2}$/.test(String(hhmm)) ? new Date(`${date || todayStr()}T${hhmm}:00`) : null);

    const correction = await prisma.attendanceCorrection.create({
      data: {
        attendanceId: attendance?.id || null,
        employeeId,
        date: date || null,
        requestedCheckIn: mkTime(requestedCheckIn),
        requestedCheckOut: mkTime(requestedCheckOut),
        reason: String(reason).trim(),
        status: 'PENDING',
      },
      include: { employee: true },
    });

    await logAudit({ req, action: 'create', entityType: 'attendance_correction', entityId: correction.id, afterState: { date, reason } });
    return res.status(201).json({ success: true, item: correctionFlat(correction) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/corrections', authGuard, async (req, res) => {
  try {
    const { status } = req.query;
    const where = {};
    if (req.user.role === 'EMPLOYEE') where.employeeId = req.user.employeeId || 'none';
    if (status) where.status = String(status).toUpperCase();

    const corrections = await prisma.attendanceCorrection.findMany({
      where,
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, items: corrections.map(correctionFlat), total: corrections.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/attendance/corrections/:id (#11 HR decision)
router.patch('/corrections/:id', authGuard, requireRole('HR'), async (req, res) => {
  try {
    const { decision, comment } = req.body;
    const decisionClean = String(decision || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decisionClean)) {
      return res.status(400).json({ success: false, error: 'Decision must be approved or rejected.' });
    }

    const corr = await prisma.attendanceCorrection.findUnique({ where: { id: req.params.id }, include: { employee: true } });
    if (!corr) return res.status(404).json({ success: false, error: 'Correction not found.' });
    if (corr.status !== 'PENDING') return res.status(409).json({ success: false, error: 'This correction was already reviewed.' });

    const updated = await prisma.$transaction(async (tx) => {
      const c = await tx.attendanceCorrection.update({
        where: { id: corr.id },
        data: { status: decisionClean, reviewedBy: req.user.name, reviewComment: comment || null },
        include: { employee: true },
      });

      if (decisionClean === 'APPROVED') {
        // Apply to the attendance record (create one if the day was missed)
        const date = corr.date || corr.createdAt.toISOString().slice(0, 10);
        const existing = await tx.attendance.findUnique({ where: { employeeId_date: { employeeId: corr.employeeId, date } } });
        const checkIn = corr.requestedCheckIn || existing?.checkIn || new Date(`${date}T09:00:00`);
        const checkOut = corr.requestedCheckOut || existing?.checkOut || null;
        const workHours = checkOut ? Math.round(((new Date(checkOut) - new Date(checkIn)) / 3600000) * 10) / 10 : (existing?.workHours ?? 0);

        if (existing) {
          await tx.attendance.update({
            where: { id: existing.id },
            data: { checkIn, checkOut: checkOut || undefined, workHours, status: 'PRESENT' },
          });
        } else {
          await tx.attendance.create({
            data: { employeeId: corr.employeeId, date, checkIn, checkOut, workHours, status: 'PRESENT', source: 'CORRECTION' },
          });
        }
      }
      return c;
    });

    const target = await prisma.user.findFirst({ where: { employeeId: corr.employeeId } });
    if (target) {
      await prisma.notification.create({
        data: {
          userId: target.id,
          title: `Correction ${decisionClean.toLowerCase()}`,
          message: `Your attendance correction was ${decisionClean.toLowerCase()} by HR. ${comment || ''}`.trim(),
        },
      });
    }

    await logAudit({
      req,
      action: decisionClean === 'APPROVED' ? 'approve' : 'reject',
      entityType: 'attendance_correction',
      entityId: corr.id,
      afterState: { decision: decisionClean, comment },
    });

    return res.json({ success: true, item: correctionFlat(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
