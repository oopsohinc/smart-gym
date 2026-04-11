const Subscription = require('../models/Subscription');
const { SUBSCRIPTION_STATUS } = require('../constants/enums');
const { getRemainingDays } = require('../utils/date');

const DEFAULT_INTERVAL_MS = 60 * 1000;

async function runSubscriptionLifecycle() {
  const now = new Date();

  const [expiredResult, activeSubscriptions] = await Promise.all([
    Subscription.updateMany(
      {
        status: SUBSCRIPTION_STATUS.ACTIVE,
        endDate: { $lt: now }
      },
      {
        $set: {
          status: SUBSCRIPTION_STATUS.EXPIRED,
          remainingDaysCache: 0
        }
      }
    ),
    Subscription.find({
      status: SUBSCRIPTION_STATUS.ACTIVE,
      endDate: { $gte: now }
    })
      .select('_id endDate remainingDaysCache')
      .lean()
  ]);

  const cacheUpdates = [];
  for (const item of activeSubscriptions) {
    const remainingDays = getRemainingDays(item.endDate);
    if (item.remainingDaysCache !== remainingDays) {
      cacheUpdates.push({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { remainingDaysCache: remainingDays } }
        }
      });
    }
  }

  let cacheUpdatedCount = 0;
  if (cacheUpdates.length > 0) {
    const bulkResult = await Subscription.bulkWrite(cacheUpdates);
    cacheUpdatedCount = bulkResult.modifiedCount || 0;
  }

  return {
    expiredCount: expiredResult.modifiedCount || 0,
    cacheUpdatedCount
  };
}

function startSubscriptionLifecycleScheduler(options = {}) {
  const intervalMs = Number(options.intervalMs || DEFAULT_INTERVAL_MS);

  const executeSafely = async () => {
    try {
      const result = await runSubscriptionLifecycle();
      if (result.expiredCount > 0 || result.cacheUpdatedCount > 0) {
        console.log(
          `[subscription-lifecycle] expired=${result.expiredCount}, cacheUpdated=${result.cacheUpdatedCount}`
        );
      }
    } catch (error) {
      console.error('[subscription-lifecycle] failed:', error.message);
    }
  };

  executeSafely();
  return setInterval(executeSafely, intervalMs);
}

module.exports = {
  runSubscriptionLifecycle,
  startSubscriptionLifecycleScheduler
};