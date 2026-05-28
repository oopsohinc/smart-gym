const express = require('express');
const {
  createVnpayPayment,
  createCashPayment,
  handleVnpayReturn,
  handleVnpayIpn
} = require('../controllers/payment/payment.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.post('/vnpay/create', authenticate, authorize('member.*'), createVnpayPayment);
router.post('/cash/create', authenticate, authorize('member.*'), createCashPayment);
router.get('/vnpay/return', handleVnpayReturn);
router.get('/vnpay/ipn', handleVnpayIpn);
router.post('/vnpay/ipn', handleVnpayIpn);

module.exports = router;
