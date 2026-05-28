const Role = require('../../models/Role');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { ALL_PERMISSIONS } = require('../../constants/permissions');
const { invalidateRole, invalidateAllRoles } = require('../../services/roleCache');

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) {
    return [];
  }

  return permissions
    .map((permission) => String(permission).trim())
    .filter(Boolean);
}

const listRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find().sort({ createdAt: -1 }).lean();
  res.json({ data: roles });
});

const createRole = asyncHandler(async (req, res) => {
  const { name, description = '', permissions = [] } = req.body;

  if (!name) {
    throw httpError(400, 'invalid_input', 'Tên vai trò là bắt buộc');
  }

  const normalizedPermissions = normalizePermissions(permissions);
  const role = await Role.create({
    name: String(name).toLowerCase(),
    description,
    permissions: normalizedPermissions
  });

  invalidateAllRoles();

  res.status(201).json({
    message: 'Tạo vai trò thành công',
    data: role
  });
});

const updateRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  const updates = {};
  const allowed = ['name', 'description', 'permissions', 'isActive'];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  if (updates.name !== undefined) {
    updates.name = String(updates.name).toLowerCase();
  }

  if (updates.permissions !== undefined) {
    if (!Array.isArray(updates.permissions)) {
      throw httpError(400, 'invalid_input', 'permissions phải là mảng (array)');
    }

    updates.permissions = normalizePermissions(updates.permissions);
  }

  const role = await Role.findByIdAndUpdate(roleId, updates, {
    new: true,
    runValidators: true
  }).lean();

  if (!role) {
    throw httpError(404, 'role_not_found', 'Không tìm thấy vai trò');
  }

  invalidateRole(roleId);
  invalidateAllRoles();

  res.json({
    message: 'Cập nhật vai trò thành công',
    data: role
  });
});

const deleteRole = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  const role = await Role.findByIdAndDelete(roleId).lean();

  if (!role) {
    throw httpError(404, 'role_not_found', 'Không tìm thấy vai trò');
  }

  invalidateRole(roleId);
  invalidateAllRoles();

  res.json({
    message: 'Xóa vai trò thành công',
    data: role
  });
});

const listPermissions = asyncHandler(async (req, res) => {
  res.json({ data: ALL_PERMISSIONS });
});

module.exports = {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions
};
