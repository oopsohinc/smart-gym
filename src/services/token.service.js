const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function createAccessToken(user) {
  const payload = {};

  if (user.role) {
    payload.role = String(user.role);
  }

  return jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET,
    {
      subject: String(user._id),
      expiresIn: env.JWT_ACCESS_EXPIRES
    }
  );
}

function createRefreshToken(user) {
  const payload = {};

  if (user.role) {
    payload.role = String(user.role);
  }

  return jwt.sign(
    payload,
    env.JWT_REFRESH_SECRET,
    {
      subject: String(user._id),
      expiresIn: env.JWT_REFRESH_EXPIRES
    }
  );
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

module.exports = { createAccessToken, createRefreshToken, verifyRefreshToken };
