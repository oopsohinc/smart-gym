function addDuration(startDate, durationValue, durationUnit) {
  const endDate = new Date(startDate);

  if (durationUnit === 'day') {
    endDate.setDate(endDate.getDate() + durationValue);
  } else if (durationUnit === 'month') {
    endDate.setMonth(endDate.getMonth() + durationValue);
  } else if (durationUnit === 'year') {
    endDate.setFullYear(endDate.getFullYear() + durationValue);
  }

  return endDate;
}

function getRemainingDays(endDate) {
  const now = new Date();
  const diff = new Date(endDate).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

module.exports = { addDuration, getRemainingDays };
