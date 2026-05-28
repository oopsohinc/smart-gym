const Package = require('../../models/Package');
const Order = require('../../models/Order');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { buildOrderNo } = require('../../utils/orderHelpers');
const { ORDER_STATUS } = require('../../constants/enums');

const createOrderRequest = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { packageId, type = 'new_purchase', paymentMethod = 'bank_transfer' } = req.body;

  if (!packageId) {
    throw httpError(400, 'invalid_input', 'packageId là bắt buộc');
  }

  if (paymentMethod === 'vnpay') {
    throw httpError(400, 'invalid_payment_method', 'Vui lòng dùng /api/payments/vnpay/create để thanh toán qua VNPay');
  }

  // ── Ràng buộc: Chặn nếu member đang có đơn tiền mặt chưa thanh toán ──
  const pendingCashOrder = await Order.findOne({
    memberId,
    status: ORDER_STATUS.PENDING,
    paymentMethod: { $in: ['cash', 'bank_transfer', null, undefined] },
    paymentProvider: { $ne: 'vnpay' }
  }).lean();

  if (pendingCashOrder) {
    throw httpError(
      409,
      'pending_order_exists',
      'Bạn đang có đơn hàng chờ thanh toán. Vui lòng hoàn tất trước khi mua mới.'
    );
  }

  const pkg = await Package.findById(packageId).select('_id price').lean();
  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Không tìm thấy gói tập');
  }

  const order = await Order.create({
    orderNo: buildOrderNo(),
    memberId,
    packageId,
    type,
    amount: pkg.price,
    status: ORDER_STATUS.PENDING
  });

  res.status(201).json({
    message: 'Tạo yêu cầu đăng ký gói tập thành công',
    data: order
  });
});

module.exports = {
  createOrderRequest
};
