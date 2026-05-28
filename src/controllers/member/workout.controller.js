const WorkoutPlan = require('../../models/WorkoutPlan');
const User = require('../../models/User');
const { asyncHandler } = require('../../utils/asyncHandler');
const { httpError } = require('../../utils/httpError');
const { calculateBmi } = require('../../utils/fitness');
const { generatePlanForMember } = require('../../services/workout.service');

async function deactivateActiveWorkoutPlans(memberId) {
  await WorkoutPlan.updateMany({ memberId, isActive: true }, { $set: { isActive: false } });
}

async function getMemberWorkoutProfile(memberId) {
  const user = await User.findById(memberId)
    .select('fullName fitnessGoal fitnessLevel healthProfile status roleId role')
    .lean();

  if (!user) {
    throw httpError(404, 'user_not_found', 'Không tìm thấy người dùng');
  }

  const healthProfile = {
    ...(user.healthProfile || {})
  };

  if (!Number.isFinite(Number(healthProfile.bmi))) {
    const bmi = calculateBmi(healthProfile.height, healthProfile.weight);
    if (bmi !== null) {
      healthProfile.bmi = bmi;
    }
  }

  if (!user.fitnessGoal) {
    throw httpError(400, 'invalid_input', 'Mục tiêu tập luyện (fitnessGoal) là bắt buộc để tạo lịch tập');
  }

  if (!user.fitnessLevel) {
    throw httpError(400, 'invalid_input', 'Cấp độ thể lực (fitnessLevel) là bắt buộc để tạo lịch tập');
  }

  if (!Number.isFinite(Number(healthProfile.height)) || !Number.isFinite(Number(healthProfile.weight))) {
    throw httpError(400, 'invalid_input', 'Chiều cao và cân nặng là bắt buộc để tạo lịch tập');
  }

  if (!Number.isFinite(Number(healthProfile.bmi))) {
    throw httpError(400, 'invalid_input', 'Không thể tính toán BMI từ hồ sơ hiện tại');
  }

  return {
    fullName: user.fullName,
    fitnessGoal: user.fitnessGoal,
    fitnessLevel: user.fitnessLevel,
    healthProfile
  };
}

async function createWorkoutPlanDocument(memberId, aiAnalysis, planData, isActive = true) {
  const storedAiAnalysis = typeof aiAnalysis === 'string' ? aiAnalysis : JSON.stringify(aiAnalysis || {});

  if (isActive) {
    await deactivateActiveWorkoutPlans(memberId);
  }

  return WorkoutPlan.create({
    memberId,
    aiAnalysis: storedAiAnalysis,
    planData,
    isActive: Boolean(isActive)
  });
}

const createWorkoutPlan = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const { aiAnalysis = '', planData = [], isActive = true } = req.body;

  if (!Array.isArray(planData) || planData.length === 0) {
    throw httpError(400, 'invalid_input', 'planData phải là mảng có ít nhất 1 phần tử');
  }

  const plan = await createWorkoutPlanDocument(memberId, aiAnalysis, planData, isActive);

  res.status(201).json({
    message: 'Tạo lịch tập thành công',
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
    throw httpError(404, 'workout_plan_not_found', 'Không tìm thấy lịch tập');
  }

  await WorkoutPlan.updateMany({ memberId, isActive: true }, { $set: { isActive: false } });
  plan.isActive = true;
  await plan.save();

  res.json({
    message: 'Kích hoạt lịch tập thành công',
    data: plan
  });
});

const generateWorkoutPlan = asyncHandler(async (req, res) => {
  const memberId = req.user.userId;
  const profile = await getMemberWorkoutProfile(memberId);
  const { aiAnalysis, planData } = await generatePlanForMember(memberId, profile);

  const plan = await createWorkoutPlanDocument(memberId, aiAnalysis, planData, true);

  res.status(201).json({
    message: 'Tạo lịch tập bằng AI thành công',
    data: plan
  });
});

module.exports = {
  createWorkoutPlan,
  listWorkoutPlans,
  getActiveWorkoutPlan,
  activateWorkoutPlan,
  generateWorkoutPlan
};
