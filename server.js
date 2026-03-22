const app = require('./src/app');
const { connectDatabase } = require('./src/config/database');
const { env } = require('./src/config/env');

async function bootstrap() {
  await connectDatabase();

  app.listen(env.PORT, () => {
    console.log(`SV Gym backend running on port ${env.PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
