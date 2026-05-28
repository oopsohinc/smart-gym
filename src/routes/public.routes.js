const express = require('express');
const { register, login, refreshToken, forgotPassword, resetPassword } = require('../controllers/auth/auth.controller');
const { listActivePackages } = require('../controllers/public/packages.controller');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/auth/register', authLimiter, register);
router.post('/auth/login', authLimiter, login);
router.post('/auth/refresh', authLimiter, refreshToken);
router.post('/auth/forgot-password', authLimiter, forgotPassword);
router.post('/auth/reset-password', authLimiter, resetPassword);
router.get('/packages', listActivePackages);

module.exports = router;
