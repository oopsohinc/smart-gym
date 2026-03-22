const mongoose = require('mongoose');
const { env } = require('./env');

async function connectDatabase() {
  await mongoose.connect(env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000
  });

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB error:', error.message);
  });
}

module.exports = { connectDatabase };
