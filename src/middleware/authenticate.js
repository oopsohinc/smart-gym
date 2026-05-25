const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const User = require('../models/User');
const { getRoleById } = require('../services/roleCache');

async function resolveUserPermissions(userId, roleIdFromToken) {
  const user = await User.findById(userId)
    .select('roleId status')
    .lean();

  if (!user) {
    return null;
  }

  let roleDoc = await getRoleById(user.roleId);

  if (roleDoc && roleDoc.isActive === false) {
    return null;
  }

  const permissions = Array.isArray(roleDoc?.permissions) ? roleDoc.permissions : [];

  return {
    userId,
    roleId: roleDoc?._id || roleIdFromToken || null,
    roleName: roleDoc?.name || null,
    permissions
  };
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: missing token' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);

    resolveUserPermissions(payload.sub, payload.roleId)
      .then((userContext) => {
        if (!userContext) {
          return res.status(401).json({ message: 'Unauthorized: invalid token' });
        }

        req.user = userContext;
        return next();
      })
      .catch(() => res.status(401).json({ message: 'Unauthorized: invalid token' }));
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: invalid token' });
  }
}

module.exports = { authenticate };
