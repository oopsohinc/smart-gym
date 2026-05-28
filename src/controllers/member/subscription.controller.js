const Subscription = require('../../models/Subscription');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { getRemainingDays } = require('../../utils/date');
const { SUBSCRIPTION_STATUS } = require('../../constants/enums');

const getSubscriptionStatus = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const now = new Date();

  const subscriptions = await Subscription.find({ memberId })
    .sort({ createdAt: -1 })
    .populate('packageId', 'name code durationValue durationUnit price')
    .lean();

  const activeSubscription = await Subscription.findOne({
    memberId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .sort({ endDate: -1 })
    .populate('packageId', 'name code durationValue durationUnit price')
    .lean();

  const data = subscriptions.map((item) => ({
    ...item,
    remainingDays: getRemainingDays(item.endDate)
  }));

  return res.json({
    data: {
      hasActiveSubscription: Boolean(activeSubscription),
      activeSubscription,
      remainingDays: activeSubscription ? getRemainingDays(activeSubscription.endDate) : 0,
      subscriptions: data
    }
  });
});

const activatePendingSubscription = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { subscriptionId } = req.params;
  const now = new Date();

  const pendingSubscription = await Subscription.findOne({
    _id: subscriptionId,
    memberId,
    status: SUBSCRIPTION_STATUS.PENDING
  });

  if (!pendingSubscription) {
    throw httpError(404, 'subscription_not_found', 'Không tìm thấy gói tập đang chờ kích hoạt');
  }

  const activeSubscription = await Subscription.findOne({
    memberId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .sort({ endDate: -1 })
    .select('_id endDate')
    .lean();

  if (activeSubscription) {
    throw httpError(409, 'active_subscription_exists', 'Gói tập hiện tại phải hết hạn trước khi kích hoạt gói mới');
  }

  pendingSubscription.status = SUBSCRIPTION_STATUS.ACTIVE;
  if (pendingSubscription.startDate > now) {
    pendingSubscription.startDate = now;
  }
  pendingSubscription.remainingDaysCache = getRemainingDays(pendingSubscription.endDate);
  await pendingSubscription.save();

  const activated = await Subscription.findById(pendingSubscription._id)
    .populate('packageId', 'name code durationValue durationUnit price')
    .lean();

  res.json({
    message: 'Kích hoạt gói tập thành công',
    data: activated
  });
});

module.exports = {
  getSubscriptionStatus,
  activatePendingSubscription
};
