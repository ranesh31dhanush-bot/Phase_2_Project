// tests/setup.js
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret_12345';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret_12345';
process.env.REFRESH_TOKEN_EXPIRES_IN = '604800';
process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';

jest.setTimeout(30000);

const mongoose = require('mongoose');

// Mock BullMQ email queue
jest.mock('../queues/email.queue', () => {
  const add = jest.fn().mockResolvedValue({ id: 'mock-job-id' });
  return {
    add,
    emailQueue: { add },
    addVerificationEmailJob: jest.fn().mockImplementation((to, link) =>
      add('sendVerificationEmail', { to, type: 'verification', link })
    ),
    addPasswordResetEmailJob: jest.fn().mockImplementation((to, link) =>
      add('sendPasswordResetEmail', { to, type: 'passwordReset', link })
    ),
    addOrderConfirmationEmailJob: jest.fn().mockImplementation((to, orderId, totalAmount, items) =>
      add('sendOrderConfirmationEmail', { to, orderId, totalAmount, items })
    ),
  };
});

// Mock Google OAuth Client
jest.mock('../config/oauth', () => ({
  generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?mocked=true'),
  getToken: jest.fn().mockResolvedValue({
    tokens: { id_token: 'mock-id-token' },
  }),
  setCredentials: jest.fn(),
  verifyIdToken: jest.fn().mockResolvedValue({
    getPayload: () => ({
      sub: 'google-test-id-123',
      email: 'googleuser@example.com',
    }),
  }),
}));

const redisClient = require('../config/redis');

// Resolve Docker container hostname or fallback to localhost
const mongoHost = process.env.MONGO_HOST || (process.env.NODE_ENV === 'test' && process.env.DOCKER_ENV ? 'mongodb' : '127.0.0.1');
const TEST_MONGO_URI = process.env.MONGO_URI || `mongodb://${process.env.MONGO_HOST || 'auth_mongo'}:27017/auth_test_db`;

beforeAll(async () => {
  try {
    await mongoose.connect(TEST_MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      runtimeAdapters: { os: require('os') },
    });
  } catch (err) {
    // Fallback if container name is 'mongodb' instead of 'auth_mongo'
    await mongoose.connect('mongodb://mongodb:27017/auth_test_db', {
      serverSelectionTimeoutMS: 5000,
      runtimeAdapters: { os: require('os') },
    });
  }

  if (redisClient.status === 'wait') {
    await redisClient.connect();
  }
}, 30000);

afterEach(async () => {
  jest.clearAllMocks();

  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }

  if (redisClient && redisClient.status === 'ready') {
    await redisClient.flushdb();
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.dropDatabase();
    } catch (err) {}
    await mongoose.disconnect();
  }

  if (redisClient && redisClient.status === 'ready') {
    await redisClient.quit();
  }
}, 30000);