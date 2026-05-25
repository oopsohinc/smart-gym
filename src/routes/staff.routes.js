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
const { PERMISSIONS } = require('../constants/permissions');
const { qrScanLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(authenticate);

router.post('/checkin/qr', authorize(PERMISSIONS.STAFF.CHECKIN_SCAN, PERMISSIONS.ADMIN.DASHBOARD_VIEW), qrScanLimiter, scanQrCheckIn);
router.post('/checkin/manual', authorize(PERMISSIONS.STAFF.CHECKIN_MANUAL, PERMISSIONS.ADMIN.DASHBOARD_VIEW), manualCheckIn);
router.get('/orders/pending', authorize(PERMISSIONS.STAFF.ORDERS_VIEW, PERMISSIONS.ADMIN.DASHBOARD_VIEW), listPendingOrders);
router.post('/orders/:orderId/approve', authorize(PERMISSIONS.STAFF.ORDERS_APPROVE, PERMISSIONS.ADMIN.DASHBOARD_VIEW), approveOrder);
router.post('/orders/:orderId/reject', authorize(PERMISSIONS.STAFF.ORDERS_REJECT, PERMISSIONS.ADMIN.DASHBOARD_VIEW), rejectOrder);
router.post('/orders/counter-sale', authorize(PERMISSIONS.STAFF.COUNTER_SALE, PERMISSIONS.ADMIN.DASHBOARD_VIEW), counterSale);
router.get('/members', authorize(PERMISSIONS.STAFF.MEMBERS_VIEW, PERMISSIONS.ADMIN.DASHBOARD_VIEW), listMembers);

module.exports = router;
