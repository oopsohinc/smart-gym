const Package = require('../../models/Package');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { parsePagination, buildPaginationMeta } = require('../../utils/pagination');
const { buildSearchRegex } = require('../../utils/queryHelpers');

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDurationUnit(value) {
  const normalized = stripDiacritics(value).trim().toLowerCase();

  const aliasMap = {
    d: 'day', day: 'day', days: 'day', ngay: 'day', ngays: 'day',
    m: 'month', mo: 'month', mon: 'month', month: 'month', months: 'month', thang: 'month',
    y: 'year', yr: 'year', year: 'year', years: 'year', nam: 'year'
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
    throw httpError(400, 'invalid_input', 'Thời hạn gói phải là số nguyên dương lớn hơn hoặc bằng 1');
  }

  if (!normalizedUnit) {
    throw httpError(400, 'invalid_input', 'Đơn vị thời hạn phải là: ngày (day), tháng (month) hoặc năm (year)');
  }

  return {
    durationValue: normalizedValue,
    durationUnit: normalizedUnit
  };
}

function parsePriceInput(value) {
  const normalizedPrice = Number(value);

  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
    throw httpError(400, 'invalid_input', 'Giá gói phải là số hợp lệ và lớn hơn hoặc bằng 0');
  }

  return normalizedPrice;
}

const createPackage = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();

  if (!name) {
    throw httpError(400, 'invalid_input', 'Tên gói tập là bắt buộc');
  }

  const { durationValue, durationUnit } = parseDurationInput(req.body);
  const price = parsePriceInput(req.body.price);
  const code = String(req.body.code || '').trim() || generatePackageCode(name);

  // Kiểm tra trùng lặp tên hoặc mã gói trong CSDL
  const duplicateQuery = { $or: [{ name }] };
  if (req.body.code && String(req.body.code).trim()) {
    duplicateQuery.$or.push({ code });
  }

  const existingPackage = await Package.findOne(duplicateQuery).lean();
  if (existingPackage) {
    const isDuplicateName = existingPackage.name === name;
    throw httpError(
      409,
      'package_exists',
      isDuplicateName
        ? `Gói tập với tên "${name}" đã tồn tại trong hệ thống`
        : `Mã gói "${code}" đã được sử dụng bởi gói khác`
    );
  }

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
  res.status(201).json({ message: 'Tạo gói tập thành công', data: pkg });
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
    throw httpError(404, 'package_not_found', 'Không tìm thấy gói tập');
  }

  // ── Ràng buộc 1: Không cho sửa gói đã vô hiệu hóa (trừ khi đang kích hoạt lại) ──
  const isReactivating = req.body.isActive === true || req.body.isActive === 'true';
  if (!pkg.isActive && !isReactivating) {
    throw httpError(
      409,
      'package_inactive',
      'Gói tập đã bị vô hiệu hóa. Vui lòng kích hoạt lại trước khi chỉnh sửa.'
    );
  }

  // ── Ràng buộc 2: Kiểm tra trùng tên / mã với gói khác ──
  const newName = req.body.name !== undefined ? String(req.body.name).trim() : null;
  const newCode = req.body.code !== undefined ? String(req.body.code).trim() : null;

  if (newName || newCode) {
    const orClauses = [];
    if (newName) orClauses.push({ name: newName });
    if (newCode) orClauses.push({ code: newCode });

    const conflict = await Package.findOne({
      _id: { $ne: packageId },   // loại trừ chính gói này
      $or: orClauses
    }).lean();

    if (conflict) {
      const isDuplicateName = newName && conflict.name === newName;
      throw httpError(
        409,
        'package_exists',
        isDuplicateName
          ? `Gói tập với tên "${newName}" đã tồn tại trong hệ thống`
          : `Mã gói "${newCode}" đã được sử dụng bởi gói khác`
      );
    }
  }

  // ── Ràng buộc 3: Không đổi thời hạn nếu gói đang có subscription active ──
  const isDurationChanging =
    (req.body.durationValue !== undefined && Number(req.body.durationValue) !== pkg.durationValue) ||
    (req.body.durationUnit  !== undefined && req.body.durationUnit !== pkg.durationUnit);

  if (isDurationChanging) {
    const Subscription = require('../../models/Subscription');
    const activeSubCount = await Subscription.countDocuments({
      packageId,
      status: 'active',
      endDate: { $gte: new Date() }
    });

    if (activeSubCount > 0) {
      throw httpError(
        409,
        'package_has_active_subscriptions',
        `Không thể thay đổi thời hạn gói vì hiện có ${activeSubCount} hội viên đang sử dụng gói này`
      );
    }
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

  res.json({ message: 'Cập nhật gói tập thành công', data: pkg });
});

const deactivatePackage = asyncHandler(async (req, res) => {
  const { packageId } = req.params;
  const pkg = await Package.findByIdAndUpdate(
    packageId,
    { isActive: false, updatedBy: req.user.userId },
    { new: true }
  ).lean();

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Không tìm thấy gói tập');
  }

  res.json({ message: 'Vô hiệu hóa gói tập thành công', data: pkg });
});

const deletePackage = asyncHandler(async (req, res) => {
  const { packageId } = req.params;

  const pkg = await Package.findById(packageId).lean();
  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Không tìm thấy gói tập');
  }

  // Không cho phép xóa gói đang được sử dụng bởi đơn hàng hoặc subscription
  const Order = require('../../models/Order');
  const Subscription = require('../../models/Subscription');

  const [linkedOrders, linkedSubscriptions] = await Promise.all([
    Order.countDocuments({ packageId }),
    Subscription.countDocuments({ packageId })
  ]);

  if (linkedOrders > 0 || linkedSubscriptions > 0) {
    throw httpError(
      409,
      'package_in_use',
      `Không thể xóa gói tập này vì đang được liên kết với ${linkedOrders} đơn hàng và ${linkedSubscriptions} lịch đăng ký`
    );
  }

  await Package.findByIdAndDelete(packageId);

  res.json({ message: 'Xóa gói tập thành công', data: pkg });
});

module.exports = {
  createPackage,
  listPackagesAdmin,
  updatePackage,
  deactivatePackage,
  deletePackage
};
