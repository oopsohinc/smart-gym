const express = require('express');
const {
  listStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  createPackage,
  listPackagesAdmin,
  updatePackage,
  deactivatePackage,
  listOrdersAdmin,
  listMembersAdmin,
  dashboardRevenue,
  dashboardCheckIns
} = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const { USER_ROLES } = require('../constants/enums');

const router = express.Router();

router.use(authenticate, authorize(USER_ROLES.ADMIN));

router.get('/staff', listStaff);
router.post('/staff', createStaff);
router.patch('/staff/:staffId', updateStaff);
router.delete('/staff/:staffId', deactivateStaff);

router.post('/packages', createPackage);
router.get('/packages', listPackagesAdmin);
router.patch('/packages/:packageId', updatePackage);
router.delete('/packages/:packageId', deactivatePackage);

router.get('/orders', listOrdersAdmin);
router.get('/members', listMembersAdmin);

router.get('/dashboard/revenue', dashboardRevenue);
router.get('/dashboard/checkins', dashboardCheckIns);

module.exports = router;
