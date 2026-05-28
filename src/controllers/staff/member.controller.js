const User = require('../../models/User');
const Subscription = require('../../models/Subscription');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { buildRoleQuery, buildSearchRegex } = require('../../utils/queryHelpers');
const { getRemainingDays } = require('../../utils/date');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { USER_STATUS, SUBSCRIPTION_STATUS } = require('../../constants/enums');

const listMembers = asyncHandler(async (req, res) => {
  const mode = req.query.mode || 'active';
  const now = new Date();
  const keywordRegex = buildSearchRegex(req.query.q);
  const { page, limit, skip } = parsePagination(req.query);

  if (mode === 'expiring_soon') {
    const threshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const subFilters = {
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $gte: now, $lte: threshold }
    };

    // Filter by packageId if provided
    const packageIdParam = String(req.query.packageId || '').trim();
    if (packageIdParam) {
      subFilters.packageId = packageIdParam;
    }

    const subscriptions = await Subscription.find(subFilters)
      .populate('memberId', 'fullName phone email status')
      .populate('packageId', 'name code')
      .sort({ endDate: 1 })
      .lean();

    let data = subscriptions.map((item) => ({
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

    // Keyword search filtering
    if (keywordRegex) {
      data = data.filter(
        (item) =>
          keywordRegex.test(item.fullName || '') ||
          keywordRegex.test(item.phone || '') ||
          keywordRegex.test(item.email || '')
      );
    }

    // Apply pagination in memory for expiring soon
    const total = data.length;
    const paginatedData = data.slice(skip, skip + limit);

    return res.json({
      data: paginatedData,
      pagination: buildPaginationMeta(total, page, limit)
    });
  }

  // standard "active" or any other status mode
  const memberFilters = {};

  // Status filtering (defaults to ACTIVE)
  const statusParam = String(req.query.status || USER_STATUS.ACTIVE).trim();
  if (statusParam) {
    if (!Object.values(USER_STATUS).includes(statusParam)) {
      throw httpError(400, 'invalid_input', `status must be one of: ${Object.values(USER_STATUS).join(', ')}`);
    }
    memberFilters.status = statusParam;
  }

  // Keyword search
  if (keywordRegex) {
    Object.assign(memberFilters, {
      $and: [
        await buildRoleQuery('member'),
        {
          $or: [
            { fullName: keywordRegex },
            { phone: keywordRegex },
            { email: keywordRegex }
          ]
        }
      ]
    });
  } else {
    Object.assign(memberFilters, await buildRoleQuery('member'));
  }

  // Filter by packageId (find members who currently have this package active)
  const packageIdParam = String(req.query.packageId || '').trim();
  if (packageIdParam) {
    const activeSubsForPackage = await Subscription.find({
      packageId: packageIdParam,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $gte: now }
    })
      .select('memberId')
      .lean();

    const memberIdsWithPackage = activeSubsForPackage.map((sub) => sub.memberId);
    memberFilters._id = { $in: memberIdsWithPackage };
  }

  const [total, members] = await Promise.all([
    User.countDocuments(memberFilters),
    User.find(memberFilters)
      .select('fullName phone email status createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

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

  return res.json({
    data,
    pagination: buildPaginationMeta(total, page, limit)
  });
});

module.exports = {
  listMembers
};
