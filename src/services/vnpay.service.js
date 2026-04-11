const { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } = require('vnpay');
const { env } = require('../config/env');

function resolveVnpayHost() {
  if (!env.VNP_URL) {
    return 'https://sandbox.vnpayment.vn';
  }

  try {
    const parsed = new URL(env.VNP_URL);
    return parsed.origin;
  } catch (error) {
    return 'https://sandbox.vnpayment.vn';
  }
}

function getVnpayClient() {
  return new VNPay({
    tmnCode: env.VNP_TMNCODE,
    secureSecret: env.VNP_HASH_SECRET,
    vnpayHost: resolveVnpayHost(),
    testMode: true,
    hashAlgorithm: 'SHA512',
    loggerFn: ignoreLogger
  });
}

function buildExpireDate(expireDate) {
  if (!expireDate) {
    return undefined;
  }

  return dateFormat(new Date(expireDate), 'yyyyMMddHHmmss');
}

function buildVnpayPaymentUrl({ amount, orderInfo, orderType = ProductCode.Other, txnRef, ipAddr, returnUrl, expireDate, locale = VnpLocale.VN }) {
  const vnpay = getVnpayClient();

  const paymentUrl = vnpay.buildPaymentUrl({
    vnp_Amount: Number(amount),
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: orderType,
    vnp_ReturnUrl: returnUrl || env.VNP_RETURN_URL,
    vnp_Locale: locale,
    vnp_CreateDate: dateFormat(new Date(), 'yyyyMMddHHmmss'),
    vnp_ExpireDate: buildExpireDate(expireDate)
  });

  return {
    paymentUrl,
    params: {
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: orderInfo,
      vnp_Amount: Number(amount) * 100,
      vnp_ReturnUrl: returnUrl || env.VNP_RETURN_URL
    }
  };
}

function verifyVnpReturn(query) {
  return getVnpayClient().verifyReturnUrl(query);
}

function verifyVnpIpn(query) {
  return getVnpayClient().verifyIpnCall(query);
}

module.exports = {
  buildVnpayPaymentUrl,
  verifyVnpReturn,
  verifyVnpIpn
};
