const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../../models/User');
const Role = require('../../models/Role');
const { USER_STATUS } = require('../../constants/enums');
const { createAccessToken, createRefreshToken, verifyRefreshToken } = require('../../services/token.service');
const { sendResetPasswordEmail } = require('../../services/email.service');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');

async function getRoleWithPermissionsByName(name) {
  return Role.findOne({ name: String(name).toLowerCase(), isActive: true })
    .select('_id name permissions')
    .lean();
}

const register = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  if (!fullName || !email || !phone || !password) {
    throw httpError(400, 'invalid_input', 'Vui lòng cung cấp đầy đủ: họ tên, email, số điện thoại và mật khẩu');
  }

  const existed = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] }).lean();
  if (existed) {
    throw httpError(409, 'user_exists', 'Email hoặc số điện thoại đã được sử dụng');
  }

  const memberRole = await getRoleWithPermissionsByName('member');
  if (!memberRole) {
    throw httpError(500, 'role_not_found', 'Vai trò mặc định của hội viên chưa được cấu hình');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    roleId: memberRole._id,
    status: USER_STATUS.ACTIVE
  });

  res.status(201).json({
    message: 'Đăng ký tài khoản thành công',
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId,
      role: memberRole.name,
      permissions: memberRole.permissions
    }
  });
});

const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    throw httpError(400, 'invalid_input', 'Vui lòng cung cấp tài khoản và mật khẩu');
  }

  const user = await User.findOne({
    $or: [{ email: String(identifier).toLowerCase() }, { phone: identifier }]
  }).populate('roleId', 'name permissions isActive');

  if (!user) {
    throw httpError(401, 'invalid_credentials', 'Tài khoản hoặc mật khẩu không chính xác');
  }

  const isMatched = await bcrypt.compare(password, user.passwordHash);
  if (!isMatched) {
    throw httpError(401, 'invalid_credentials', 'Tài khoản hoặc mật khẩu không chính xác');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw httpError(403, 'user_inactive', 'Tài khoản đã bị vô hiệu hóa');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  res.json({
    message: 'Đăng nhập thành công',
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      roleId: user.roleId?._id || null,
      role: user.roleId?.name || null,
      permissions: Array.isArray(user.roleId?.permissions) ? user.roleId.permissions : []
    }
  });
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) {
    throw httpError(400, 'invalid_input', 'refreshToken là bắt buộc');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    throw httpError(401, 'invalid_refresh_token', 'Refresh token không hợp lệ');
  }

  const user = await User.findById(payload.sub).select('_id roleId status');
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    throw httpError(401, 'invalid_refresh_token', 'Refresh token không hợp lệ');
  }

  res.json({
    accessToken: createAccessToken(user)
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw httpError(400, 'invalid_input', 'Vui lòng cung cấp địa chỉ email');
  }

  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user) {
    throw httpError(404, 'user_not_found', 'Không tìm thấy tài khoản với email này');
  }

  // Generate a secure 6-digit numeric OTP code
  const otpCode = crypto.randomInt(100000, 1000000).toString();
  user.resetPasswordToken = otpCode;
  user.resetPasswordExpires = Date.now() + 600000; // 10 minutes expiration

  await user.save();

  // Send real email with OTP or fallback mock
  await sendResetPasswordEmail(user.email, otpCode);

  res.json({
    message: 'Mã OTP gồm 6 chữ số đã được gửi đến email của bạn.',
    otp: otpCode, // also return it in response to make development/local testing easy
    resetPasswordExpires: user.resetPasswordExpires
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { otp, newPassword } = req.body;
  if (!otp || !newPassword) {
    throw httpError(400, 'invalid_input', 'Vui lòng cung cấp mã OTP và mật khẩu mới');
  }

  const user = await User.findOne({
    resetPasswordToken: otp,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!user) {
    throw httpError(400, 'invalid_otp', 'Mã OTP không hợp lệ hoặc đã hết hạn');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;

  await user.save();

  res.json({
    message: 'Đặt lại mật khẩu thành công'
  });
});

module.exports = {
  register,
  login,
  refreshToken,
  forgotPassword,
  resetPassword
};
