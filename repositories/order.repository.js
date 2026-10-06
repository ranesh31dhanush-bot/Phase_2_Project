// repositories/order.repository.js
const { query } = require('../config/db');

class OrderRepository {
  /**
   * Insert header order row within an active transaction[cite: 1]
   * @param {Object} data - { userId, totalAmount }
   * @param {Object} client - dedicated pg transaction client
   */
  async createOrder({ userId, totalAmount }, client = null) {
    const executor = client || { query };
    const sql = `
      INSERT INTO orders (user_id, total_amount, status)
      VALUES ($1, $2, 'confirmed')
      RETURNING id, user_id, total_amount, status, created_at, updated_at
    `;
    const result = await executor.query(sql, [userId, totalAmount]);
    return result.rows[0];
  }

  /**
   * Insert an order item row within an active transaction[cite: 1]
   * @param {Object} itemData - { orderId, productId, quantity, priceAtPurchase }
   * @param {Object} client - dedicated pg transaction client
   */
  async createOrderItem({ orderId, productId, quantity, priceAtPurchase }, client = null) {
  const executor = client || { query };
  
  // Calculate subtotal
  const subtotal = quantity * priceAtPurchase;

  const sql = `
    INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase, subtotal)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, order_id, product_id, quantity, price_at_purchase, subtotal
  `;
  const result = await executor.query(sql, [orderId, productId, quantity, priceAtPurchase, subtotal]);
  return result.rows[0];
}

  /**
   * Fetch paginated order history for a specific user (GET /orders)[cite: 1]
   * @param {string} userId
   * @param {number} limit
   * @param {number} offset
   */
  async findByUserId(userId, limit = 10, offset = 0) {
    const dataSql = `
      SELECT 
        o.id, 
        o.status, 
        o.total_amount, 
        o.created_at,
        COUNT(oi.id)::int AS item_count
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM orders
      WHERE user_id = $1
    `;

    const [dataResult, countResult] = await Promise.all([
      query(dataSql, [userId, limit, offset]),
      query(countSql, [userId]),
    ]);

    return {
      orders: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
    };
  }

  /**
   * Fetch single order and its nested items scoped strictly to the owning user (GET /orders/:id)[cite: 1]
   * @param {number} orderId
   * @param {string} userId
   */
  async findByIdAndUserId(orderId, userId) {
    // 1. Fetch order details verifying ownership[cite: 1]
    const orderSql = `
      SELECT id, user_id, status, total_amount, created_at, updated_at
      FROM orders
      WHERE id = $1 AND user_id = $2
    `;
    const orderResult = await query(orderSql, [orderId, userId]);
    const order = orderResult.rows[0];

    if (!order) {
      return null;
    }

    // 2. Fetch all purchased items with snapshot pricing[cite: 1]
    const itemsSql = `
      SELECT 
        oi.id,
        oi.product_id,
        p.name AS product_name,
        oi.quantity,
        oi.price_at_purchase,
        (oi.quantity * oi.price_at_purchase) AS subtotal
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
    `;
    const itemsResult = await query(itemsSql, [orderId]);
    order.items = itemsResult.rows;

    return order;
  }
}

module.exports = new OrderRepository();