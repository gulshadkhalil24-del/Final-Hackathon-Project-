const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');

const router = express.Router();

const genTempPassword = () => `Pass@${Math.floor(1000 + Math.random() * 9000)}`;

// GET /api/users?role=hr (#05, Admin)
router.get('/', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { role } = req.query;
    const where = {};
    if (role) where.role = String(role).toUpperCase();

    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({
      success: true,
      items: users.map((u) => ({ ...u, role: u.role.toLowerCase() })),
      total: users.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users/hr (#05) - Admin creates an HR login; temp password returned once.
router.post('/hr', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const errors = [];
    if (!name || !String(name).trim()) errors.push({ field: 'name', reason: 'Required.' });
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) errors.push({ field: 'email', reason: 'Enter a valid email.' });
    if (password !== undefined && password !== '' && (String(password).length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      errors.push({ field: 'password', reason: 'At least 8 characters with a letter and a number.' });
    }
    if (errors.length) return res.status(422).json({ success: false, error: 'Check the entered data.', errors });

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing) return res.status(409).json({ success: false, error: 'A user with this email already exists.', errors: [{ field: 'email', reason: 'Already in use.' }] });

    const tempPassword = password && password !== '' ? password : genTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    const newUser = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: String(email).toLowerCase(),
        passwordHash: hash,
        role: 'HR',
        mustChangePassword: !(password && password !== ''),
        isActive: true,
      },
    });

    await logAudit({ req, action: 'create', entityType: 'user', entityId: newUser.id, afterState: { email: newUser.email, role: 'hr' } });

    return res.status(201).json({ success: true, user: { id: newUser.id, name: newUser.name }, temporaryPassword: tempPassword });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users/:id/reset-password (#05) - new temp password, must change on next sign-in.
router.post('/:id/reset-password', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    if (user.role === 'ADMIN') return res.status(403).json({ success: false, error: 'Admin passwords cannot be reset here.' });

    const tempPassword = genTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash, mustChangePassword: true, isActive: true } });

    await logAudit({ req, action: 'reset_password', entityType: 'user', entityId: user.id, afterState: { email: user.email } });
    return res.json({ success: true, temporaryPassword: tempPassword });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/:id/activate | /deactivate (#05)
async function setStatus(req, res, isActive) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    if (user.role === 'ADMIN') return res.status(403).json({ success: false, error: 'Admin logins cannot be deactivated.' });

    const updated = await prisma.user.update({ where: { id: user.id }, data: { isActive } });
    await logAudit({
      req,
      action: isActive ? 'update' : 'deactivate',
      entityType: 'user',
      entityId: user.id,
      beforeState: { isActive: user.isActive },
      afterState: { isActive: updated.isActive },
    });
    return res.json({ success: true, isActive: updated.isActive });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
router.patch('/:id/activate', authGuard, requireRole('ADMIN'), (req, res) => setStatus(req, res, true));
router.patch('/:id/deactivate', authGuard, requireRole('ADMIN'), (req, res) => setStatus(req, res, false));

module.exports = router;
