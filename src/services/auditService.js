const AuditLog = require('../models/AuditLog');

async function logAction(actorId, action, entity, entityId, oldValues, newValues) {
  return AuditLog.create({
    actorId,
    action,
    entity,
    entityId,
    oldValues,
    newValues
  });
}

module.exports = {
  logAction
};