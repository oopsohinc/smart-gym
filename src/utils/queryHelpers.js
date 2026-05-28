/**
 * queryHelpers.js
 * Shared query utility functions reused across multiple controllers.
 */
const Role = require('../models/Role');

/**
 * Build a case-insensitive regex for keyword search.
 * Returns null when the keyword is empty.
 */
function buildSearchRegex(value) {
  const keyword = String(value || '').trim();
  if (!keyword) {
    return null;
  }

  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escapedKeyword, 'i');
}

/**
 * Lookup a role's ObjectId by its name (case-insensitive, active only).
 * Returns null when not found.
 */
async function getRoleIdByName(name) {
  const role = await Role.findOne({ name: String(name).toLowerCase(), isActive: true })
    .select('_id')
    .lean();

  return role?._id || null;
}

/**
 * Build a Mongoose filter object that matches users with the given role name.
 * Falls back to { roleId: null } when the role does not exist.
 */
async function buildRoleQuery(name) {
  const roleId = await getRoleIdByName(name);
  return roleId ? { roleId } : { roleId: null };
}

module.exports = {
  buildSearchRegex,
  getRoleIdByName,
  buildRoleQuery
};
