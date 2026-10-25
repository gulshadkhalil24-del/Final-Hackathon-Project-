const express = require('express');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');

const router = express.Router();

/* ============ Settings (#03) ============ */

function settingsFlat(setting, companyName) {
  if (!setting) return null;
  let weekend = [0, 6];
  try { weekend = JSON.parse(setting.weekendDays); } catch { /* keep default */ }
  return {
    companyName,
    officeStart: setting.officeStartTime,
    graceMinutes: setting.graceMinutes,
    halfDayHours: setting.halfDayHours,
    weekendDays: weekend,
    officeLat: setting.officeLat,
    officeLng: setting.officeLng,
    radiusM: setting.radiusMeters,
  };
}

// GET /api/settings
router.get('/settings', authGuard, async (req, res) => {
  try {
    const setting = await prisma.setting.findFirst({ include: { company: true } });
    return res.json({ success: true, ...settingsFlat(setting, setting?.company?.name) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/settings (Admin only)
router.put('/settings', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const setting = await prisma.setting.findFirst({ include: { company: true } });
    if (!setting) return res.status(404).json({ success: false, error: 'Settings record not found.' });

    const { companyName, officeStart, graceMinutes, halfDayHours, weekendDays, officeLat, officeLng, radiusM } = req.body;
    const before = settingsFlat(setting, setting.company?.name);

    if (companyName !== undefined && String(companyName).trim()) {
      await prisma.company.update({ where: { id: setting.companyId }, data: { name: String(companyName).trim() } });
    }

    const updated = await prisma.setting.update({
      where: { id: setting.id },
      data: {
        officeStartTime: officeStart !== undefined && officeStart !== '' ? officeStart : setting.officeStartTime,
        graceMinutes: graceMinutes !== undefined ? Number(graceMinutes) : setting.graceMinutes,
        halfDayHours: halfDayHours !== undefined ? Number(halfDayHours) : setting.halfDayHours,
        weekendDays: weekendDays !== undefined ? JSON.stringify(weekendDays) : setting.weekendDays,
        officeLat: officeLat !== undefined && officeLat !== null ? Number(officeLat) : setting.officeLat,
        officeLng: officeLng !== undefined && officeLng !== null ? Number(officeLng) : setting.officeLng,
        radiusMeters: radiusM !== undefined ? Number(radiusM) : setting.radiusMeters,
      },
    });

    const after = settingsFlat(updated, String(companyName || setting.company?.name || '').trim());
    await logAudit({ req, action: 'update', entityType: 'settings', entityId: setting.id, beforeState: before, afterState: after });

    return res.json({ success: true, ...after });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ============ Departments (#04) ============ */

router.get('/departments', authGuard, async (req, res) => {
  try {
    const departments = await prisma.department.findMany({
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return res.json({
      success: true,
      items: departments.map((d) => ({ id: d.id, name: d.name, code: d.code, employeeCount: d._count.employees })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/departments', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(422).json({ success: false, error: 'Name is required.', errors: [{ field: 'name', reason: 'Required.' }] });
    const clean = String(name).trim();
    const dupe = await prisma.department.findFirst({ where: { name: clean } });
    if (dupe) return res.status(409).json({ success: false, error: 'This department already exists.' });

    const code = clean.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || `D${Date.now() % 1000}`;
    const dept = await prisma.department.create({ data: { name: clean, code } });
    await logAudit({ req, action: 'create', entityType: 'department', entityId: dept.id, afterState: { name: clean } });
    return res.status(201).json({ success: true, item: { id: dept.id, name: dept.name, employeeCount: 0 } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/departments/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(422).json({ success: false, error: 'Name is required.', errors: [{ field: 'name', reason: 'Required.' }] });
    const updated = await prisma.department.update({ where: { id: req.params.id }, data: { name: String(name).trim() } });
    await logAudit({ req, action: 'update', entityType: 'department', entityId: updated.id, afterState: { name: updated.name } });
    return res.json({ success: true, item: { id: updated.id, name: updated.name } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/departments/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const used = await prisma.employee.count({ where: { departmentId: req.params.id } });
    if (used > 0) return res.status(409).json({ success: false, error: `${used} employee(s) still belong to this department.` });
    await prisma.department.delete({ where: { id: req.params.id } });
    await logAudit({ req, action: 'update', entityType: 'department', entityId: req.params.id, afterState: { deleted: true } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ============ Designations (#04) ============ */

router.get('/designations', authGuard, async (req, res) => {
  try {
    const designations = await prisma.designation.findMany({ orderBy: { title: 'asc' } });
    return res.json({ success: true, items: designations.map((d) => ({ id: d.id, name: d.title })) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/designations', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, departmentId } = req.body;
    if (!name || !String(name).trim()) return res.status(422).json({ success: false, error: 'Name is required.', errors: [{ field: 'name', reason: 'Required.' }] });
    const desig = await prisma.designation.create({ data: { title: String(name).trim(), departmentId: departmentId || null } });
    await logAudit({ req, action: 'create', entityType: 'designation', entityId: desig.id, afterState: { name: desig.title } });
    return res.status(201).json({ success: true, item: { id: desig.id, name: desig.title } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/designations/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) return res.status(422).json({ success: false, error: 'Name is required.', errors: [{ field: 'name', reason: 'Required.' }] });
    const updated = await prisma.designation.update({ where: { id: req.params.id }, data: { title: String(name).trim() } });
    return res.json({ success: true, item: { id: updated.id, name: updated.title } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/designations/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const used = await prisma.employee.count({ where: { designationId: req.params.id } });
    if (used > 0) return res.status(409).json({ success: false, error: `${used} employee(s) still use this designation.` });
    await prisma.designation.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ============ Leave types (#04) ============ */

router.get('/leave-types', authGuard, async (req, res) => {
  try {
    const leaveTypes = await prisma.leaveType.findMany({ orderBy: { name: 'asc' } });
    return res.json({
      success: true,
      items: leaveTypes.map((t) => ({ id: t.id, name: t.name, yearlyQuota: t.yearlyQuota, isPaid: t.isPaid })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/leave-types', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, yearlyQuota, isPaid } = req.body;
    if (!name || !String(name).trim()) return res.status(422).json({ success: false, error: 'Name is required.', errors: [{ field: 'name', reason: 'Required.' }] });
    const dupe = await prisma.leaveType.findFirst({ where: { name: String(name).trim() } });
    if (dupe) return res.status(409).json({ success: false, error: 'This leave type already exists.' });
    const lt = await prisma.leaveType.create({
      data: { name: String(name).trim(), yearlyQuota: Math.max(0, Number(yearlyQuota) || 0), isPaid: isPaid !== false },
    });
    await logAudit({ req, action: 'create', entityType: 'leave_type', entityId: lt.id, afterState: { name: lt.name, quota: lt.yearlyQuota } });
    return res.status(201).json({ success: true, item: { id: lt.id, name: lt.name, yearlyQuota: lt.yearlyQuota, isPaid: lt.isPaid } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/leave-types/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, yearlyQuota, isPaid } = req.body;
    const updated = await prisma.leaveType.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(yearlyQuota !== undefined ? { yearlyQuota: Math.max(0, Number(yearlyQuota) || 0) } : {}),
        ...(isPaid !== undefined ? { isPaid: isPaid !== false } : {}),
      },
    });
    return res.json({ success: true, item: { id: updated.id, name: updated.name, yearlyQuota: updated.yearlyQuota, isPaid: updated.isPaid } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/leave-types/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const used = await prisma.leaveRequest.count({ where: { leaveTypeId: req.params.id } });
    if (used > 0) return res.status(409).json({ success: false, error: `${used} leave request(s) use this type.` });
    await prisma.leaveType.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ============ Public holidays (#04) ============ */

router.get('/holidays', authGuard, async (req, res) => {
  try {
    const holidays = await prisma.publicHoliday.findMany({ orderBy: { date: 'asc' } });
    return res.json({ success: true, items: holidays.map((h) => ({ id: h.id, name: h.name, date: h.date })) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/holidays', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, date } = req.body;
    const errors = [];
    if (!name || !String(name).trim()) errors.push({ field: 'name', reason: 'Required.' });
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) errors.push({ field: 'date', reason: 'Use YYYY-MM-DD.' });
    if (errors.length) return res.status(422).json({ success: false, error: 'Check the entered data.', errors });

    const exists = await prisma.publicHoliday.findUnique({ where: { date: String(date) } });
    if (exists) return res.status(409).json({ success: false, error: 'A holiday already exists on this date.' });

    const holiday = await prisma.publicHoliday.create({ data: { name: String(name).trim(), date: String(date) } });
    await logAudit({ req, action: 'create', entityType: 'holiday', entityId: holiday.id, afterState: { name: holiday.name, date: holiday.date } });
    return res.status(201).json({ success: true, item: { id: holiday.id, name: holiday.name, date: holiday.date } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/holidays/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, date } = req.body;
    const updated = await prisma.publicHoliday.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(date !== undefined ? { date: String(date) } : {}),
      },
    });
    return res.json({ success: true, item: { id: updated.id, name: updated.name, date: updated.date } });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/holidays/:id', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    await prisma.publicHoliday.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
