const express = require('express');
const multer = require('multer');
const {
  createOrderRequest,
  getProfile,
  updateProfile,
  updatePassword,
  getSubscriptionStatus,
  activatePendingSubscription,
  generateQr,
  getCheckInHistory
} = require('../controllers/member.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { USER_ROLES } = require('../constants/enums');
const { qrGenerateLimiter } = require('../middleware/rateLimiter');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/receipts');
  },
  filename(req, file, cb) {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});

const upload = multer({ storage });

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.MEMBER));

router.post('/orders', upload.single('receipt'), createOrderRequest);
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.patch('/password', updatePassword);
router.get('/subscription/status', getSubscriptionStatus);
router.post('/subscriptions/:subscriptionId/activate', activatePendingSubscription);
router.get('/qr-generate', qrGenerateLimiter, generateQr);
router.get('/checkins', getCheckInHistory);

module.exports = router;
