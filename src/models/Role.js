const mongoose = require('mongoose');
const { ALL_PERMISSIONS } = require('../constants/permissions');

function validatePermission(permission) {
  if (typeof permission !== 'string') return false;

  // Check exact match
  if (ALL_PERMISSIONS.includes(permission)) return true;

  // Check wildcard match: 'admin.*' matches 'admin.users.view', etc.
  const wildcardPattern = permission.replace(/\*/g, '.*');
  const regex = new RegExp(`^${wildcardPattern}$`);
  return ALL_PERMISSIONS.some((perm) => regex.test(perm));
}

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    description: {
      type: String,
      trim: true
    },
    permissions: {
      type: [String],
      required: true,
      validate: {
        validator(perms) {
          if (!Array.isArray(perms) || perms.length === 0) {
            return false;
          }
          return perms.every((perm) => validatePermission(perm));
        },
        message: (props) => {
          const invalidPerms = props.value.filter((p) => !validatePermission(p));
          return `Invalid permissions: ${invalidPerms.join(', ')}. Must be valid permissions or wildcard patterns.`;
        }
      }
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Role', roleSchema);
