const CheckIn = require('../../models/CheckIn');
const { asyncHandler } = require('../../utils/asyncHandler');
const { generateDynamicQrToken } = require('../../services/qr.service');

const generateQr = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const qrData = await generateDynamicQrToken(memberId);

  res.json({
    message: 'Tạo mã QR thành công',
    data: qrData
  });
});

const getCheckInHistory = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const limit = Math.min(100, Number(req.query.limit || 20));
  const page = Math.max(1, Number(req.query.page || 1));

  const [items, total] = await Promise.all([
    CheckIn.find({ memberId })
      .sort({ checkInAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    CheckIn.countDocuments({ memberId })
  ]);

  res.json({
    data: items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  });
});

module.exports = {
  generateQr,
  getCheckInHistory
};
