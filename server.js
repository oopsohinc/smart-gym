const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { env } = require('./src/config/env');
const { startSubscriptionLifecycleScheduler } = require('./src/services/subscriptionLifecycle.service');

async function bootstrap() {
  await connectDatabase();

  const lifecycleTimer = startSubscriptionLifecycleScheduler({
    intervalMs: env.SUBSCRIPTION_LIFECYCLE_INTERVAL_MS
  });

  const shutdown = () => {
    clearInterval(lifecycleTimer);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`SV Gym backend running on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
