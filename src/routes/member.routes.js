const express = require('express');
const multer = require('multer');
const { getProfile, updateProfile, updatePassword } = require('../controllers/member/profile.controller');
const { getSubscriptionStatus, activatePendingSubscription } = require('../controllers/member/subscription.controller');
const { generateQr, getCheckInHistory } = require('../controllers/member/checkin.controller');
const { createOrderRequest } = require('../controllers/member/order.controller');
const {
  createWorkoutPlan,
  listWorkoutPlans,
  getActiveWorkoutPlan,
  activateWorkoutPlan,
  generateWorkoutPlan
} = require('../controllers/member/workout.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
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

router.use(authenticate, authorize('member.*'));

router.post('/orders', upload.single('receipt'), createOrderRequest);
router.get('/profile', getProfile);
router.patch('/profile', updateProfile);
router.patch('/password', updatePassword);
router.get('/subscription/status', getSubscriptionStatus);
router.post('/subscriptions/:subscriptionId/activate', activatePendingSubscription);
router.get('/qr-generate', qrGenerateLimiter, generateQr);
router.get('/checkins', getCheckInHistory);
router.post('/workout-plans', createWorkoutPlan);
router.post('/workout-plans/generate', generateWorkoutPlan);
router.get('/workout-plans', listWorkoutPlans);
router.get('/workout-plans/active', getActiveWorkoutPlan);
router.patch('/workout-plans/:planId/activate', activateWorkoutPlan);

module.exports = router;
