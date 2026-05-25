const Role = require('../models/Role');

const roleCache = new Map();
const ROLE_CACHE_TTL_MS = 5 * 60 * 1000;

function isCacheEntryValid(entry) {
  return entry && entry.expiresAt > Date.now();
}

async function getRoleById(roleId) {
  if (!roleId) {
    return null;
  }

  const key = String(roleId);
  const cached = roleCache.get(key);
  if (isCacheEntryValid(cached)) {
    return cached.value;
  }

  const role = await Role.findById(roleId)
    .select('_id name permissions isActive')
    .lean();

  if (!role) {
    roleCache.delete(key);
    return null;
  }

  roleCache.set(key, {
    value: role,
    expiresAt: Date.now() + ROLE_CACHE_TTL_MS
  });

  return role;
}

function invalidateRole(roleId) {
  if (!roleId) {
    return;
  }

  roleCache.delete(String(roleId));
}

function invalidateAllRoles() {
  roleCache.clear();
}

module.exports = {
  getRoleById,
  invalidateRole,
  invalidateAllRoles,
  ROLE_CACHE_TTL_MS
};
