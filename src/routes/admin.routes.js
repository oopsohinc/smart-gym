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
  voidOrder,
  listMembersAdmin,
  listInvoicesAdmin,
  dashboardRevenue,
  dashboardCheckIns
} = require('../controllers/admin.controller');
const {
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  listPermissions
} = require('../controllers/role.controller');
const {
  createKnowledgeBase,
  listKnowledgeBases,
  getKnowledgeBaseDetail,
  updateKnowledgeBase,
  deleteKnowledgeBase
} = require('../controllers/knowledgeBase.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate, authorize('admin.*'));

router.get('/staff', listStaff);
router.post('/staff', createStaff);
router.patch('/staff/:staffId', updateStaff);
router.delete('/staff/:staffId', deactivateStaff);

router.post('/packages', createPackage);
router.get('/packages', listPackagesAdmin);
router.patch('/packages/:packageId', updatePackage);
router.delete('/packages/:packageId', deactivatePackage);

router.get('/orders', listOrdersAdmin);
router.delete('/orders/:orderId', voidOrder);
router.get('/members', listMembersAdmin);
router.get('/invoices', listInvoicesAdmin);
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
