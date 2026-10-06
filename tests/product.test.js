// tests/product.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock BullMQ email queue
jest.mock('../queues/email.queue', () => {
  const add = jest.fn().mockResolvedValue({ id: 'mock-job-id' });
  return {
    add,
    emailQueue: { add },
    addVerificationEmailJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    addPasswordResetEmailJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    addOrderConfirmationEmailJob: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  };
});

const app = require('../app');
const { query } = require('../config/db');
const redisClient = require('../config/redis');

describe('Product API - Section 27: Redis Cache & Invalidation', () => {
  let adminToken;
  let userToken;
  const adminId = 'admin-user-001';
  const userId = 'shopper-user-002';

  beforeAll(() => {
    const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_12345';
    adminToken = jwt.sign({ userId: adminId, email: 'admin@example.com', role: 'admin' }, secret, { expiresIn: '1h' });
    userToken = jwt.sign({ userId: userId, email: 'shopper@example.com', role: 'user' }, secret, { expiresIn: '1h' });
  });

  beforeEach(async () => {
    // 1. Clean DB tables
    await query('DELETE FROM order_items');
    await query('DELETE FROM orders');
    await query('DELETE FROM products');

    // 2. Clear Redis cache keys
    const keys = await redisClient.keys('products:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    await redisClient.del(`cart:${userId}`);
  });

  afterAll(async () => {
    await query('DELETE FROM order_items');
    await query('DELETE FROM orders');
    await query('DELETE FROM products');
    const keys = await redisClient.keys('products:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  });

  it('should cache GET /products on first call and serve from Redis on second call', async () => {
    // Seed initial product
    await query(
      `INSERT INTO products (name, price, stock, category) 
       VALUES ('Mechanical Keyboard', 4500, 15, 'electronics')`
    );

    const cacheKey = 'products:all:all:page:1:limit:10';

    // Verify key does not exist yet in Redis
    let cached = await redisClient.get(cacheKey);
    expect(cached).toBeNull();

    // 1. First call: Cache miss -> queries DB and populates Redis
    const res1 = await request(app).get('/products?page=1&limit=10');
    expect(res1.status).toBe(200);
    expect(res1.body.products.length).toBe(1);
    expect(res1.body.products[0].name).toBe('Mechanical Keyboard');

    // Verify Redis key now exists with TTL
    cached = await redisClient.get(cacheKey);
    expect(cached).not.toBeNull();
    const parsedCache = JSON.parse(cached);
    expect(parsedCache.products.length).toBe(1);

    // 2. Second call: Cache hit -> serves response directly from Redis
    const res2 = await request(app).get('/products?page=1&limit=10');
    expect(res2.status).toBe(200);
    expect(res2.body.products).toEqual(res1.body.products);
  });

  it('should invalidate product cache after creating a new product as admin', async () => {
    // Seed 1 product and prime the cache
    await query(
      `INSERT INTO products (name, price, stock, category) 
       VALUES ('USB-C Cable', 500, 50, 'accessories')`
    );

    // Call GET /products to populate cache
    const initialRes = await request(app).get('/products?page=1&limit=10');
    expect(initialRes.body.products.length).toBe(1);

    // Verify cache exists
    const keysBefore = await redisClient.keys('products:*');
    expect(keysBefore.length).toBeGreaterThan(0);

    // Admin creates a second product (triggers cache invalidation)
    const createRes = await request(app)
      .post('/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Wireless Mouse',
        price: 1800,
        stock: 25,
        category: 'accessories',
      });
    expect(createRes.status).toBe(201);

    // Verify product cache was invalidated
    const keysAfter = await redisClient.keys('products:*');
    expect(keysAfter.length).toBe(0);

    // Next GET /products call reflects the newly created item
    const refreshedRes = await request(app).get('/products?page=1&limit=10');
    expect(refreshedRes.status).toBe(200);
    expect(refreshedRes.body.products.length).toBe(2);
  });

  it('should invalidate product cache after successful order placement', async () => {
    // Seed product with stock 10
    const prodResult = await query(
      `INSERT INTO products (name, price, stock, category) 
       VALUES ('Gaming Headset', 3500, 10, 'audio') 
       RETURNING id`
    );
    const productId = prodResult.rows[0].id;

    // Call GET /products to prime cache (shows stock = 10)
    await request(app).get('/products?page=1&limit=10');
    let keys = await redisClient.keys('products:*');
    expect(keys.length).toBeGreaterThan(0);

    // Place order for 2 items
    await redisClient.hset(`cart:${userId}`, productId.toString(), '2');
    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(orderRes.status).toBe(201);

    // Verify product cache was cleared so stale stock isn't served
    keys = await redisClient.keys('products:*');
    expect(keys.length).toBe(0);

    // Next GET /products fetches fresh data with stock = 8
    const updatedRes = await request(app).get('/products?page=1&limit=10');
    expect(updatedRes.body.products[0].stock).toBe(8);
  });
});