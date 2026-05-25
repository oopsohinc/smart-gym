function parsePagination(query = {}) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  let limit = parseInt(query.limit, 10) || 10;
  const maxLimit = 50;
  if (!Number.isFinite(limit) || limit <= 0) limit = 10;
  if (limit > maxLimit) limit = maxLimit;
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildPaginationMeta(total, page, limit) {
  const t = Number(total) || 0;
  const totalPages = Math.max(Math.ceil(t / limit), 1);
  return { total: t, page, limit, totalPages };
}

module.exports = { parsePagination, buildPaginationMeta };
