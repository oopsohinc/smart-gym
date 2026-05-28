const mongoose = require('mongoose');
const User = require('../../models/User');
const Role = require('../../models/Role');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { buildSearchRegex } = require('../../utils/queryHelpers');
const { USER_STATUS } = require('../../constants/enums');

const listUsersAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = {};

  // Keyword search: name / email / phone
  if (keywordRegex) {
    filters.$or = [{ fullName: keywordRegex }, { email: keywordRegex }, { phone: keywordRegex }];
  }

  // Filter by roleId
  const roleIdParam = String(req.query.roleId || '').trim();
  if (roleIdParam) {
    if (!mongoose.Types.ObjectId.isValid(roleIdParam)) {
      throw httpError(400, 'invalid_input', 'roleId lọc không hợp lệ');
    }
    filters.roleId = roleIdParam;
  }

  // Filter by status
  const statusParam = String(req.query.status || '').trim();
  if (statusParam) {
    if (!Object.values(USER_STATUS).includes(statusParam)) {
      throw httpError(400, 'invalid_input', `status must be one of: ${Object.values(USER_STATUS).join(', ')}`);
    }
    filters.status = statusParam;
  }

  const [total, data] = await Promise.all([
    User.countDocuments(filters),
    User.find(filters)
      .select('-passwordHash')
      .populate('roleId', 'name description')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { roleId } = req.body;

  if (!roleId) {
    throw httpError(400, 'invalid_input', 'roleId là bắt buộc');
  }

  if (!mongoose.Types.ObjectId.isValid(roleId)) {
    throw httpError(400, 'invalid_input', 'roleId không hợp lệ');
  }

  const role = await Role.findOne({ _id: roleId, isActive: true }).select('_id name').lean();
  if (!role) {
    throw httpError(404, 'role_not_found', 'Không tìm thấy vai trò hoặc vai trò đã bị vô hiệu hóa');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw httpError(404, 'user_not_found', 'Không tìm thấy người dùng');
  }

  const oldRoleId = user.roleId;
  user.set('roleId', roleId);
  await user.save();

  const updatedUser = await User.findById(user._id)
    .select('-passwordHash')
    .populate('roleId', 'name description')
    .lean();

  res.json({ message: 'Cập nhật vai trò người dùng thành công', data: updatedUser });
});

module.exports = {
  listUsersAdmin,
  updateUserRole
};
