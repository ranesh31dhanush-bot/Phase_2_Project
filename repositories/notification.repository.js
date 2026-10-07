// repositories/notification.repository.js
const { query } = require('../config/db');

class NotificationRepository {
  async create({ userId, type, title, body }) {
    const sql = `
      INSERT INTO notifications (user_id, type, title, body, read)
      VALUES ($1, $2, $3, $4, FALSE)
      RETURNING id, user_id AS "userId", type, title, body, read, created_at AS "createdAt"
    `;
    const result = await query(sql, [userId, type, title, body]);
    return result.rows[0];
  }

  // 1. Paginated history for a user
  async findByUserId(userId, { limit = 20, offset = 0 }) {
    const sql = `
      SELECT id, user_id AS "userId", type, title, body, read, created_at AS "createdAt"
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const result = await query(sql, [userId, limit, offset]);
    return result.rows;
  }

  // 2. Total notification count
  async countByUserId(userId) {
    const sql = `SELECT COUNT(*)::int AS total FROM notifications WHERE user_id = $1`;
    const result = await query(sql, [userId]);
    return result.rows[0].total;
  }

  // 3. Total unread count
  async countUnreadByUserId(userId) {
    const sql = `SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = FALSE`;
    const result = await query(sql, [userId]);
    return result.rows[0].unread;
  }

  // 4. Mark a single notification read (owner check enforced)
  async markAsRead(id, userId) {
    const sql = `
      UPDATE notifications
      SET read = TRUE
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id AS "userId", type, title, body, read, created_at AS "createdAt"
    `;
    const result = await query(sql, [id, userId]);
    return result.rows[0];
  }

  // 5. Mark all unread notifications read for a user
  async markAllAsRead(userId) {
    const sql = `
      UPDATE notifications
      SET read = TRUE
      WHERE user_id = $1 AND read = FALSE
    `;
    const result = await query(sql, [userId]);
    return result.rowCount;
  }
}

module.exports = new NotificationRepository();