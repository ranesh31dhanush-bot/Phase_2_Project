// const { Redis } = require('@upstash/redis');
// const connection = require('../config/bullmq');
// require('dotenv').config();

// const redisClient = new Redis({
//   url: process.env.UPSTASH_REDIS_REST_URL,
//   token: process.env.UPSTASH_REDIS_REST_TOKEN,
// });

// module.exports = redisClient;


const connection = require('./bullmq');

module.exports = connection;

