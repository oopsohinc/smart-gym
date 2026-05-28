const Package = require('../../models/Package');
const { asyncHandler } = require('../../utils/asyncHandler');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');

const listActivePackages = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const [total, data] = await Promise.all([
    Package.countDocuments({ isActive: true }),
    Package.find({ isActive: true })
      .select('code name description durationValue durationUnit price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

module.exports = {
  listActivePackages
};
