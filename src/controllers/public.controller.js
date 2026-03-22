const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Package = require('../models/Package');
const { USER_ROLES, USER_STATUS } = require('../constants/enums');
const { createAccessToken, createRefreshToken, verifyRefreshToken } = require('../services/token.service');
const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');

const register = asyncHandler(async (req, res) => {
  const { fullName, email, phone, password } = req.body;

  if (!fullName || !email || !phone || !password) {
    throw httpError(400, 'invalid_input', 'fullName, email, phone and password are required');
  }

  const existed = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone }] }).lean();
  if (existed) {
    throw httpError(409, 'user_exists', 'Email or phone already exists');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    fullName,
    email: email.toLowerCase(),
    phone,
    passwordHash,
    role: USER_ROLES.MEMBER,
    status: USER_STATUS.ACTIVE
  });

  res.status(201).json({
    message: 'Register successful',
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    throw httpError(400, 'invalid_input', 'identifier and password are required');
  }

  const user = await User.findOne({
    $or: [{ email: String(identifier).toLowerCase() }, { phone: identifier }]
  });

  if (!user) {
    throw httpError(401, 'invalid_credentials', 'Invalid credentials');
  }

  const isMatched = await bcrypt.compare(password, user.passwordHash);
  if (!isMatched) {
    throw httpError(401, 'invalid_credentials', 'Invalid credentials');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw httpError(403, 'user_inactive', 'Account is inactive');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  res.json({
    message: 'Login successful',
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) {
    throw httpError(400, 'invalid_input', 'refreshToken is required');
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    throw httpError(401, 'invalid_refresh_token', 'Refresh token is invalid');
  }

  const user = await User.findById(payload.sub).select('_id role status');
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    throw httpError(401, 'invalid_refresh_token', 'Refresh token is invalid');
  }

  res.json({
    accessToken: createAccessToken(user)
  });
});

const listActivePackages = asyncHandler(async (req, res) => {
  const packages = await Package.find({ isActive: true })
    .select('code name description durationValue durationUnit price')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data: packages });
});

module.exports = {
  register,
  login,
  refreshToken,
  listActivePackages
};
