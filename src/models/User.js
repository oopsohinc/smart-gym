const mongoose = require('mongoose');
const { USER_ROLES, USER_STATUS } = require('../constants/enums');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.MEMBER,
      index: true
    },
    avatarUrl: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true
    },
    lastLoginAt: { type: Date }
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
