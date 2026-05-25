const mongoose = require('mongoose');

const workoutPlanSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    aiAnalysis: { type: mongoose.Schema.Types.Mixed, default: {} },
    planData: { type: [mongoose.Schema.Types.Mixed], default: [] },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

workoutPlanSchema.index({ memberId: 1, isActive: 1 });
workoutPlanSchema.index({ memberId: 1, createdAt: -1 });

module.exports = mongoose.model('WorkoutPlan', workoutPlanSchema);