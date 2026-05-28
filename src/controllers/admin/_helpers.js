/**
 * _helpers.js
 * Admin-internal shared utilities used across multiple admin sub-controllers.
 * Not meant to be imported from outside the admin/ folder.
 */
const mongoose = require('mongoose');
const { httpError } = require('../../utils/httpError');
const { buildRoleQuery } = require('../../utils/queryHelpers');
const User = require('../../models/User');

/* ───────── Date Utilities ───────── */

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

/* ───────── Keyword / Filter Helpers ───────── */

async function findMemberIdsByKeyword(keywordRegex, fields = ['fullName', 'email', 'phone']) {
  if (!keywordRegex) {
    return [];
  }

  const members = await User.find({
    $and: [await buildRoleQuery('member'), { $or: fields.map((field) => ({ [field]: keywordRegex })) }]
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

module.exports = {
  startOfDay,
  endOfDay,
  normalizeDateRange,
  findMemberIdsByKeyword,
  applyStatusFilter,
  applyPackageFilter
};
