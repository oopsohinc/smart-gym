const Invoice = require('../../models/Invoice');
const CheckIn = require('../../models/CheckIn');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { startOfDay, endOfDay } = require('./_helpers');

/* ───────── Range Resolution ───────── */

function normalizeRangeType(period) {
  const value = String(period || '').trim().toLowerCase();

  const aliasMap = {
    today: 'today', day: 'today', 'hom_nay': 'today', 'hôm_nay': 'today',
    week: 'last7days', last7days: 'last7days', '7days': 'last7days', '7_days': 'last7days',
    month: 'thisMonth', thismonth: 'thisMonth', 'thang_nay': 'thisMonth', 'tháng_này': 'thisMonth',
    year: 'thisYear', thisyear: 'thisYear', 'nam_nay': 'thisYear', 'năm_này': 'thisYear',
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
    return { from: startOfDay(from), to: endOfDay(now), rangeType: 'week', filterType: 'last7days' };
  }

  if (normalizedType === 'thisYear') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from, to: endOfDay(now), rangeType: 'year', filterType: 'thisYear' };
  }

  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: endOfDay(now), rangeType: 'month', filterType: 'thisMonth' };
}

function getRevenueGranularity(filterType) {
  if (filterType === 'today') return 'hour';
  if (filterType === 'thisMonth') return 'week4';
  if (filterType === 'thisYear') return 'month';
  return 'day';
}

/* ───────── Trend Bucket Builders ───────── */

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

/* ───────── Handlers ───────── */

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
                _id: { hour: { $hour: '$paidAt' } },
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
  dashboardRevenue,
  dashboardCheckIns
};
