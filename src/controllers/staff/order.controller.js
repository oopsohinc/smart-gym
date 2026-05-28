const User = require('../../models/User');
const Package = require('../../models/Package');
const Order = require('../../models/Order');
const Invoice = require('../../models/Invoice');
const Subscription = require('../../models/Subscription');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { addDuration, getRemainingDays } = require('../../utils/date');
const { buildRoleQuery, buildSearchRegex } = require('../../utils/queryHelpers');
const { buildOrderNo, buildInvoiceNo } = require('../../utils/orderHelpers');
const { USER_STATUS, ORDER_STATUS, SUBSCRIPTION_STATUS } = require('../../constants/enums');

// Import shared admin filter helpers to keep it 100% DRY
const { findMemberIdsByKeyword, applyPackageFilter, normalizeDateRange } = require('../admin/_helpers');

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

const listPendingOrders = asyncHandler(async (req, res) => {
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = { status: ORDER_STATUS.PENDING };

  // Keyword search inside member's name/phone/email
  if (keywordRegex) {
    const matchedMemberIds = await findMemberIdsByKeyword(keywordRegex, ['fullName', 'email', 'phone']);
    filters.memberId = { $in: matchedMemberIds };
  }

  // Package filter
  applyPackageFilter(filters, req.query);

  // Date range filter
  const createdAtRange = normalizeDateRange(req.query);
  if (createdAtRange) {
    filters.createdAt = createdAtRange;
  }

  const { page, limit, skip } = parsePagination(req.query);

  const [total, data] = await Promise.all([
    Order.countDocuments(filters),
    Order.find(filters)
      .sort({ createdAt: -1 })
      .populate('memberId', 'fullName email phone')
      .populate('packageId', 'code name price durationValue durationUnit')
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

const approveOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ _id: orderId, status: ORDER_STATUS.PENDING });
  if (!order) {
    throw httpError(404, 'order_not_found', 'Không tìm thấy đơn đang chờ duyệt');
  }

  const pkg = await Package.findById(order.packageId).lean();
  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Không tìm thấy gói tập');
  }

  const now = new Date();
  const { startDate, endDate, status } = await resolveSubscriptionWindow(order.memberId, pkg, now);

  const subscription = await Subscription.create({
    memberId: order.memberId,
    packageId: order.packageId,
    orderId: order._id,
    startDate,
    endDate,
    status,
    remainingDaysCache: getRemainingDays(endDate)
  });

  await Invoice.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        invoiceNo: buildInvoiceNo()
      },
      $set: {
        memberId: order.memberId,
        packageId: order.packageId,
        amount: order.amount,
        paymentMethod: order.paymentMethod || 'cash',
        paymentProvider: order.paymentProvider || 'manual',
        status: 'paid',
        paidAt: now,
        note: req.body.note || ''
      }
    },
    {
      new: true,
      upsert: true,
      runValidators: true
    }
  );

  order.status = ORDER_STATUS.APPROVED;
  order.reviewedBy = req.user.userId;
  order.reviewedAt = now;
  order.note = req.body.note || '';
  await order.save();

  res.json({
    message: 'Duyệt đơn đăng ký thành công',
    data: {
      order,
      subscription
    }
  });
});

const rejectOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ _id: orderId, status: ORDER_STATUS.PENDING });
  if (!order) {
    throw httpError(404, 'order_not_found', 'Không tìm thấy đơn đang chờ duyệt');
  }

  order.status = ORDER_STATUS.REJECTED;
  order.reviewedBy = req.user.userId;
  order.reviewedAt = new Date();
  order.note = req.body.note || '';
  await order.save();

  res.json({ message: 'Từ chối đơn đăng ký thành công' });
});

const counterSale = asyncHandler(async (req, res) => {
  const { memberId, packageId } = req.body;

  if (!memberId || !packageId) {
    throw httpError(400, 'invalid_input', 'memberId và packageId là bắt buộc');
  }

  const [member, pkg] = await Promise.all([
    User.findOne({
      _id: memberId,
      status: USER_STATUS.ACTIVE,
      ...(await buildRoleQuery('member'))
    }).lean(),
    Package.findOne({ _id: packageId, isActive: true }).lean()
  ]);

  if (!member) {
    throw httpError(404, 'member_not_found', 'Không tìm thấy hội viên');
  }

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Không tìm thấy gói tập');
  }

  const now = new Date();
  const order = await Order.create({
    orderNo: buildOrderNo(),
    memberId,
    packageId,
    type: 'counter_sale',
    amount: pkg.price,
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
    message: 'Bán gói tập tại quầy thành công',
    data: {
      order,
      subscription
    }
  });
});

module.exports = {
  listPendingOrders,
  approveOrder,
  rejectOrder,
  counterSale
};
