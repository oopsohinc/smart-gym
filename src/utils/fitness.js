function calculateBmi(heightCm, weightKg) {
  const height = Number(heightCm);
  const weight = Number(weightKg);

  if (!Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) {
    return null;
  }

  const heightInMeter = height / 100;
  const bmi = weight / (heightInMeter * heightInMeter);
  return Math.round(bmi * 100) / 100;
}

module.exports = { calculateBmi };