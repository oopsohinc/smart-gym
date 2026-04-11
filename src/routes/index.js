const express = require('express');
const publicRoutes = require('./public.routes');
const memberRoutes = require('./member.routes');
const staffRoutes = require('./staff.routes');
const adminRoutes = require('./admin.routes');
const paymentRoutes = require('./payment.routes');

const router = express.Router();

router.use('/api', publicRoutes);
router.use('/api/member', memberRoutes);
router.use('/api/staff', staffRoutes);
router.use('/api/admin', adminRoutes);
router.use('/api/payments', paymentRoutes);

module.exports = router;
