const Order = require('../../models/Order');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { buildSearchRegex } = require('../../utils/queryHelpers');
const { findMemberIdsByKeyword, applyStatusFilter, applyPackageFilter, normalizeDateRange } = require('./_helpers');
const { ORDER_STATUS } = require('../../constants/enums');

const listOrdersAdmin = asyncHandler(async (req, res) => {
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = {};

  if (keywordRegex) {
    const matchedMemberIds = await findMemberIdsByKeyword(keywordRegex, ['fullName', 'email', 'phone']);
    filters.memberId = { $in: matchedMemberIds };
  }

  applyPackageFilter(filters, req.query);
  applyStatusFilter(filters, req.query, Object.values(ORDER_STATUS), 'status');

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
      .populate('packageId', 'code name price')
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

const voidOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);

  if (!order) {
    throw httpError(404, 'order_not_found', 'Không tìm thấy đơn hàng');
  }

  if (order.status === ORDER_STATUS.VOIDED) {
    res.json({ message: 'Đơn hàng đã được hủy trước đó', data: order });
    return;
  }

  const originalValues = order.toObject({ depopulate: true });
  order.set('status', ORDER_STATUS.VOIDED);
  await order.save();

  res.json({ message: 'Hủy đơn hàng thành công', data: order });
});

module.exports = {
  listOrdersAdmin,
  voidOrder
};
