const express = require('express');
const { addKnowledge, askAssistant } = require('../controllers/rag/rag.controller');
const { authenticate } = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');

const router = express.Router();

router.post('/knowledge', authenticate, authorize('admin.*'), addKnowledge);
router.post('/ask', askAssistant);

module.exports = router;