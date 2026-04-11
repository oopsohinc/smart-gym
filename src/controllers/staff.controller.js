const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const { addDuration, getRemainingDays } = require('../utils/date');
const { verifyAndProcessQrScan } = require('../services/qr.service');
const {
  USER_ROLES,
  USER_STATUS,
  ORDER_STATUS,
  SUBSCRIPTION_STATUS,
  CHECKIN_METHOD,
  CHECKIN_STATUS
} = require('../constants/enums');
const User = require('../models/User');
const Package = require('../models/Package');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const CheckIn = require('../models/CheckIn');

function buildOrderNo() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function resolveSubscriptionWindow(memberId, pkg, now = new Date()) {
  const currentSubscription = await Subscription.findOne({
    memberId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .sort({ endDate: -1 })
    .select('endDate')
    .lean();

  const hasActiveSubscription = Boolean(currentSubscription?.endDate);
  const startDate = hasActiveSubscription ? new Date(currentSubscription.endDate) : now;
  const endDate = addDuration(startDate, pkg.durationValue, pkg.durationUnit);
  const status = hasActiveSubscription ? SUBSCRIPTION_STATUS.PENDING : SUBSCRIPTION_STATUS.ACTIVE;

  return { startDate, endDate, status };
}

const scanQrCheckIn = asyncHandler(async (req, res) => {
  const { qrToken, deviceId } = req.body;
  if (!qrToken) {
    throw httpError(400, 'invalid_input', 'qrToken is required');
  }

  const result = await verifyAndProcessQrScan({
    qrToken,
    staffId: req.user.userId,
    deviceId
  });

  res.json({
    message: 'Check-in successful',
    data: result
  });
});

const manualCheckIn = asyncHandler(async (req, res) => {
  const { phone, fullName, deviceId } = req.body;
  if (!phone && !fullName) {
    throw httpError(400, 'invalid_input', 'phone or fullName is required');
  }

  const criteria = {
    role: USER_ROLES.MEMBER,
    status: USER_STATUS.ACTIVE
  };

  if (phone) {
    criteria.phone = phone;
  } else {
    criteria.fullName = { $regex: new RegExp(fullName, 'i') };
  }

  const member = await User.findOne(criteria).select('_id fullName phone').lean();
  if (!member) {
    throw httpError(404, 'member_not_found', 'Member not found');
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
      failReason: 'no_active_subscription',
      deviceId
    });
    throw httpError(403, 'no_active_subscription', 'Member has no active subscription');
  }

  const checkIn = await CheckIn.create({
    memberId: member._id,
    staffId: req.user.userId,
    method: CHECKIN_METHOD.MANUAL,
    status: CHECKIN_STATUS.SUCCESS,
    checkInAt: now,
    deviceId
  });

  res.json({
    message: 'Manual check-in successful',
    data: {
      checkInId: checkIn._id,
      memberId: member._id,
      memberName: member.fullName,
      checkedInAt: checkIn.checkInAt
    }
  });
});

const listPendingOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ status: ORDER_STATUS.PENDING })
    .sort({ createdAt: -1 })
    .populate('memberId', 'fullName email phone')
    .populate('packageId', 'code name price durationValue durationUnit')
    .lean();

  res.json({ data: orders });
});

const approveOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ _id: orderId, status: ORDER_STATUS.PENDING });
  if (!order) {
    throw httpError(404, 'order_not_found', 'Pending order not found');
  }

  const pkg = await Package.findById(order.packageId).lean();
  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  const now = new Date();
  const { startDate, endDate, status } = await resolveSubscriptionWindow(order.memberId, pkg, now);

  await Subscription.create({
    memberId: order.memberId,
    packageId: order.packageId,
    orderId: order._id,
    startDate,
    endDate,
    status,
    remainingDaysCache: getRemainingDays(endDate)
  });

  order.status = ORDER_STATUS.APPROVED;
  order.reviewedBy = req.user.userId;
  order.reviewedAt = now;
  order.note = req.body.note || '';
  await order.save();

  res.json({ message: 'Order approved successfully' });
});

const rejectOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ _id: orderId, status: ORDER_STATUS.PENDING });
  if (!order) {
    throw httpError(404, 'order_not_found', 'Pending order not found');
  }

  order.status = ORDER_STATUS.REJECTED;
  order.reviewedBy = req.user.userId;
  order.reviewedAt = new Date();
  order.note = req.body.note || '';
  await order.save();

  res.json({ message: 'Order rejected successfully' });
});

const counterSale = asyncHandler(async (req, res) => {
  const { memberId, packageId, paymentMethod = 'cash' } = req.body;

  if (!memberId || !packageId) {
    throw httpError(400, 'invalid_input', 'memberId and packageId are required');
  }

  const [member, pkg] = await Promise.all([
    User.findOne({ _id: memberId, role: USER_ROLES.MEMBER, status: USER_STATUS.ACTIVE }).lean(),
    Package.findOne({ _id: packageId, isActive: true }).lean()
  ]);

  if (!member) {
    throw httpError(404, 'member_not_found', 'Member not found');
  }

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  const now = new Date();
  const order = await Order.create({
    orderNo: buildOrderNo(),
    memberId,
    packageId,
    type: 'counter_sale',
    amount: pkg.price,
    paymentMethod,
    status: ORDER_STATUS.APPROVED,
    reviewedBy: req.user.userId,
    reviewedAt: now,
    note: 'Counter sale'
  });

  const { startDate, endDate, status } = await resolveSubscriptionWindow(memberId, pkg, now);
  const subscription = await Subscription.create({
    memberId,
    packageId,
    orderId: order._id,
    startDate,
    endDate,
    status,
    remainingDaysCache: getRemainingDays(endDate)
  });

  res.status(201).json({
    message: 'Counter sale completed',
    data: {
      order,
      subscription
    }
  });
});

const listMembers = asyncHandler(async (req, res) => {
  const mode = req.query.mode || 'active';
  const now = new Date();

  if (mode === 'expiring_soon') {
    const threshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const subscriptions = await Subscription.find({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $gte: now, $lte: threshold }
    })
      .populate('memberId', 'fullName phone email status')
      .populate('packageId', 'name code')
      .sort({ endDate: 1 })
      .lean();

    const data = subscriptions.map((item) => ({
      memberId: item.memberId?._id,
      fullName: item.memberId?.fullName,
      phone: item.memberId?.phone,
      email: item.memberId?.email,
      status: item.memberId?.status,
      currentPackage: item.packageId
        ? {
            id: item.packageId._id,
            code: item.packageId.code,
            name: item.packageId.name
          }
        : null,
      subscriptionEndDate: item.endDate,
      remainingDays: getRemainingDays(item.endDate)
    }));

    return res.json({ data });
  }

  const members = await User.find({
    role: USER_ROLES.MEMBER,
    status: USER_STATUS.ACTIVE
  })
    .select('fullName phone email status createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const memberIds = members.map((member) => member._id);
  const activeSubscriptions = await Subscription.find({
    memberId: { $in: memberIds },
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .populate('packageId', 'name code')
    .sort({ endDate: -1 })
    .lean();

  const subscriptionByMember = new Map();
  for (const subscription of activeSubscriptions) {
    const key = String(subscription.memberId);
    if (!subscriptionByMember.has(key)) {
      subscriptionByMember.set(key, subscription);
    }
  }

  const data = members.map((member) => {
    const currentSubscription = subscriptionByMember.get(String(member._id));

    return {
      ...member,
      currentPackage: currentSubscription?.packageId
        ? {
            id: currentSubscription.packageId._id,
            code: currentSubscription.packageId.code,
            name: currentSubscription.packageId.name
          }
        : null,
      subscriptionEndDate: currentSubscription?.endDate || null,
      remainingDays: currentSubscription ? getRemainingDays(currentSubscription.endDate) : 0
    };
  });

  return res.json({ data });
});

module.exports = {
  scanQrCheckIn,
  manualCheckIn,
  listPendingOrders,
  approveOrder,
  rejectOrder,
  counterSale,
  listMembers
};
