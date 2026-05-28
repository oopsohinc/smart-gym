const express = require('express');
const { listStaff, createStaff, updateStaff, deactivateStaff, deleteStaff } = require('../controllers/admin/staff.controller');
const { createPackage, listPackagesAdmin, updatePackage, deactivatePackage, deletePackage } = require('../controllers/admin/package.controller');
const { listOrdersAdmin, voidOrder } = require('../controllers/admin/order.controller');
const { listMembersAdmin } = require('../controllers/admin/member.controller');
const { listInvoicesAdmin } = require('../controllers/admin/invoice.controller');
const { listUsersAdmin, updateUserRole } = require('../controllers/admin/user.controller');
const { listRoles, createRole, updateRole, deleteRole, listPermissions } = require('../controllers/admin/role.controller');
const {
  createKnowledgeBase,
  listKnowledgeBases,
  getKnowledgeBaseDetail,
  updateKnowledgeBase,
  deleteKnowledgeBase
} = require('../controllers/admin/knowledgeBase.controller');
const { dashboardRevenue, dashboardCheckIns } = require('../controllers/admin/dashboard.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate, authorize('admin.*'));

router.get('/staff', listStaff);
router.post('/staff', createStaff);
router.patch('/staff/:staffId', updateStaff);
router.delete('/staff/:staffId', deactivateStaff);
router.delete('/staff/:staffId/permanent', deleteStaff);

router.post('/packages', createPackage);
router.get('/packages', listPackagesAdmin);
router.patch('/packages/:packageId', updatePackage);
router.delete('/packages/:packageId', deactivatePackage);
router.delete('/packages/:packageId/permanent', deletePackage);


router.get('/orders', listOrdersAdmin);
router.delete('/orders/:orderId', voidOrder);
router.get('/members', listMembersAdmin);
router.get('/invoices', listInvoicesAdmin);
router.get('/users', listUsersAdmin);
router.patch('/users/:userId/role', updateUserRole);

router.get('/roles', listRoles);
router.get('/permissions', listPermissions);
router.post('/roles', createRole);
router.patch('/roles/:roleId', updateRole);
router.delete('/roles/:roleId', deleteRole);

router.post('/knowledge-bases', createKnowledgeBase);
router.get('/knowledge-bases', listKnowledgeBases);
router.get('/knowledge-bases/:knowledgeBaseId', getKnowledgeBaseDetail);
router.patch('/knowledge-bases/:knowledgeBaseId', updateKnowledgeBase);
router.delete('/knowledge-bases/:knowledgeBaseId', deleteKnowledgeBase);

router.get('/dashboard/revenue', dashboardRevenue);
router.get('/dashboard/checkins', dashboardCheckIns);

module.exports = router;
