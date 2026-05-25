function isPermissionMatch(requiredPermission, userPermission) {
  if (requiredPermission === userPermission) {
    return true;
  }

  if (requiredPermission.endsWith('.*')) {
    const prefix = requiredPermission.slice(0, -2);
    return userPermission.startsWith(`${prefix}.`);
  }

  if (userPermission.endsWith('.*')) {
    const prefix = userPermission.slice(0, -2);
    return requiredPermission.startsWith(`${prefix}.`);
  }

  return false;
}

function authorize(...allowedPermissions) {
  return (req, res, next) => {
    const userPermissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];

    const hasPermission = allowedPermissions.some((requiredPermission) =>
      userPermissions.some((userPermission) => isPermissionMatch(requiredPermission, userPermission))
    );

    if (!req.user || !hasPermission) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    return next();
  };
}

module.exports = { authorize };
