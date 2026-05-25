const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const { parsePagination, buildPaginationMeta } = require('../utils/pagination');
const { USER_ROLES, USER_STATUS, ORDER_STATUS } = require('../constants/enums');
const User = require('../models/User');
const Role = require('../models/Role');
const Package = require('../models/Package');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const CheckIn = require('../models/CheckIn');
const auditService = require('../services/auditService');

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

function getPathValue(source, path) {
  return String(path)
    .split('.')
    .reduce((value, segment) => (value == null ? value : value[segment]), source);
}

function buildAuditDiff(originalValues, doc, modifiedPaths) {
  const oldValues = {};
  const newValues = {};

  for (const path of modifiedPaths) {
    if (path === 'updatedAt' || path === '__v') {
      continue;
    }

    oldValues[path] = getPathValue(originalValues, path);
    newValues[path] = doc.get(path);
  }

  return { oldValues, newValues };
}

function buildSearchRegex(value) {
  const keyword = String(value || '').trim();
  if (!keyword) {
    return null;
  }

  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escapedKeyword, 'i');
}

function normalizeDateRange(query) {
  const fromValue = query.from || query.createdFrom;
  const toValue = query.to || query.createdTo;

  const hasFrom = String(fromValue || '').trim() !== '';
  const hasTo = String(toValue || '').trim() !== '';

  if (!hasFrom && !hasTo) {
    return null;
  }

  const from = hasFrom ? startOfDay(new Date(fromValue)) : null;
  const to = hasTo ? endOfDay(new Date(toValue)) : null;

  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    throw httpError(400, 'invalid_input', 'from and to must be valid dates');
  }

  if (from && to && from > to) {
    throw httpError(400, 'invalid_input', 'from must be less than or equal to to');
  }

  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return range;
}

async function findMemberIdsByKeyword(keywordRegex, fields = ['fullName', 'email', 'phone']) {
  if (!keywordRegex) {
    return [];
  }

  const members = await User.find({
    $and: [await buildRoleQuery(USER_ROLES.MEMBER), { $or: fields.map((field) => ({ [field]: keywordRegex })) }]
  })
    .select('_id')
    .lean();

  return members.map((member) => member._id);
}

function applyStatusFilter(filters, query, allowedStatuses, fieldName = 'status') {
  const value = String(query[fieldName] || query.status || query.paymentStatus || '').trim();

  if (!value) {
    return;
  }

  if (!allowedStatuses.includes(value)) {
    throw httpError(400, 'invalid_input', `${fieldName} is invalid`);
  }

  filters[fieldName] = value;
}

function applyPackageFilter(filters, query) {
  const packageId = String(query.packageId || '').trim();

  if (!packageId) {
    return;
  }

  if (!mongoose.Types.ObjectId.isValid(packageId)) {
    throw httpError(400, 'invalid_input', 'packageId is invalid');
  }

  filters.packageId = packageId;
}

async function getRoleIdByName(name) {
  const role = await Role.findOne({ name: String(name).toLowerCase(), isActive: true })
    .select('_id')
    .lean();

  return role?._id || null;
}

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDurationUnit(value) {
  const normalized = stripDiacritics(value).trim().toLowerCase();

  const aliasMap = {
    d: 'day',
    day: 'day',
    days: 'day',
    ngay: 'day',
    ngays: 'day',
    m: 'month',
    mo: 'month',
    mon: 'month',
    month: 'month',
    months: 'month',
    thang: 'month',
    y: 'year',
    yr: 'year',
    year: 'year',
    years: 'year',
    nam: 'year'
  };

  return aliasMap[normalized] || null;
}

function generatePackageCode(name) {
  const slug =
    stripDiacritics(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'package';

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  return `PKG-${slug}-${suffix}`.toUpperCase();
}

function parseDurationInput(reqBody) {
  const durationValueInput =
    reqBody.durationValue ?? reqBody.duration?.value ?? reqBody.duration?.durationValue ?? reqBody.duration?.amount;
  const durationUnitInput = reqBody.durationUnit ?? reqBody.duration?.unit ?? reqBody.duration?.durationUnit;
  const durationInput = reqBody.duration;

  let durationValue = durationValueInput;
  let durationUnit = durationUnitInput;

  if (durationInput !== undefined && durationInput !== null && String(durationInput).trim() !== '') {
    if (typeof durationInput === 'number') {
      durationValue = durationInput;
    } else if (typeof durationInput === 'object' && !Array.isArray(durationInput)) {
      durationValue = durationInput.value ?? durationInput.durationValue ?? durationInput.amount ?? durationValue;
      durationUnit = durationInput.unit ?? durationInput.durationUnit ?? durationUnit;
    } else if (typeof durationInput === 'string') {
      const text = durationInput.trim();
      const match = text.match(/^(\d+(?:\.\d+)?)\s*([\p{L}]+)?$/u);

      if (match) {
        durationValue = durationValue ?? match[1];
        durationUnit = durationUnit ?? match[2];
      }
    }
  }

  const normalizedValue = Number(durationValue);
  const normalizedUnit = normalizeDurationUnit(durationUnit);

  if (!Number.isFinite(normalizedValue) || normalizedValue < 1) {
    throw httpError(400, 'invalid_input', 'Duration value must be a number greater than or equal to 1');
  }

  if (!normalizedUnit) {
    throw httpError(400, 'invalid_input', 'Duration unit must be day, month, or year');
  }

  return {
    durationValue: normalizedValue,
    durationUnit: normalizedUnit
  };
}

function parsePriceInput(value) {
  const normalizedPrice = Number(value);

  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
    throw httpError(400, 'invalid_input', 'Price must be a valid number greater than or equal to 0');
  }

  return normalizedPrice;
}

async function buildRoleQuery(name) {
  const roleId = await getRoleIdByName(name);
  return roleId ? { roleId } : { roleId: null };
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
  const { page, limit, skip } = parsePagination(req.query);
  const filters = await buildRoleQuery(USER_ROLES.STAFF);
  const keywordRegex = buildSearchRegex(req.query.q);

  if (keywordRegex) {
    filters.$or = [{ fullName: keywordRegex }, { email: keywordRegex }, { phone: keywordRegex }];
  }

  const status = String(req.query.status || '').trim();
  if (status) {
    if (![USER_STATUS.ACTIVE, USER_STATUS.INACTIVE].includes(status)) {
      throw httpError(400, 'invalid_input', 'status must be active or inactive');
    }
    filters.status = status;
  }

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

const createStaff = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;
  if (!fullName || !email || !phone || !password) {
    throw httpError(400, 'invalid_input', 'fullName, email, phone and password are required');
  }

  const existed = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] }).lean();
  if (existed) {
    throw httpError(409, 'user_exists', 'Email or phone already exists');
  }

  const staffRole = await Role.findOne({ name: USER_ROLES.STAFF, isActive: true })
    .select('_id name permissions')
    .lean();

  if (!staffRole) {
    throw httpError(500, 'role_not_found', 'Default staff role not configured');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await User.create({
    fullName,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    roleId: staffRole._id,
    status: USER_STATUS.ACTIVE
  });

  res.status(201).json({
    message: 'Staff account created',
    data: {
      id: staff._id,
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      roleId: staff.roleId,
      role: staffRole.name,
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
    {
      _id: staffId,
      ...(await buildRoleQuery(USER_ROLES.STAFF))
    },
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
    {
      _id: staffId,
      ...(await buildRoleQuery(USER_ROLES.STAFF))
    },
    { status: USER_STATUS.INACTIVE },
    { new: true, projection: '-passwordHash' }
  ).lean();

  if (!staff) {
    throw httpError(404, 'staff_not_found', 'Staff not found');
  }

  res.json({ message: 'Staff deactivated', data: staff });
});

const createPackage = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();

  if (!name) {
    throw httpError(400, 'invalid_input', 'Package name is required');
  }

  const { durationValue, durationUnit } = parseDurationInput(req.body);
  const price = parsePriceInput(req.body.price);
  const code = String(req.body.code || '').trim() || generatePackageCode(name);

  const data = {
    code,
    name,
    description: req.body.description,
    durationValue,
    durationUnit,
    price,
    isActive: req.body.isActive ?? true,
    createdBy: req.user.userId,
    updatedBy: req.user.userId
  };

  const pkg = await Package.create(data);
  res.status(201).json({ message: 'Package created', data: pkg });
});

const listPackagesAdmin = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = {};

  if (keywordRegex) {
    filters.name = keywordRegex;
  }

  const [total, data] = await Promise.all([
    Package.countDocuments(filters),
    Package.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  ]);

  res.json({ data, pagination: buildPaginationMeta(total, page, limit) });
});

const updatePackage = asyncHandler(async (req, res) => {
  const { packageId } = req.params;
  const pkg = await Package.findById(packageId);

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  const originalValues = pkg.toObject({ depopulate: true });
  const allowedFields = ['code', 'name', 'description', 'durationValue', 'durationUnit', 'price', 'isActive'];

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      pkg.set(field, req.body[field]);
    }
  }

  pkg.set('updatedBy', req.user.userId);

  const modifiedPaths = pkg.modifiedPaths();
  await pkg.save();

  const { oldValues, newValues } = buildAuditDiff(originalValues, pkg, modifiedPaths);

  if (Object.keys(newValues).length > 0) {
    await auditService.logAction(req.user.userId, 'update', 'Package', pkg._id, oldValues, newValues);
  }

  res.json({ message: 'Package updated', data: pkg });
});

const voidOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);

  if (!order) {
    throw httpError(404, 'order_not_found', 'Order not found');
  }

  if (order.status === ORDER_STATUS.VOIDED) {
    res.json({ message: 'Order already voided', data: order });
    return;
  }

  const originalValues = order.toObject({ depopulate: true });
  order.set('status', ORDER_STATUS.VOIDED);

  const modifiedPaths = order.modifiedPaths();
  await order.save();

  const { oldValues, newValues } = buildAuditDiff(originalValues, order, modifiedPaths);
  await auditService.logAction(req.user.userId, 'void', 'Order', order._id, oldValues, newValues);

  res.json({ message: 'Order voided', data: order });
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

const listMembersAdmin = asyncHandler(async (req, res) => {
  const keywordRegex = buildSearchRegex(req.query.q);
  const filters = await buildRoleQuery(USER_ROLES.MEMBER);

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
  listInvoicesAdmin,
  dashboardRevenue,
  dashboardCheckIns,
  voidOrder
};
