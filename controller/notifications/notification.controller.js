const notificationRepository = require('../../repositories/notification.repository');

module.exports.createInternalNotification = async (req, res) => {
  try {
    const { user_id, type, title, body } = req.body;

    if (!user_id || !type || !title || !body) {
      return res.status(400).json({
        error: 'Missing required fields: user_id, type, title, and body are required',
      });
    }

    // 1. Save notification in PostgreSQL
    const notification = await notificationRepository.create({
      userId: user_id.toString(),
      type,
      title,
      body,
    });

    // 2. Emit real-time event if Socket.io instance is available on the app
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${user_id}`).emit('notification:new', notification);
      console.log(`[Socket] Emitted notification:new to room user:${user_id}`);
    }

    // 3. Return saved notification
    return res.status(201).json({
      message: 'Notification created and dispatched successfully',
      notification,
    });
  } catch (error) {
    console.error('Error creating internal notification:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};


module.exports.getUserNotifications = async (req, res) => {
  try {
    const userId = (req.user.userId || req.user.id || req.user._id).toString();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const [notifications, total, unreadCount] = await Promise.all([
      notificationRepository.findByUserId(userId, { limit, offset }),
      notificationRepository.countByUserId(userId),
      notificationRepository.countUnreadByUserId(userId),
    ]);

    return res.status(200).json({
      notifications,
      unread_count: unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// PATCH /notifications/:id/read
module.exports.markNotificationRead = async (req, res) => {
  try {
    const userId = (req.user.userId || req.user.id || req.user._id).toString();
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }

    const updated = await notificationRepository.markAsRead(notificationId, userId);
    if (!updated) {
      return res.status(404).json({ error: 'Notification not found or access denied' });
    }

    // Real-time broadcast so other tabs sync unread status
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('notification:read', { id: notificationId });
    }

    return res.status(200).json({
      message: 'Notification marked as read',
      notification: updated,
    });
  } catch (error) {
    console.error('Error marking notification read:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// PATCH /notifications/read-all
module.exports.markAllNotificationsRead = async (req, res) => {
  try {
    const userId = (req.user.userId || req.user.id || req.user._id).toString();
    const updatedCount = await notificationRepository.markAllAsRead(userId);

    // Sync other open tabs
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${userId}`).emit('notifications:read-all', { updatedCount });
    }

    return res.status(200).json({
      message: 'All notifications marked as read',
      updated_count: updatedCount,
    });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};