const express = require('express');
const {
  createVnpayPayment,
  handleVnpayReturn,
  handleVnpayIpn
} = require('../controllers/payment.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.post('/vnpay/create', authenticate, authorize('member.*'), createVnpayPayment);
router.get('/vnpay/return', handleVnpayReturn);
router.get('/vnpay/ipn', handleVnpayIpn);
router.post('/vnpay/ipn', handleVnpayIpn);

module.exports = router;
