const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const { addDuration, getRemainingDays } = require('../utils/date');
const { env } = require('../config/env');
const { ORDER_STATUS, SUBSCRIPTION_STATUS } = require('../constants/enums');
const { buildVnpayPaymentUrl, verifyVnpReturn, verifyVnpIpn } = require('../services/vnpay.service');
const Package = require('../models/Package');
const Order = require('../models/Order');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');

function buildOrderNo() {
  return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function buildInvoiceNo() {
  return `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function parseVnpPayDate(vnpPayDate) {
  if (!vnpPayDate || vnpPayDate.length !== 14) {
    return new Date();
  }

  const year = Number(vnpPayDate.slice(0, 4));
  const month = Number(vnpPayDate.slice(4, 6)) - 1;
  const day = Number(vnpPayDate.slice(6, 8));
  const hour = Number(vnpPayDate.slice(8, 10));
  const minute = Number(vnpPayDate.slice(10, 12));
  const second = Number(vnpPayDate.slice(12, 14));

  return new Date(year, month, day, hour, minute, second);
}

function buildFrontendRedirectUrl(payload, result, message) {
  if (!env.CLIENT_URL) {
    return null;
  }

  const redirectUrl = new URL('/payments/vnpay/result', env.CLIENT_URL);
  redirectUrl.searchParams.set('result', result);
  redirectUrl.searchParams.set('message', message);

  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined && value !== null && value !== '') {
      redirectUrl.searchParams.set(key, String(value));
    }
  }

  return redirectUrl.toString();
}

function isSuccessfulVnpayResponse(payload) {
  return String(payload.vnp_ResponseCode || '') === '00' && String(payload.vnp_TransactionStatus || '') === '00';
}

async function createSubscriptionForPaidOrder(order, pkg, paidAt) {
  const now = paidAt || new Date();
  const currentSubscription = await Subscription.findOne({
    memberId: order.memberId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    endDate: { $gte: now }
  })
    .sort({ endDate: -1 })
    .select('endDate')
    .lean();

  const hasActiveSubscription = Boolean(currentSubscription?.endDate);
  const startDate = hasActiveSubscription ? new Date(currentSubscription.endDate) : now;
  const endDate = addDuration(startDate, pkg.durationValue, pkg.durationUnit);
  const status = hasActiveSubscription ? SUBSCRIPTION_STATUS.PENDING : SUBSCRIPTION_STATUS.ACTIVE;

  return Subscription.create({
    memberId: order.memberId,
    packageId: order.packageId,
    orderId: order._id,
    startDate,
    endDate,
    status,
    remainingDaysCache: getRemainingDays(endDate)
  });
}

async function buildOrReuseInvoice(order, payload, paidAt, isSuccess) {
  return Invoice.findOneAndUpdate(
    { orderId: order._id },
    {
      $setOnInsert: {
        invoiceNo: buildInvoiceNo()
      },
      $set: {
        memberId: order.memberId,
        packageId: order.packageId,
        amount: order.amount,
        paymentMethod: 'vnpay',
        paymentProvider: 'vnpay',
        status: isSuccess ? 'paid' : 'failed',
        transactionRef: payload.vnp_TxnRef,
        transactionNo: payload.vnp_TransactionNo,
        paidAt,
        gatewayPayload: payload
      }
    },
    {
      new: true,
      upsert: true,
      runValidators: true
    }
  );
}

async function finalizeVnpayPayment(payload) {
  const verified = verifyVnpReturn(payload);

  if (!verified.isVerified) {
    return {
      code: '97',
      message: 'Invalid signature',
      success: false
    };
  }

  const order = await Order.findOne({ orderNo: verified.vnp_TxnRef });
  if (!order) {
    return {
      code: '01',
      message: 'Order not found',
      success: false
    };
  }

  const amountFromGateway = Number(verified.vnp_Amount || 0);
  if (amountFromGateway !== Number(order.amount)) {
    return {
      code: '04',
      message: 'Amount mismatch',
      success: false,
      order
    };
  }

  const existingInvoice = await Invoice.findOne({ orderId: order._id });

  if (order.status === ORDER_STATUS.APPROVED || existingInvoice?.status === 'paid') {
    const paidAt = parseVnpPayDate(verified.vnp_PayDate);
    const existingSubscription = await Subscription.findOne({ orderId: order._id });

    if (existingInvoice && existingSubscription) {
      return {
        code: '02',
        message: 'Order already confirmed',
        success: true,
        order,
        invoice: existingInvoice,
        subscription: existingSubscription
      };
    }

    const pkg = await Package.findById(order.packageId)
      .select('_id durationValue durationUnit')
      .lean();

    if (!pkg) {
      throw httpError(404, 'package_not_found', 'Package not found');
    }

    const subscription = existingSubscription || await createSubscriptionForPaidOrder(order, pkg, paidAt);
    const invoice = existingInvoice || await buildOrReuseInvoice(order, verified, paidAt, true);

    return {
      code: '02',
      message: 'Order already confirmed',
      success: true,
      order,
      invoice,
      subscription
    };
  }

  const paidAt = parseVnpPayDate(verified.vnp_PayDate);
  const isSuccess = isSuccessfulVnpayResponse(verified);

  order.status = isSuccess ? ORDER_STATUS.APPROVED : ORDER_STATUS.REJECTED;
  await order.save();

  const invoice = await buildOrReuseInvoice(order, verified, paidAt, isSuccess);

  if (!isSuccess) {
    return {
      code: String(verified.vnp_ResponseCode || '99'),
      message: 'Payment failed',
      success: false,
      order,
      invoice
    };
  }

  const pkg = await Package.findById(order.packageId)
    .select('_id durationValue durationUnit')
    .lean();

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  let subscription = await Subscription.findOne({ orderId: order._id });
  if (!subscription) {
    subscription = await createSubscriptionForPaidOrder(order, pkg, paidAt);
  }

  return {
    code: '00',
    message: 'Payment confirmed',
    success: true,
    order,
    invoice,
    subscription
  };
}

const createVnpayPayment = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { packageId, type = 'new_purchase', orderInfo } = req.body;

  if (!packageId) {
    throw httpError(400, 'invalid_input', 'packageId is required');
  }

  const pkg = await Package.findOne({ _id: packageId, isActive: true })
    .select('_id code name durationValue durationUnit price')
    .lean();

  if (!pkg) {
    throw httpError(404, 'package_not_found', 'Package not found');
  }

  const orderNo = buildOrderNo();
  const order = await Order.create({
    orderNo,
    memberId,
    packageId,
    type,
    amount: pkg.price,
    status: ORDER_STATUS.PENDING,
    note: orderInfo || `Thanh toan goi ${pkg.code}`
  });

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 1);
  const returnUrl = env.VNP_RETURN_URL || `${req.protocol}://${req.get('host')}/api/payments/vnpay/return`;

  const paymentResult = buildVnpayPaymentUrl({
    amount: order.amount,
    orderInfo: order.note,
    orderType: 'other',
    txnRef: order.orderNo,
    ipAddr: req.ip,
    returnUrl,
    expireDate: expiryDate
  });

  res.status(201).json({
    message: 'VnPay payment created',
    data: {
      order,
      paymentUrl: paymentResult.paymentUrl
    }
  });
});

const handleVnpayReturn = asyncHandler(async (req, res) => {
  const payload = { ...req.query };
  const result = await finalizeVnpayPayment(payload);

  const redirectUrl = buildFrontendRedirectUrl(payload, result.success ? 'success' : 'failed', result.message);
  if (redirectUrl) {
    return res.redirect(redirectUrl);
  }

  return res.status(result.success ? 200 : 400).json({
    message: result.message,
    data: result
  });
});

const handleVnpayIpn = asyncHandler(async (req, res) => {
  const payload = Object.keys(req.body || {}).length ? req.body : req.query;
  const verified = verifyVnpIpn(payload);

  if (!verified.isVerified) {
    return res.status(200).json({
      RspCode: '97',
      Message: 'Fail checksum'
    });
  }

  const result = await finalizeVnpayPayment(payload);

  return res.status(200).json({
    RspCode: result.code,
    Message: result.message
  });
});

module.exports = {
  createVnpayPayment,
  handleVnpayReturn,
  handleVnpayIpn
};
