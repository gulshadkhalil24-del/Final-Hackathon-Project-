const express = require('express');
const prisma = require('../config/db');
const { authGuard, requireRole } = require('../middleware/authGuard');
const { logAudit } = require('../middleware/auditLogger');
const { announcementFlat, notificationFlat, auditFlat } = require('../utils/serializers');

const router = express.Router();

/* ===================== Announcements (#23) ===================== */
router.get('/announcements', authGuard, async (req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return res.json({ success: true, items: announcements.map(announcementFlat), total: announcements.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/announcements', authGuard, requireRole('ADMIN', 'HR'), async (req, res) => {
  try {
    const { title, body } = req.body;
    const errors = [];
    if (!title || !String(title).trim()) errors.push({ field: 'title', reason: 'Required.' });
    if (!body || !String(body).trim()) errors.push({ field: 'body', reason: 'Required.' });
    if (errors.length) return res.status(422).json({ success: false, error: 'Check the entered data.', errors });

    const ann = await prisma.announcement.create({
      data: { title: String(title).trim(), message: String(body).trim(), postedBy: req.user.name, postedRole: req.user.role },
    });

    await logAudit({ req, action: 'create', entityType: 'announcement', entityId: ann.id, afterState: { title: ann.title } });
    return res.status(201).json({ success: true, item: announcementFlat(ann) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Notifications (#24) ===================== */
router.get('/notifications', authGuard, async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ success: true, items: notifications.map(notificationFlat), total: notifications.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/notifications/unread-count', authGuard, async (req, res) => {
  try {
    const count = await prisma.notification.count({ where: { userId: req.user.id, isRead: false } });
    return res.json({ success: true, count });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/notifications/read-all', authGuard, async (req, res) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/notifications/:id/read', authGuard, async (req, res) => {
  try {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || n.userId !== req.user.id) return res.status(404).json({ success: false, error: 'Notification not found.' });
    await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/* ===================== Audit log (#25, Admin only, read-only) ===================== */
router.get('/audit-logs', authGuard, requireRole('ADMIN'), async (req, res) => {
  try {
    const { action, entity, from, to, page = 1, pageSize = 15, limit } = req.query;
    const take = Number(pageSize || limit || 15);

    const where = {};
    if (action && action !== 'ALL') where.action = String(action).toLowerCase();
    if (entity && entity !== 'ALL') where.entityType = String(entity).toLowerCase();
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(`${from}T00:00:00`);
      if (to) where.timestamp.lte = new Date(`${to}T23:59:59`);
    }

    const skip = (Number(page) - 1) * take;
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { timestamp: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({ success: true, items: logs.map(auditFlat), total, page: Number(page) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
