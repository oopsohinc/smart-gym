const { asyncHandler } = require('../utils/asyncHandler');
const { httpError } = require('../utils/httpError');
const WorkoutPlan = require('../models/WorkoutPlan');

const createWorkoutPlan = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { aiAnalysis = {}, planData = [], isActive = true } = req.body;

  if (!Array.isArray(planData) || planData.length === 0) {
    throw httpError(400, 'invalid_input', 'planData must be a non-empty array');
  }

  if (isActive) {
    await WorkoutPlan.updateMany({ memberId, isActive: true }, { $set: { isActive: false } });
  }

  const plan = await WorkoutPlan.create({
    memberId,
    aiAnalysis,
    planData,
    isActive: Boolean(isActive)
  });

  res.status(201).json({
    message: 'Workout plan created',
    data: plan
  });
});

const listWorkoutPlans = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const plans = await WorkoutPlan.find({ memberId })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ data: plans });
});

const getActiveWorkoutPlan = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const plan = await WorkoutPlan.findOne({ memberId, isActive: true })
    .sort({ updatedAt: -1 })
    .lean();

  res.json({ data: plan || null });
});

const activateWorkoutPlan = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { planId } = req.params;

  const plan = await WorkoutPlan.findOne({ _id: planId, memberId });
  if (!plan) {
    throw httpError(404, 'workout_plan_not_found', 'Workout plan not found');
  }

  await WorkoutPlan.updateMany({ memberId, isActive: true }, { $set: { isActive: false } });
  plan.isActive = true;
  await plan.save();

  res.json({
    message: 'Workout plan activated',
    data: plan
  });
});

module.exports = {
  createWorkoutPlan,
  listWorkoutPlans,
  getActiveWorkoutPlan,
  activateWorkoutPlan
};