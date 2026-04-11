const express = require('express');
const { register, login, refreshToken, listActivePackages } = require('../controllers/public.controller');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/auth/register', authLimiter, register);
router.post('/auth/login', authLimiter, login);
router.post('/auth/refresh', authLimiter, refreshToken);
router.get('/packages', listActivePackages);

module.exports = router;
