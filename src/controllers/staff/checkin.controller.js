const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const CheckIn = require('../../models/CheckIn');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { buildRoleQuery } = require('../../utils/queryHelpers');
const { verifyAndProcessQrScan } = require('../../services/qr.service');
const { USER_STATUS, SUBSCRIPTION_STATUS, CHECKIN_METHOD, CHECKIN_STATUS } = require('../../constants/enums');

const scanQrCheckIn = asyncHandler(async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken) {
    throw httpError(400, 'invalid_input', 'qrToken là bắt buộc');
  }

  const result = await verifyAndProcessQrScan({
    qrToken,
    staffId: req.user.userId
  });

  res.json({
    message: 'Check-in thành công',
    data: result
  });
});

const manualCheckIn = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    throw httpError(400, 'invalid_input', 'Số điện thoại là bắt buộc');
  }

  const criteria = {
    phone,
    status: USER_STATUS.ACTIVE,
    ...(await buildRoleQuery('member'))
  };

  const member = await User.findOne(criteria).select('_id fullName phone').lean();
  if (!member) {
    throw httpError(404, 'member_not_found', 'Không tìm thấy hội viên');
  }

  const now = new Date();
  const activeSubscription = await Subscription.findOne({
    memberId: member._id,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .sort({ endDate: -1 })
    .select('_id endDate')
    .lean();

  if (!activeSubscription) {
    await CheckIn.create({
      memberId: member._id,
      staffId: req.user.userId,
      method: CHECKIN_METHOD.MANUAL,
      status: CHECKIN_STATUS.FAILED,
      failReason: 'no_active_subscription'
    });
    throw httpError(403, 'no_active_subscription', 'Hội viên không có gói tập đang hoạt động');
  }

  const checkIn = await CheckIn.create({
    memberId: member._id,
    staffId: req.user.userId,
    method: CHECKIN_METHOD.MANUAL,
    status: CHECKIN_STATUS.SUCCESS,
    checkInAt: now
  });

  res.json({
    message: 'Check-in thủ công thành công',
    data: {
      checkInId: checkIn._id,
      memberId: member._id,
      memberName: member.fullName,
      checkedInAt: checkIn.checkInAt
    }
  });
});

module.exports = {
  scanQrCheckIn,
  manualCheckIn
};
