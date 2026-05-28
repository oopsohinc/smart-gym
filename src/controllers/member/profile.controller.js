const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { getRemainingDays } = require('../../utils/date');
const { calculateBmi } = require('../../utils/fitness');
const { SUBSCRIPTION_STATUS } = require('../../constants/enums');

const getProfile = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;

  const user = await User.findById(memberId)
    .select('-passwordHash')
    .populate('roleId', 'name permissions isActive')
    .lean();

  if (!user) {
    throw httpError(404, 'user_not_found', 'Không tìm thấy người dùng');
  }

  const activeSubscription = await Subscription.findOne({
    memberId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: new Date() }
  })
    .sort({ endDate: -1 })
    .populate('packageId', 'code name durationValue durationUnit price')
    .lean();

  const remainingDays = activeSubscription ? getRemainingDays(activeSubscription.endDate) : 0;

  res.json({
    data: {
      user: {
        ...user,
        roleId: user.roleId?._id || user.roleId || null,
        roleName: user.roleId?.name || null,
        permissions: Array.isArray(user.roleId?.permissions) ? user.roleId.permissions : []
      },
      activeSubscription,
      remainingDays
    }
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const allowed = ['fullName', 'phone', 'dateOfBirth', 'fitnessGoal', 'fitnessLevel'];
  const updateData = {};

  const currentUser = await User.findById(memberId).select('healthProfile').lean();
  if (!currentUser) {
    throw httpError(404, 'user_not_found', 'Không tìm thấy người dùng');
  }

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  }

  if (req.body.healthProfile !== undefined) {
    if (!req.body.healthProfile || typeof req.body.healthProfile !== 'object') {
      throw httpError(400, 'invalid_input', 'healthProfile phải là đối tượng (object)');
    }

    const mergedHealthProfile = {
      ...(currentUser.healthProfile || {}),
      ...req.body.healthProfile
    };

    const bmi = calculateBmi(mergedHealthProfile.height, mergedHealthProfile.weight);
    if (bmi !== null) {
      mergedHealthProfile.bmi = bmi;
    }

    updateData.healthProfile = mergedHealthProfile;
  }

  const updated = await User.findByIdAndUpdate(memberId, updateData, {
    new: true,
    runValidators: true,
    projection: '-passwordHash'
  }).lean();

  res.json({
    message: 'Cập nhật hồ sơ thành công',
    data: updated
  });
});

const updatePassword = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw httpError(400, 'invalid_input', 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới');
  }

  const user = await User.findById(memberId);
  if (!user) {
    throw httpError(404, 'user_not_found', 'Không tìm thấy người dùng');
  }

  const isMatched = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatched) {
    throw httpError(400, 'invalid_password', 'Mật khẩu hiện tại không chính xác');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ message: 'Đổi mật khẩu thành công' });
});

module.exports = {
  getProfile,
  updateProfile,
  updatePassword
};
