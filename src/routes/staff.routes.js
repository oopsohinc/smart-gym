const express = require('express');
const {
  scanQrCheckIn,
  manualCheckIn,
  listPendingOrders,
  approveOrder,
  rejectOrder,
  counterSale,
  listMembers
} = require('../controllers/staff.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { USER_ROLES } = require('../constants/enums');
const { qrScanLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.STAFF, USER_ROLES.ADMIN));

router.post('/checkin/qr', qrScanLimiter, scanQrCheckIn);
router.post('/checkin/manual', manualCheckIn);
router.get('/orders/pending', listPendingOrders);
router.post('/orders/:orderId/approve', approveOrder);
router.post('/orders/:orderId/reject', rejectOrder);
router.post('/orders/counter-sale', counterSale);
router.get('/members', listMembers);

module.exports = router;
