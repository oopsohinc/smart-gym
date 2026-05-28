const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Role = require('../../models/Role');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { buildSearchRegex, buildRoleQuery } = require('../../utils/queryHelpers');
const { USER_STATUS } = require('../../constants/enums');

const listStaff = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filters = await buildRoleQuery('staff');
  const keywordRegex = buildSearchRegex(req.query.q);

  if (keywordRegex) {
    filters.$or = [{ fullName: keywordRegex }, { email: keywordRegex }, { phone: keywordRegex }];
  }

  const status = String(req.query.status || '').trim();
  if (status) {
    if (![USER_STATUS.ACTIVE, USER_STATUS.INACTIVE].includes(status)) {
      throw httpError(400, 'invalid_input', 'Trạng thái chỉ được là active hoặc inactive');
    }
    filters.status = status;
  }

  const [total, data] = await Promise.all([
    User.countDocuments(filters),
    User.find(filters)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

const createStaff = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;
  if (!fullName || !email || !phone || !password) {
    throw httpError(400, 'invalid_input', 'Vui lòng cung cấp đầy đủ: họ tên, email, số điện thoại và mật khẩu');
  }

  const existed = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] }).lean();
  if (existed) {
    throw httpError(409, 'user_exists', 'Email hoặc số điện thoại đã được sử dụng');
  }

  const staffRole = await Role.findOne({ name: 'staff', isActive: true })
    .select('_id name permissions')
    .lean();

  if (!staffRole) {
    throw httpError(500, 'role_not_found', 'Vai trò mặc định của nhân viên chưa được cấu hình');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await User.create({
    fullName,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    roleId: staffRole._id,
    status: USER_STATUS.ACTIVE
  });

  res.status(201).json({
    message: 'Tạo tài khoản nhân viên thành công',
    data: {
      id: staff._id,
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      roleId: staff.roleId,
      role: staffRole.name,
      status: staff.status
    }
  });
});

const updateStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const updates = {};
  const allowed = ['fullName', 'phone', 'status'];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const staff = await User.findOneAndUpdate(
    {
      _id: staffId,
      ...(await buildRoleQuery('staff'))
    },
    updates,
    { new: true, runValidators: true, projection: '-passwordHash' }
  ).lean();

  if (!staff) {
    throw httpError(404, 'staff_not_found', 'Không tìm thấy nhân viên');
  }

  res.json({ message: 'Cập nhật thông tin nhân viên thành công', data: staff });
});

const deactivateStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const staff = await User.findOneAndUpdate(
    {
      _id: staffId,
      ...(await buildRoleQuery('staff'))
    },
    { status: USER_STATUS.INACTIVE },
    { new: true, projection: '-passwordHash' }
  ).lean();

  if (!staff) {
    throw httpError(404, 'staff_not_found', 'Không tìm thấy nhân viên');
  }

  res.json({ message: 'Vô hiệu hóa tài khoản nhân viên thành công', data: staff });
});

const deleteStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;

  // Kiểm tra nhân viên tồn tại và đúng vai trò
  const staff = await User.findOne({
    _id: staffId,
    ...(await buildRoleQuery('staff'))
  })
    .select('-passwordHash')
    .lean();

  if (!staff) {
    throw httpError(404, 'staff_not_found', 'Không tìm thấy nhân viên');
  }

  // Ràng buộc: Không xóa nhân viên nếu tài khoản đang active
  if (staff.status === USER_STATUS.ACTIVE) {
    throw httpError(
      409,
      'staff_still_active',
      'Vui lòng vô hiệu hóa tài khoản nhân viên trước khi xóa vĩnh viễn'
    );
  }

  // Ràng buộc: Không xóa nếu nhân viên đã từng duyệt đơn hàng
  const Order = require('../../models/Order');
  const CheckIn = require('../../models/CheckIn');

  const [reviewedOrders, processedCheckIns] = await Promise.all([
    Order.countDocuments({ reviewedBy: staffId }),
    CheckIn.countDocuments({ staffId })
  ]);

  if (reviewedOrders > 0 || processedCheckIns > 0) {
    throw httpError(
      409,
      'staff_has_activity',
      `Không thể xóa nhân viên này vì có ${reviewedOrders} đơn hàng và ${processedCheckIns} lần check-in liên quan`
    );
  }

  await User.findByIdAndDelete(staffId);

  res.json({ message: 'Xóa tài khoản nhân viên vĩnh viễn thành công', data: staff });
});

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  deleteStaff
};
