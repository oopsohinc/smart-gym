const bcrypt = require('bcryptjs');
const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const { USER_ROLES, USER_STATUS, ORDER_STATUS } = require('../constants/enums');
const User = require('../models/User');
const Package = require('../models/Package');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const CheckIn = require('../models/CheckIn');

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function normalizeRangeType(period) {
  const value = String(period || '').trim().toLowerCase();

  const aliasMap = {
    today: 'today',
    day: 'today',
    'hom_nay': 'today',
    'hôm_nay': 'today',
    week: 'last7days',
    last7days: 'last7days',
    '7days': 'last7days',
    '7_days': 'last7days',
    month: 'thisMonth',
    thismonth: 'thisMonth',
    'thang_nay': 'thisMonth',
    'tháng_này': 'thisMonth',
    year: 'thisYear',
    thisyear: 'thisYear',
    'nam_nay': 'thisYear',
    'năm_này': 'thisYear',
    custom: 'custom'
  };

  return aliasMap[value] || null;
}

function resolveDashboardRange(query) {
  if (query.from || query.to) {
    const now = new Date();
    const from = query.from ? new Date(query.from) : startOfDay(now);
    const to = query.to ? new Date(query.to) : endOfDay(now);

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw httpError(400, 'invalid_input', 'from and to must be valid dates');
    }

    if (from > to) {
      throw httpError(400, 'invalid_input', 'from must be less than or equal to to');
    }

    return { from, to, rangeType: 'custom', filterType: 'custom' };
  }

  const now = new Date();
  const normalizedType = normalizeRangeType(query.period) || 'thisMonth';

  if (normalizedType === 'today') {
    return { from: startOfDay(now), to: endOfDay(now), rangeType: 'day', filterType: 'today' };
  }

  if (normalizedType === 'last7days') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    return {
      from: startOfDay(from),
      to: endOfDay(now),
      rangeType: 'week',
      filterType: 'last7days'
    };
  }

  if (normalizedType === 'thisYear') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from, to: endOfDay(now), rangeType: 'year', filterType: 'thisYear' };
  }

  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: endOfDay(now), rangeType: 'month', filterType: 'thisMonth' };
}

function getRevenueGranularity(filterType) {
  if (filterType === 'today') {
    return 'hour';
  }

  if (filterType === 'thisMonth') {
    return 'week4';
  }

  if (filterType === 'thisYear') {
    return 'month';
  }

  return 'day';
}

function toTwoDigits(value) {
  return String(value).padStart(2, '0');
}

function toYearMonthKey(year, month) {
  return `${year}-${toTwoDigits(month)}`;
}

function toYearMonthDayKey(year, month, day) {
  return `${year}-${toTwoDigits(month)}-${toTwoDigits(day)}`;
}

function toHourKey(hour) {
  return `${toTwoDigits(hour)}:00`;
}

function buildRevenueTrendBuckets(rawTrend, from, to, granularity) {
  const trendMap = new Map();
  for (const item of rawTrend) {
    trendMap.set(item.key, {
      totalRevenue: item.totalRevenue || 0,
      totalInvoices: item.totalInvoices || 0
    });
  }

  if (granularity === 'hour') {
    const buckets = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const key = toHourKey(hour);
      const point = trendMap.get(key);
      buckets.push({
        key,
        label: key,
        totalRevenue: point?.totalRevenue || 0,
        totalInvoices: point?.totalInvoices || 0
      });
    }
    return buckets;
  }

  if (granularity === 'month') {
    const buckets = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);

    while (cursor <= end) {
      const key = toYearMonthKey(cursor.getFullYear(), cursor.getMonth() + 1);
      const point = trendMap.get(key);
      buckets.push({
        key,
        label: key,
        totalRevenue: point?.totalRevenue || 0,
        totalInvoices: point?.totalInvoices || 0
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return buckets;
  }

  if (granularity === 'week4') {
    const buckets = [];
    for (let week = 1; week <= 4; week += 1) {
      const key = `W${week}`;
      const point = trendMap.get(key);
      buckets.push({
        key,
        label: `Week ${week}`,
        totalRevenue: point?.totalRevenue || 0,
        totalInvoices: point?.totalInvoices || 0
      });
    }

    return buckets;
  }

  const buckets = [];
  const cursor = startOfDay(from);
  const end = endOfDay(to);

  while (cursor <= end) {
    const key = toYearMonthDayKey(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    const point = trendMap.get(key);
    buckets.push({
      key,
      label: key,
      totalRevenue: point?.totalRevenue || 0,
      totalInvoices: point?.totalInvoices || 0
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
}

const listStaff = asyncHandler(async (req, res) => {
  const staff = await User.find({ role: USER_ROLES.STAFF })
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data: staff });
});

const createStaff = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;
  if (!fullName || !email || !phone || !password) {
    throw httpError(400, 'invalid_input', 'fullName, email, phone and password are required');
  }

  const existed = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] }).lean();
  if (existed) {
    throw httpError(409, 'user_exists', 'Email or phone already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await User.create({
    fullName,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role: USER_ROLES.STAFF,
    status: USER_STATUS.ACTIVE
  });

  res.status(201).json({
    message: 'Staff account created',
    data: {
      id: staff._id,
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      role: staff.role,
      status: staff.status
    }
  });
});

const updateStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const updates = {};
  const allowed = ['fullName', 'phone', 'avatarUrl', 'status'];

  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const staff = await User.findOneAndUpdate(
    { _id: staffId, role: USER_ROLES.STAFF },
    updates,
    { new: true, runValidators: true, projection: '-passwordHash' }
  ).lean();

  if (!staff) {
    throw httpError(404, 'staff_not_found', 'Staff not found');
  }

  res.json({ message: 'Staff updated', data: staff });
});

const deactivateStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const staff = await User.findOneAndUpdate(
    { _id: staffId, role: USER_ROLES.STAFF },
    { status: USER_STATUS.INACTIVE },
    { new: true, projection: '-passwordHash' }
  ).lean();

  if (!staff) {
    throw httpError(404, 'staff_not_found', 'Staff not found');
  }

  res.json({ message: 'Staff deactivated', data: staff });
});

const createPackage = asyncHandler(async (req, res) => {
  const data = {
    code: req.body.code,
    name: req.body.name,
    description: req.body.description,
    durationValue: req.body.durationValue,
    durationUnit: req.body.durationUnit,
    price: req.body.price,
    isActive: req.body.isActive ?? true,
    createdBy: req.user.userId,
    updatedBy: req.user.userId
  };

  const pkg = await Package.create(data);
  res.status(201).json({ message: 'Package created', data: pkg });
});

const listPackagesAdmin = asyncHandler(async (req, res) => {
  const packages = await Package.find().sort({ createdAt: -1 }).lean();
  res.json({ data: packages });
});

const updatePackage = asyncHandler(async (req, res) => {
  const { packageId } = req.params;
  const updates = { ...req.body, updatedBy: req.user.userId };
  const pkg = await Package.findByIdAndUpdate(packageId, updates, {
    new: true,
    runValidators: true
  }).lean();

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  res.json({ message: 'Package updated', data: pkg });
});

const deactivatePackage = asyncHandler(async (req, res) => {
  const { packageId } = req.params;
  const pkg = await Package.findByIdAndUpdate(
    packageId,
    { isActive: false, updatedBy: req.user.userId },
    { new: true }
  ).lean();

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  res.json({ message: 'Package deactivated', data: pkg });
});

const listOrdersAdmin = asyncHandler(async (req, res) => {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .populate('memberId', 'fullName email phone')
    .populate('packageId', 'code name price')
    .lean();

  res.json({ data: orders });
});

const listMembersAdmin = asyncHandler(async (req, res) => {
  const members = await User.find({ role: USER_ROLES.MEMBER })
    .select('-passwordHash')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data: members });
});

const dashboardRevenue = asyncHandler(async (req, res) => {
  const { from, to, rangeType, filterType } = resolveDashboardRange(req.query);
  const granularity = getRevenueGranularity(filterType);

  const [summary, grouped] = await Promise.all([
    Invoice.aggregate([
      {
        $match: {
          status: 'paid',
          paidAt: { $gte: from, $lte: to }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$amount' },
          totalInvoices: { $sum: 1 }
        }
      }
    ]),
    Invoice.aggregate([
      {
        $match: {
          status: 'paid',
          paidAt: { $gte: from, $lte: to }
        }
      },
      {
        $group:
          granularity === 'hour'
            ? {
                _id: {
                  hour: { $hour: '$paidAt' }
                },
                totalRevenue: { $sum: '$amount' },
                totalInvoices: { $sum: 1 }
              }
            : granularity === 'week4'
              ? {
                  _id: {
                    weekInMonth: {
                      $min: [
                        4,
                        {
                          $add: [
                            {
                              $floor: {
                                $divide: [
                                  { $subtract: [{ $dayOfMonth: '$paidAt' }, 1] },
                                  7
                                ]
                              }
                            },
                            1
                          ]
                        }
                      ]
                    }
                  },
                  totalRevenue: { $sum: '$amount' },
                  totalInvoices: { $sum: 1 }
                }
            : granularity === 'month'
              ? {
                  _id: {
                    year: { $year: '$paidAt' },
                    month: { $month: '$paidAt' }
                  },
                  totalRevenue: { $sum: '$amount' },
                  totalInvoices: { $sum: 1 }
                }
              : {
                  _id: {
                    year: { $year: '$paidAt' },
                    month: { $month: '$paidAt' },
                    day: { $dayOfMonth: '$paidAt' }
                  },
                  totalRevenue: { $sum: '$amount' },
                  totalInvoices: { $sum: 1 }
                }
      },
      {
        $sort:
          granularity === 'hour'
            ? { '_id.hour': 1 }
            : granularity === 'week4'
              ? { '_id.weekInMonth': 1 }
            : granularity === 'month'
              ? { '_id.year': 1, '_id.month': 1 }
              : { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ])
  ]);

  const normalizedTrend = grouped.map((item) => {
    if (granularity === 'hour') {
      return {
        key: toHourKey(item._id.hour),
        totalRevenue: item.totalRevenue,
        totalInvoices: item.totalInvoices
      };
    }

    if (granularity === 'month') {
      return {
        key: toYearMonthKey(item._id.year, item._id.month),
        totalRevenue: item.totalRevenue,
        totalInvoices: item.totalInvoices
      };
    }

    if (granularity === 'week4') {
      return {
        key: `W${item._id.weekInMonth}`,
        totalRevenue: item.totalRevenue,
        totalInvoices: item.totalInvoices
      };
    }

    return {
      key: toYearMonthDayKey(item._id.year, item._id.month, item._id.day),
      totalRevenue: item.totalRevenue,
      totalInvoices: item.totalInvoices
    };
  });

  const trend = buildRevenueTrendBuckets(normalizedTrend, from, to, granularity);

  res.json({
    data: {
      from,
      to,
      rangeType,
      filterType,
      granularity,
      totalRevenue: summary[0]?.totalRevenue || 0,
      totalInvoices: summary[0]?.totalInvoices || 0,
      trend
    }
  });
});

const dashboardCheckIns = asyncHandler(async (req, res) => {
  const { from, to, filterType } = resolveDashboardRange(req.query);

  const trend = await CheckIn.aggregate([
    {
      $match: {
        checkInAt: { $gte: from, $lte: to },
        status: 'success'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$checkInAt' },
          month: { $month: '$checkInAt' },
          day: { $dayOfMonth: '$checkInAt' }
        },
        total: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);

  res.json({ data: { from, to, filterType, trend } });
});

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  createPackage,
  listPackagesAdmin,
  updatePackage,
  deactivatePackage,
  listOrdersAdmin,
  listMembersAdmin,
  dashboardRevenue,
  dashboardCheckIns
};
