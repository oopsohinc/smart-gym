const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: missing token' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = {
      userId: payload.sub,
      role: payload.role
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' });
  }
}

module.exports = { authenticate };
