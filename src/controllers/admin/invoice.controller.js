const Invoice = require('../../models/Invoice');
const { asyncHandler } = require('../../utils/asyncHandler');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { buildSearchRegex } = require('../../utils/queryHelpers');
const { findMemberIdsByKeyword, applyStatusFilter, applyPackageFilter, normalizeDateRange } = require('./_helpers');

const listInvoicesAdmin = asyncHandler(async (req, res) => {
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = {};

  if (keywordRegex) {
    const matchedMemberIds = await findMemberIdsByKeyword(keywordRegex, ['fullName', 'email', 'phone']);
    filters.memberId = { $in: matchedMemberIds };
  }

  applyPackageFilter(filters, req.query);
  applyStatusFilter(filters, req.query, ['pending', 'paid', 'failed']);

  const createdAtRange = normalizeDateRange(req.query);
  if (createdAtRange) {
    filters.createdAt = createdAtRange;
  }

  const { page, limit, skip } = parsePagination(req.query);

  const [total, data] = await Promise.all([
    Invoice.countDocuments(filters),
    Invoice.find(filters)
      .sort({ createdAt: -1 })
      .populate('orderId', 'orderNo status')
      .populate('memberId', 'fullName email phone')
      .populate('packageId', 'code name price')
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

module.exports = {
  listInvoicesAdmin
};
