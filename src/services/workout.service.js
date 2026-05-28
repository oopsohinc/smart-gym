const { httpError } = require('../utils/httpError');
const { generateJsonContent } = require('../utils/ai');

function buildWorkoutPrompt(profile) {
  return [
    'You are a certified strength and conditioning coach.',
    'Generate a workout plan in JSON only. Do not use markdown, code fences, or extra commentary.',
    'Return an object with exactly two top-level keys: aiAnalysis and planData.',
    'aiAnalysis must be a concise Vietnamese string explaining why the plan fits the user.',
    'planData must be an array of plan days. Each day should contain a title, focus, warmup, exercises, cooldown, durationMinutes, and notes.',
    'Each exercise should include name, sets, reps, restSeconds, and notes.',
    'Keep the plan realistic, progressive, and aligned with the user profile below.',
    '',
    `Profile: ${JSON.stringify(profile)}`
  ].join('\n');
}

function normalizePlanResponse(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw httpError(500, 'ai_response_invalid', 'AI response must be a JSON object');
  }

  const aiAnalysis = typeof result.aiAnalysis === 'string' ? result.aiAnalysis.trim() : '';
  const planData = Array.isArray(result.planData) ? result.planData : [];

  if (!aiAnalysis) {
    throw httpError(500, 'ai_response_invalid', 'aiAnalysis must be a non-empty string');
  }

  if (planData.length === 0) {
    throw httpError(500, 'ai_response_invalid', 'planData must be a non-empty array');
  }

  return { aiAnalysis, planData };
}

async function generatePlanForMember(memberId, profile) {
  if (!memberId) {
    throw httpError(400, 'invalid_input', 'memberId is required');
  }

  if (!profile || typeof profile !== 'object') {
    throw httpError(400, 'invalid_input', 'profile is required');
  }

  const prompt = buildWorkoutPrompt(profile);
  const result = await generateJsonContent({
    model: 'gemini-2.5-flash',
    prompt,
    systemInstruction: 'Return only valid JSON.'
  });

  return normalizePlanResponse(result);
}

module.exports = {
  generatePlanForMember,
  buildWorkoutPrompt,
  normalizePlanResponse
};