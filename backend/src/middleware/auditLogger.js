const prisma = require('../config/db');

async function logAudit({ req, action, entityType, entityId, beforeState = null, afterState = null }) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: req.user ? req.user.id : 'SYSTEM',
        actorName: req.user ? req.user.name : 'System Initializer',
        actorRole: req.user ? req.user.role : 'SYSTEM',
        action,
        entityType,
        entityId: String(entityId),
        beforeState: beforeState ? JSON.stringify(beforeState) : null,
        afterState: afterState ? JSON.stringify(afterState) : null,
      }
    });
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
