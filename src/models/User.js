const mongoose = require('mongoose');
const { USER_STATUS, FITNESS_GOALS, FITNESS_LEVELS } = require('../constants/enums');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      index: true
    },
    avatarUrl: { type: String },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    healthProfile: {
      height: { type: Number, min: 50, max: 300 },
      weight: { type: Number, min: 10, max: 500 },
      bmi: { type: Number, min: 1, max: 100 }
    },
    fitnessGoal: {
      type: String,
      enum: Object.values(FITNESS_GOALS)
    },
    fitnessLevel: {
      type: String,
      enum: Object.values(FITNESS_LEVELS)
    },
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

userSchema.index({ roleId: 1, status: 1 });

module.exports = mongoose.model('User', userSchema);
