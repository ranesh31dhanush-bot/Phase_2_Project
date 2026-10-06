// repositories/product.repository.js
const { query } = require('../config/db');

class ProductRepository {
  /**
   * Fetch products with dynamic filtering (category, search) and pagination
   */
  async findAll({ category, search, limit = 10, offset = 0 }) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Filter by exact category match
    if (category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(category.toLowerCase().trim());
      paramIndex++;
    }

    // Filter by case-insensitive partial name match using ILIKE
    if (search) {
      conditions.push(`name ILIKE $${paramIndex}`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Fetch filtered and paginated products
    const dataSql = `
      SELECT id, name, price, stock, category, created_at, updated_at
      FROM products
      ${whereClause}
      ORDER BY id ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    const dataParams = [...params, limit, offset];
    const dataResult = await query(dataSql, dataParams);

    // 2. Fetch total count for identical filter conditions
    const countSql = `
      SELECT COUNT(*)::INTEGER AS total
      FROM products
      ${whereClause}
    `;
    const countResult = await query(countSql, params);
    const total = countResult.rows[0]?.total || 0;

    return {
      products: dataResult.rows,
      total,
    };
  }

  /**
   * Fetch a single product by ID
   */
  async findById(id) {
    const sql = `
      SELECT id, name, price, stock, category, created_at, updated_at
      FROM products
      WHERE id = $1
    `;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Create a new product
   */
  async create({ name, price, stock, category }) {
    const sql = `
      INSERT INTO products (name, price, stock, category)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, price, stock, category, created_at, updated_at
    `;
    const result = await query(sql, [name.trim(), price, stock, category.toLowerCase().trim()]);
    return result.rows[0];
  }

  async findAndLockProductsByIds(productIds, client = null) {
    const executor = client || { query };
    const sql = `
      SELECT id, name, price, stock 
      FROM products 
      WHERE id = ANY($1::int[]) 
      FOR UPDATE
    `;
    const result = await executor.query(sql, [productIds]);
    return result.rows;
  }

  async decrementStock(productId, quantity, client = null) {
    const executor = client || { query };
    const sql = `
      UPDATE products 
      SET stock = stock - $1, updated_at = NOW() 
      WHERE id = $2
    `;
    await executor.query(sql, [quantity, productId]);
  }

}

module.exports = new ProductRepository();