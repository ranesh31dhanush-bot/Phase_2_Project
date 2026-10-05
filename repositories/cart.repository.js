// repositories/cart.repository.js
const redisClient = require('../config/redis');

const CART_TTL_SECONDS = 24 * 60 * 60; // 24 hours (86400 seconds)[cite: 1]

class CartRepository {
  /**
   * Helper to format Redis key
   */
  _getKey(userId) {
    return `cart:${userId}`;
  }

  /**
   * Get the quantity of a specific product in the user's cart
   */
  async getItemQuantity(userId, productId) {
    const key = this._getKey(userId);
    const qtyStr = await redisClient.hget(key, productId.toString());
    return qtyStr ? parseInt(qtyStr, 10) : 0;
  }

  /**
   * Get all items in the user's cart as { [productId]: quantity }
   */
  async getCart(userId) {
    const key = this._getKey(userId);
    const cartHash = await redisClient.hgetall(key);
    
    if (!cartHash || Object.keys(cartHash).length === 0) {
      return {};
    }

    // Convert string values to integers
    const parsedCart = {};
    for (const [productId, quantity] of Object.entries(cartHash)) {
      parsedCart[productId] = parseInt(quantity, 10);
    }
    return parsedCart;
  }

  /**
   * Set or update item quantity in the cart and refresh 24h TTL[cite: 1]
   */
  async setItem(userId, productId, quantity) {
    const key = this._getKey(userId);
    await redisClient.hset(key, productId.toString(), quantity.toString());
    await redisClient.expire(key, CART_TTL_SECONDS); // Refresh 24h TTL on write[cite: 1]
  }

  /**
   * Remove a single product from the user's cart[cite: 1]
   */
  async removeItem(userId, productId) {
    const key = this._getKey(userId);
    return await redisClient.hdel(key, productId.toString());
  }

  /**
   * Clear the entire cart (used after checkout)[cite: 1]
   */
  async clearCart(userId) {
    const key = this._getKey(userId);
    return await redisClient.del(key);
  }
}

module.exports = new CartRepository();