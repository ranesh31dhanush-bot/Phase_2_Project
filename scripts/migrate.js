// scripts/migrate.js
const { query, pool } = require('../config/db');

const createTables = async () => {
  try {
    console.log('Running database migrations...');

    // 1. Products Table
    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INTEGER NOT NULL CHECK (price > 0), -- Store in paise/cents
        stock INTEGER NOT NULL CHECK (stock >= 0),
        category VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    `);

    // 2. Orders Table (Prepared for Day 2)
    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL,
        total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    `);

    // 3. Order Items Table
    await query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        price_at_purchase INTEGER NOT NULL CHECK (price_at_purchase > 0),
        subtotal INTEGER NOT NULL CHECK (subtotal > 0)
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    `);

    // 4. Seed initial sample products
    await query(`
      INSERT INTO products (name, price, stock, category)
      VALUES 
        ('Wireless Mouse', 59900, 25, 'electronics'),
        ('Mechanical Keyboard', 249900, 10, 'electronics'),
        ('USB-C Cable', 19900, 50, 'accessories'),
        ('Running Shoes', 349900, 5, 'footwear')
      ON CONFLICT DO NOTHING;
    `);

    console.log('Migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
};

createTables();