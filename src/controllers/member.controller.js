const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const { getRemainingDays } = require('../utils/date');
const { generateDynamicQrToken } = require('../services/qr.service');
const { ORDER_STATUS, SUBSCRIPTION_STATUS } = require('../constants/enums');
const User = require('../models/User');
const Package = require('../models/Package');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const CheckIn = require('../models/CheckIn');

function buildOrderNo() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

const createOrderRequest = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { packageId, type = 'new_purchase', paymentMethod = 'bank_transfer' } = req.body;

  if (!packageId) {
    throw httpError(400, 'invalid_input', 'packageId is required');
  }

  if (paymentMethod === 'vnpay') {
    throw httpError(400, 'invalid_payment_method', 'Use /api/payments/vnpay/create for VNPay payments');
  }

  const pkg = await Package.findById(packageId).select('_id price').lean();
  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  const receiptImageUrl = req.file ? req.file.path.replace(/\\/g, '/') : undefined;

  const order = await Order.create({
    orderNo: buildOrderNo(),
    memberId,
    packageId,
    type,
    amount: pkg.price,
    paymentMethod,
    receiptImageUrl,
    status: ORDER_STATUS.PENDING
  });

  res.status(201).json({
    message: 'Order request created',
    data: order
  });
});

const getProfile = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;

  const user = await User.findById(memberId)
    .select('-passwordHash')
    .lean();

  if (!user) {
    throw httpError(404, 'user_not_found', 'User not found');
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
      user,
      activeSubscription,
      remainingDays
    }
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const allowed = ['fullName', 'phone', 'avatarUrl', 'dateOfBirth', 'gender'];
  const updateData = {};

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  }

  const updated = await User.findByIdAndUpdate(memberId, updateData, {
    new: true,
    runValidators: true,
    projection: '-passwordHash'
  }).lean();

  res.json({
    message: 'Profile updated',
    data: updated
  });
});

const updatePassword = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw httpError(400, 'invalid_input', 'currentPassword and newPassword are required');
  }

  const user = await User.findById(memberId);
  if (!user) {
    throw httpError(404, 'user_not_found', 'User not found');
  }

  const isMatched = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatched) {
    throw httpError(400, 'invalid_password', 'Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  res.json({ message: 'Password updated successfully' });
});

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
    throw httpError(404, 'subscription_not_found', 'Pending subscription not found for this member');
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
    throw httpError(409, 'active_subscription_exists', 'Current active subscription must end before activation');
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
    message: 'Subscription activated successfully',
    data: activated
  });
});

const generateQr = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const qrData = await generateDynamicQrToken(memberId);

  res.json({
    message: 'Dynamic QR token generated',
    data: qrData
  });
});

const getCheckInHistory = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const limit = Math.min(100, Number(req.query.limit || 20));
  const page = Math.max(1, Number(req.query.page || 1));

  const [items, total] = await Promise.all([
    CheckIn.find({ memberId })
      .sort({ checkInAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CheckIn.countDocuments({ memberId })
  ]);

  res.json({
    data: items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
});

module.exports = {
  createOrderRequest,
  getProfile,
  updateProfile,
  updatePassword,
  getSubscriptionStatus,
  activatePendingSubscription,
  generateQr,
  getCheckInHistory
};
