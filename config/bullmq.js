const IORedis = require('ioredis');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6380';

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true, // Prevents hanging connections if imported during tests
});

// Connect explicitly only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  connection.connect().catch((err) => {
    console.error('Redis connection error:', err.message);
  });
}

module.exports = connection;