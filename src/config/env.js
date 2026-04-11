const dotenv = require('dotenv');

dotenv.config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  MONGO_URI: process.env.MONGO_URI,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_QR_SECRET: process.env.JWT_QR_SECRET,
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_EXPIRES: process.env.JWT_REFRESH_EXPIRES || '7d',
  QR_EXPIRES_SECONDS: Number(process.env.QR_EXPIRES_SECONDS || 60),
  CHECKIN_COOLDOWN_MINUTES: Number(process.env.CHECKIN_COOLDOWN_MINUTES || 15),
  SUBSCRIPTION_LIFECYCLE_INTERVAL_MS: Number(process.env.SUBSCRIPTION_LIFECYCLE_INTERVAL_MS || 60000),
  VNP_TMNCODE: process.env.VNP_TMNCODE,
  VNP_HASH_SECRET: process.env.VNP_HASH_SECRET,
  VNP_URL: process.env.VNP_URL,
  VNP_RETURN_URL: process.env.VNP_RETURN_URL,
  VNP_IPN_URL: process.env.VNP_IPN_URL,
  CLIENT_URL: process.env.CLIENT_URL
};

const requiredKeys = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_QR_SECRET'];

for (const key of requiredKeys) {
  if (!env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = { env };
