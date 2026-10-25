const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');
const { employeeFlat } = require('../utils/serializers');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const genTempPassword = () => `Pass@${Math.floor(1000 + Math.random() * 9000)}`;

const EMPLOYEE_INCLUDE = { department: true, designation: true, salary: true };

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || parts[0] || '' };
}

async function balancesFor(employeeId) {
  const leaveTypes = await prisma.leaveType.findMany();
  const approved = await prisma.leaveRequest.findMany({ where: { employeeId, status: 'APPROVED' } });
  return leaveTypes.map((lt) => {
    const used = approved.filter((l) => l.leaveTypeId === lt.id).reduce((s, l) => s + l.workingDaysCount, 0);
    const unlimited = lt.yearlyQuota <= 0;
    return { type: lt.name, quota: lt.yearlyQuota, used, remaining: unlimited ? null : Math.max(0, lt.yearlyQuota - used), unlimited };
  });
}

/* ===================== Directory with search / filters / paging (#07) ===================== */
router.get('/', authGuard, async (req, res) => {
  try {
    const { search, departmentId, status, page = 1, pageSize = 10, limit } = req.query;
    const take = Number(pageSize || limit || 10);

    const where = {};
    if (req.user.role === 'EMPLOYEE') {
      where.id = req.user.employeeId || 'none';
    } else {
      if (departmentId && departmentId !== 'ALL') where.departmentId = departmentId;
      if (status && status !== 'ALL') where.status = String(status).toUpperCase();
      if (search) {
        where.OR = [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { email: { contains: search } },
          { employeeCode: { contains: search } },
        ];
      }
    }

    const skip = (Number(page) - 1) * take;
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({ where, include: EMPLOYEE_INCLUDE, skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.employee.count({ where }),
    ]);

    return res.json({
      success: true,
      items: employees.map(employeeFlat),
      total,
      page: Number(page),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Own profile (#06) - must be above /:id ===================== */
router.get('/me', authGuard, async (req, res) => {
  try {
    if (!req.user.employeeId) return res.status(404).json({ success: false, error: 'No employee profile linked to this account.' });
    const e = await prisma.employee.findUnique({ where: { id: req.user.employeeId }, include: EMPLOYEE_INCLUDE });
    if (!e) return res.status(404).json({ success: false, error: 'Employee profile not found.' });
    return res.json({ success: true, employee: employeeFlat(e) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== CSV import with dry run (#08) ===================== */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
}

async function validateCsvRows(rawRows) {
  const header = rawRows[0].map((h) => String(h).trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const errors = [];
  const valid = [];

  const departments = await prisma.department.findMany();
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d]));
  const designations = await prisma.designation.findMany();
  const desigByName = new Map(designations.map((d) => [d.title.toLowerCase(), d]));
  const existingEmails = new Set((await prisma.employee.findMany({ select: { email: true } })).map((e) => e.email.toLowerCase()));
  const existingCodes = new Set((await prisma.employee.findMany({ select: { employeeCode: true } })).map((e) => e.employeeCode.toLowerCase()));
  const seenEmails = new Set();
  const seenCodes = new Set();

  for (let i = 1; i < rawRows.length; i++) {
    const rowNum = i + 1; // +1 header, 1-based like a spreadsheet
    const rowErrors = [];
    const get = (name) => (idx(name) >= 0 ? String(rawRows[i][idx(name)] ?? '').trim() : '');

    const name = get('name');
    const email = get('email').toLowerCase();
    const code = get('code');
    const department = get('department');
    const designation = get('designation');
    const joinDate = get('joindate');
    const basicSalary = Number(get('basicsalary'));

    if (!name) rowErrors.push({ field: 'name', reason: 'Required' });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) rowErrors.push({ field: 'email', reason: 'Valid email required' });
    else if (existingEmails.has(email)) rowErrors.push({ field: 'email', reason: 'Email already exists' });
    else if (seenEmails.has(email)) rowErrors.push({ field: 'email', reason: 'Duplicate email in this file' });
    if (!code) rowErrors.push({ field: 'code', reason: 'Required' });
    else if (existingCodes.has(code.toLowerCase())) rowErrors.push({ field: 'code', reason: 'Code already exists' });
    else if (seenCodes.has(code.toLowerCase())) rowErrors.push({ field: 'code', reason: 'Duplicate code in this file' });
    if (!department || !deptByName.has(department.toLowerCase())) rowErrors.push({ field: 'department', reason: 'Unknown department' });
    if (!designation || !desigByName.has(designation.toLowerCase())) rowErrors.push({ field: 'designation', reason: 'Unknown designation' });
    if (!joinDate || !/^\d{4}-\d{2}-\d{2}$/.test(joinDate)) rowErrors.push({ field: 'joinDate', reason: 'ISO date YYYY-MM-DD required' });
    if (!(basicSalary > 0)) rowErrors.push({ field: 'basicSalary', reason: 'Salary must be above 0' });

    if (rowErrors.length) {
      rowErrors.forEach((e2) => errors.push({ row: rowNum, field: e2.field, reason: e2.reason }));
    } else {
      seenEmails.add(email);
      seenCodes.add(code.toLowerCase());
      valid.push({
        name,
        email,
        code,
        departmentId: deptByName.get(department.toLowerCase()).id,
        designationId: desigByName.get(designation.toLowerCase()).id,
        gender: get('gender') || 'male',
        joinDate,
        basicSalary,
        phone: get('phone'),
        address: get('address'),
      });
    }
  }
  return { errors, valid, total: rawRows.length - 1 };
}

// POST /api/employees/import (multipart CSV, ?dryRun=true first)
router.post('/import', authGuard, requireRole('HR'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'Attach a CSV file in the "file" field.' });
    const rows = parseCsv(req.file.buffer.toString('utf8'));
    if (rows.length < 2) return res.status(422).json({ success: false, error: 'The CSV has no data rows.' });

    const { errors, valid, total } = await validateCsvRows(rows);

    if (String(req.query.dryRun) === 'true') {
      return res.json({ success: true, total, valid: valid.length, errors });
    }

    const created = [];
    for (const r of valid) {
      const tempPassword = genTempPassword();
      const { firstName, lastName } = splitName(r.name);
      const basic = r.basicSalary;
      const hra = Math.round(basic * 0.4);
      const medical = Math.round(basic * 0.1);
      const passwordHash = await bcrypt.hash(tempPassword, 10);

      const emp = await prisma.$transaction(async (tx) => {
        const e = await tx.employee.create({
          data: {
            employeeCode: r.code,
            firstName,
            lastName,
            email: r.email,
            phone: r.phone || null,
            address: r.address || null,
            gender: r.gender.charAt(0).toUpperCase() + r.gender.slice(1).toLowerCase(),
            departmentId: r.departmentId,
            designationId: r.designationId,
            joiningDate: r.joinDate,
            status: 'ACTIVE',
            salary: { create: { basicSalary: basic, hra, medical, grossSalary: basic + hra + medical } },
          },
        });
        await tx.user.create({
          data: {
            name: r.name,
            email: r.email,
            passwordHash,
            role: 'EMPLOYEE',
            mustChangePassword: true,
            isActive: true,
            employeeId: e.id,
          },
        });
        return e;
      });
      created.push(emp.id);
    }

    await logAudit({ req, action: 'create', entityType: 'employee', entityId: `csv-import-${created.length}`, afterState: { imported: created.length } });
    return res.status(201).json({ success: true, total, valid: created.length, errors, imported: created.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/employees/export (#08) - CSV download
router.get('/export', authGuard, requireRole('HR'), async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      include: { department: true, designation: true, salary: true },
      orderBy: { employeeCode: 'asc' },
    });
    const esc = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v ?? '').replace(/"/g, '""')}"` : String(v ?? ''));
    const lines = [['code', 'name', 'email', 'department', 'designation', 'gender', 'joinDate', 'basicSalary', 'phone', 'address'].join(',')];
    for (const e of employees) {
      lines.push([
        e.employeeCode, `${e.firstName} ${e.lastName}`, e.email,
        e.department?.name || '', e.designation?.title || '',
        String(e.gender || '').toLowerCase(), String(e.joiningDate || '').slice(0, 10),
        e.salary?.basicSalary ?? '', e.phone || '', e.address || '',
      ].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="employees-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(lines.join('\n'));
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Employee 360 (#07) ===================== */
router.get('/:id', authGuard, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'EMPLOYEE' && id !== req.user.employeeId) {
      return res.status(403).json({ success: false, error: 'Employees can only view their own profile.' });
    }

    const e = await prisma.employee.findUnique({
      where: { id },
      include: {
        ...EMPLOYEE_INCLUDE,
        attendance: { orderBy: { date: 'desc' }, take: 31 },
        leaveRequests: { include: { leaveType: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        payslips: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12 },
      },
    });
    if (!e) return res.status(404).json({ success: false, error: 'Employee not found.' });

    const monthStr = new Date().toISOString().slice(0, 7);
    const monthAtt = e.attendance.filter((a) => String(a.date).startsWith(monthStr));
    const onLeaveDays = e.leaveRequests
      .filter((l) => l.status === 'APPROVED' && String(l.startDate).startsWith(monthStr))
      .reduce((s, l) => s + l.workingDaysCount, 0);
    const presentDays = monthAtt.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).length;

    const workingDaysInMonth = (() => {
      const [y, m] = monthStr.split('-').map(Number);
      const days = new Date(y, m, 0).getDate();
      return Array.from({ length: days }, (_, i) => i + 1).filter((d) => ![0, 6].includes(new Date(y, m - 1, d).getDay())).length;
    })();

    return res.json({
      success: true,
      employee: employeeFlat(e),
      attendanceSummary: {
        present: presentDays,
        late: monthAtt.filter((a) => a.status === 'LATE').length,
        absent: Math.max(0, workingDaysInMonth - presentDays - monthAtt.filter((a) => a.status === 'HALF_DAY').length - onLeaveDays),
        half_day: monthAtt.filter((a) => a.status === 'HALF_DAY').length,
        on_leave: onLeaveDays,
        hours: Math.round(monthAtt.reduce((s, a) => s + (a.workHours || 0), 0) * 10) / 10,
      },
      leaveBalances: await balancesFor(e.id),
      leaves: e.leaveRequests.map((l) => ({
        id: l.id,
        type: l.leaveType ? { name: l.leaveType.name } : null,
        startDate: l.startDate,
        endDate: l.endDate,
        days: l.workingDaysCount,
        status: String(l.status).toLowerCase(),
        decisionComment: l.reviewComment || '',
      })),
      payslips: e.payslips
        .filter((p) => req.user.role !== 'EMPLOYEE' || true)
        .map((p) => ({ id: p.id, month: `${p.year}-${String(p.month).padStart(2, '0')}`, gross: p.gross, tax: p.monthlyTax, net: p.netSalary })),
      recentAttendance: e.attendance.map((a) => ({
        date: a.date,
        checkIn: a.checkIn,
        checkOut: a.checkOut,
        status: String(a.status).toLowerCase(),
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Register employee (#06, #14) ===================== */
router.post('/', authGuard, requireRole('HR'), async (req, res) => {
  try {
    const { name, email, code, departmentId, designationId, gender, joinDate, status, phone, address, basicSalary, hraPercent = 40, medicalPercent = 10 } = req.body;
    const errors = [];
    if (!name || !String(name).trim()) errors.push({ field: 'name', reason: 'Required.' });
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) errors.push({ field: 'email', reason: 'Enter a valid email.' });
    if (!code || !String(code).trim()) errors.push({ field: 'code', reason: 'Required.' });
    if (!departmentId) errors.push({ field: 'departmentId', reason: 'Choose a department.' });
    if (!designationId) errors.push({ field: 'designationId', reason: 'Choose a designation.' });
    if (!joinDate) errors.push({ field: 'joinDate', reason: 'Required.' });
    if (!(Number(basicSalary) > 0)) errors.push({ field: 'basicSalary', reason: 'Salary must be above 0.' });
    if (errors.length) return res.status(422).json({ success: false, error: 'Check the entered data.', errors });

    const emailClean = String(email).toLowerCase();
    if (await prisma.employee.findUnique({ where: { email: emailClean } })) {
      return res.status(409).json({ success: false, error: 'Employee with this email already exists.', errors: [{ field: 'email', reason: 'Already in use.' }] });
    }
    if (await prisma.employee.findUnique({ where: { employeeCode: String(code).trim() } })) {
      return res.status(409).json({ success: false, error: 'Employee code already exists.', errors: [{ field: 'code', reason: 'Already in use.' }] });
    }

    const tempPassword = genTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const { firstName, lastName } = splitName(name);
    const basic = Number(basicSalary);
    const hra = Math.round((basic * Number(hraPercent)) / 100);
    const medical = Math.round((basic * Number(medicalPercent)) / 100);
    const statusClean = String(status || 'active').toUpperCase();

    const emp = await prisma.$transaction(async (tx) => {
      const e = await tx.employee.create({
        data: {
          employeeCode: String(code).trim(),
          firstName,
          lastName,
          email: emailClean,
          phone: phone || null,
          address: address || null,
          gender: gender ? String(gender).charAt(0).toUpperCase() + String(gender).slice(1).toLowerCase() : 'Male',
          departmentId,
          designationId,
          joiningDate: String(joinDate).slice(0, 10),
          status: ['ACTIVE', 'PROBATION', 'EXITED'].includes(statusClean) ? statusClean : 'ACTIVE',
          salary: { create: { basicSalary: basic, hra, medical, grossSalary: basic + hra + medical } },
        },
        include: EMPLOYEE_INCLUDE,
      });
      await tx.user.create({
        data: {
          name: String(name).trim(),
          email: emailClean,
          passwordHash,
          role: 'EMPLOYEE',
          mustChangePassword: true,
          isActive: statusClean !== 'EXITED',
          employeeId: e.id,
        },
      });
      return e;
    });

    await logAudit({ req, action: 'create', entityType: 'employee', entityId: emp.id, afterState: { code: emp.employeeCode, name, gross: basic + hra + medical } });
    return res.status(201).json({ success: true, employee: employeeFlat(emp), temporaryPassword: tempPassword });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== HR edits employee (#06) ===================== */
router.put('/:id', authGuard, requireRole('HR'), async (req, res) => {
  try {
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id }, include: EMPLOYEE_INCLUDE });
    if (!existing) return res.status(404).json({ success: false, error: 'Employee not found.' });

    const { name, email, code, departmentId, designationId, gender, joinDate, status, phone, address, basicSalary, hraPercent = 40, medicalPercent = 10 } = req.body;
    const before = employeeFlat(existing);

    const { firstName, lastName } = name ? splitName(name) : { firstName: existing.firstName, lastName: existing.lastName };
    const basic = basicSalary !== undefined ? Number(basicSalary) : existing.salary?.basicSalary;
    const hra = Math.round((basic * Number(hraPercent)) / 100);
    const medical = Math.round((basic * Number(medicalPercent)) / 100);
    const statusClean = status ? String(status).toUpperCase() : existing.status;

    const updated = await prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({
        where: { id: existing.id },
        data: {
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          // only touch unique fields when the value actually changes
          ...(email && String(email).toLowerCase() !== existing.email ? { email: String(email).toLowerCase() } : {}),
          ...(code && String(code).trim() !== existing.employeeCode ? { employeeCode: String(code).trim() } : {}),
          ...(departmentId ? { departmentId } : {}),
          ...(designationId !== undefined ? { designationId: designationId || null } : {}),
          ...(gender ? { gender: String(gender).charAt(0).toUpperCase() + String(gender).slice(1).toLowerCase() } : {}),
          ...(joinDate ? { joiningDate: String(joinDate).slice(0, 10) } : {}),
          ...(status ? { status: ['ACTIVE', 'PROBATION', 'EXITED'].includes(statusClean) ? statusClean : 'ACTIVE' } : {}),
          ...(phone !== undefined ? { phone } : {}),
          ...(address !== undefined ? { address } : {}),
        },
        include: EMPLOYEE_INCLUDE,
      });

      if (basicSalary !== undefined && existing.salary) {
        await tx.salaryStructure.update({
          where: { employeeId: existing.id },
          data: { basicSalary: basic, hra, medical, grossSalary: basic + hra + medical },
        });
      }

      if (email || name || status) {
        const u = await tx.user.findFirst({ where: { employeeId: existing.id } });
        if (u) {
          await tx.user.update({
            where: { id: u.id },
            data: {
              ...(name ? { name: String(name).trim() } : {}),
              ...(email && String(email).toLowerCase() !== u.email ? { email: String(email).toLowerCase() } : {}),
              ...(status ? { isActive: statusClean !== 'EXITED' } : {}),
            },
          });
        }
      }

      return tx.employee.findUnique({ where: { id: existing.id }, include: EMPLOYEE_INCLUDE });
    });

    await logAudit({ req, action: 'update', entityType: 'employee', entityId: existing.id, beforeState: before, afterState: employeeFlat(updated) });
    return res.json({ success: true, employee: employeeFlat(updated) });
  } catch (err) {
    console.error('PUT /employees/:id failed:', err.code, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

/* ===================== /api/me router (self-service profile) ===================== */
const meRouter = express.Router();

// PATCH /api/me/profile (#06) - own phone & address only
meRouter.patch('/profile', authGuard, async (req, res) => {
  try {
    if (!req.user.employeeId) return res.status(404).json({ success: false, error: 'No employee profile linked to this account.' });
    const existing = await prisma.employee.findUnique({ where: { id: req.user.employeeId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Employee not found.' });

    const { phone, address } = req.body;
    const errors = {};
    if (phone !== undefined && phone !== '' && !/^[0-9+\-\s()]{7,20}$/.test(String(phone))) errors.phone = 'Enter a valid phone number.';
    if (Object.keys(errors).length) return res.status(422).json({ success: false, error: 'Check the entered data.', errors: Object.entries(errors).map(([field, reason]) => ({ field, reason })) });

    const updated = await prisma.employee.update({
      where: { id: req.user.employeeId },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(address !== undefined ? { address } : {}),
      },
      include: EMPLOYEE_INCLUDE,
    });

    await logAudit({
      req,
      action: 'update',
      entityType: 'employee',
      entityId: existing.id,
      beforeState: { phone: existing.phone, address: existing.address },
      afterState: { phone: updated.phone, address: updated.address },
    });

    return res.json({ success: true, employee: employeeFlat(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.me = meRouter;
