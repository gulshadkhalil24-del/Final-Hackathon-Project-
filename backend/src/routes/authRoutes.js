const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { authGuard, JWT_SECRET } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');

const router = express.Router();

// POST /api/auth/login (#02)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { employee: true },
    });

    if (!user) return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account has been deactivated. Contact your Admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ success: false, error: 'Invalid email or password.' });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, employeeId: user.employeeId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await logAudit({
      req: { user },
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      afterState: { email: user.email, role: user.role },
    });

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        mustChangePassword: user.mustChangePassword,
        employeeId: user.employeeId,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/auth/logout - stateless JWT; the client drops the token.
router.post('/logout', authGuard, async (req, res) => {
  res.json({ success: true });
});

// POST /api/auth/change-password (#02) - verifies the current password first.
router.post('/change-password', authGuard, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    if (currentPassword !== undefined) {
      const ok = await bcrypt.compare(currentPassword || '', user.passwordHash);
      if (!ok) {
        return res.status(422).json({
          success: false,
          error: 'Your current password is incorrect.',
          errors: [{ field: 'currentPassword', reason: 'Incorrect current password.' }],
        });
      }
    }

    if (!newPassword || String(newPassword).length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      return res.status(422).json({
        success: false,
        error: 'New password must be at least 8 characters with a letter and a number.',
        errors: [{ field: 'newPassword', reason: 'At least 8 characters with a letter and a number.' }],
      });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: hash, mustChangePassword: false },
    });

    await logAudit({ req, action: 'update', entityType: 'user', entityId: req.user.id, afterState: { password: 'changed' } });

    return res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/auth/me
router.get('/me', authGuard, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { employee: { include: { department: true, designation: true } } },
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        mustChangePassword: user.mustChangePassword,
        employeeId: user.employeeId,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
