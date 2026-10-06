// tests/order.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');

// 1. Mock BullMQ email queue
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
const { addOrderConfirmationEmailJob } = require('../queues/email.queue');

describe('Order API Test Suite', () => {
  const userAId = 'user-a-111';
  const userBId = 'user-b-222';
  let tokenUserA;
  let tokenUserB;

  beforeAll(() => {
    const secret = process.env.JWT_ACCESS_SECRET || 'test_access_secret_12345';
    tokenUserA = jwt.sign({ userId: userAId, email: 'usera@example.com', role: 'user' }, secret, { expiresIn: '1h' });
    tokenUserB = jwt.sign({ userId: userBId, email: 'userb@example.com', role: 'user' }, secret, { expiresIn: '1h' });
  });

  beforeEach(async () => {
    // Clean PostgreSQL tables and Redis keys
    await query('DELETE FROM order_items');
    await query('DELETE FROM orders');
    await query('DELETE FROM products');
    await redisClient.del(`cart:${userAId}`, `cart:${userBId}`);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await query('DELETE FROM order_items');
    await query('DELETE FROM orders');
    await query('DELETE FROM products');
    await redisClient.del(`cart:${userAId}`, `cart:${userBId}`);
  });

  // ==========================================
  // Test 1: Order happy path
  // ==========================================
  it('Test 1: should successfully place order when stock is available', async () => {
    // Setup: product with stock 10
    const productResult = await query(
      `INSERT INTO products (name, price, stock, category) 
       VALUES ('Mechanical Keyboard', 2500, 10, 'electronics') 
       RETURNING id`
    );
    const productId = productResult.rows[0].id;

    // Add quantity 2 to User A cart
    await redisClient.hset(`cart:${userAId}`, productId.toString(), '2');

    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({});

    // 1. Status 201
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('orderId');
    expect(res.body.totalAmount).toBe(5000);

    const createdOrderId = res.body.orderId;

    // 2. Order created in DB
    const orderInDb = await query('SELECT * FROM orders WHERE id = $1', [createdOrderId]);
    expect(orderInDb.rows.length).toBe(1);
    expect(orderInDb.rows[0].status).toBe('confirmed');

    // 3. Order items created with snapshot price
    const orderItemsInDb = await query('SELECT * FROM order_items WHERE order_id = $1', [createdOrderId]);
    expect(orderItemsInDb.rows.length).toBe(1);
    expect(orderItemsInDb.rows[0].product_id).toBe(productId);
    expect(orderItemsInDb.rows[0].quantity).toBe(2);
    expect(orderItemsInDb.rows[0].price_at_purchase).toBe(2500);

    // 4. Stock reduced: 10 -> 8
    const updatedProduct = await query('SELECT stock FROM products WHERE id = $1', [productId]);
    expect(updatedProduct.rows[0].stock).toBe(8);

    // 5. Cart cleared in Redis
    const remainingCart = await redisClient.hgetall(`cart:${userAId}`);
    expect(Object.keys(remainingCart || {}).length).toBe(0);

    // 6. Email queued
    expect(addOrderConfirmationEmailJob).toHaveBeenCalledTimes(1);

    // 7. GET /orders
    const listRes = await request(app)
      .get('/orders')
      .set('Authorization', `Bearer ${tokenUserA}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.orders.length).toBeGreaterThan(0);

    // 8. GET /orders/:id
    const detailRes = await request(app)
      .get(`/orders/${createdOrderId}`)
      .set('Authorization', `Bearer ${tokenUserA}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.order.items.length).toBe(1);
    expect(detailRes.body.order.items[0].product_id).toBe(productId);
  });

  // ==========================================
  // Test 2: Insufficient stock
  // ==========================================
  it('Test 2: should fail when cart quantity is greater than stock', async () => {
    // 1. Setup: product with stock 1
    const productResult = await query(
      `INSERT INTO products (name, price, stock, category) 
       VALUES ('Limited Edition GPU', 75000, 1, 'electronics') 
       RETURNING id`
    );
    const productId = productResult.rows[0].id;

    // 2. Setup: Add quantity 5 to cart (exceeds stock 1)
    await redisClient.hset(`cart:${userAId}`, productId.toString(), '5');

    // 3. Call POST /orders
    const res = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({});

    // 4. Expect status 400
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');

    // 5. Verify order NOT created
    const ordersCount = await query('SELECT COUNT(*)::int AS count FROM orders');
    expect(ordersCount.rows[0].count).toBe(0);

    // 6. Verify order_items NOT created
    const orderItemsCount = await query('SELECT COUNT(*)::int AS count FROM order_items');
    expect(orderItemsCount.rows[0].count).toBe(0);

    // 7. Verify stock remains 1 (rollback succeeded)
    const productInDb = await query('SELECT stock FROM products WHERE id = $1', [productId]);
    expect(productInDb.rows[0].stock).toBe(1);

    // 8. Verify Redis cart is NOT cleared (user can reduce quantity and retry)
    const cartRemaining = await redisClient.hgetall(`cart:${userAId}`);
    expect(cartRemaining).toBeDefined();
    expect(cartRemaining[productId.toString()]).toBe('5');

    // 9. Verify email job was NOT queued
    expect(addOrderConfirmationEmailJob).not.toHaveBeenCalled();
  });

  // ==========================================
  // Test 3: Concurrent orders (Race condition test)
  // ==========================================
  it('Test 3: should allow only one order when two users buy the last item simultaneously', async () => {
    // 1. Setup: product with stock exactly 1
    const productResult = await query(
      `INSERT INTO products (name, price, stock, category) 
       VALUES ('Vintage Watch', 15000, 1, 'accessories') 
       RETURNING id`
    );
    const productId = productResult.rows[0].id;

    // 2. Both User A and User B have quantity 1 in their cart
    await redisClient.hset(`cart:${userAId}`, productId.toString(), '1');
    await redisClient.hset(`cart:${userBId}`, productId.toString(), '1');

    // 3. Send both POST /orders requests simultaneously
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({}),
      request(app)
        .post('/orders')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({}),
    ]);

    const statuses = [resA.status, resB.status];

    // 4. Verify exactly one succeeded (201) and exactly one was rejected (400)
    expect(statuses).toContain(201);
    expect(statuses).toContain(400);

    // 5. Verify final database stock is 0 (never oversold to negative)
    const productInDb = await query('SELECT stock FROM products WHERE id = $1', [productId]);
    expect(productInDb.rows[0].stock).toBe(0);

    // 6. Verify only 1 order exists in database
    const ordersCount = await query('SELECT COUNT(*)::int AS count FROM orders');
    expect(ordersCount.rows[0].count).toBe(1);

    // 7. Verify only 1 order_items row exists
    const orderItemsCount = await query('SELECT COUNT(*)::int AS count FROM order_items');
    expect(orderItemsCount.rows[0].count).toBe(1);
  });
});