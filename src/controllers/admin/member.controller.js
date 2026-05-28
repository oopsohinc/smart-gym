const User = require('../../models/User');
const { asyncHandler } = require('../../utils/asyncHandler');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { buildSearchRegex, buildRoleQuery } = require('../../utils/queryHelpers');

const listMembersAdmin = asyncHandler(async (req, res) => {
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = await buildRoleQuery('member');

  if (keywordRegex) {
    filters.$or = [{ fullName: keywordRegex }, { phone: keywordRegex }, { email: keywordRegex }];
  }

  const { page, limit, skip } = parsePagination(req.query);

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

module.exports = {
  listMembersAdmin
};
