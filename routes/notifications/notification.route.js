// routes/notifications/notification.route.js
const express = require('express');
const router = express.Router();
const notificationController = require('../../controller/notifications/notification.controller');
const { internalAuthMiddleware } = require('../../middleware/internal.middleware');
const { authMiddleware } = require('../../middleware/auth.middleware');

// POST /notifications/internal (Internal microservice trigger)
router.post('/internal', internalAuthMiddleware, notificationController.createInternalNotification);
router.get('/', authMiddleware, notificationController.getUserNotifications);
router.patch('/read-all', authMiddleware, notificationController.markAllNotificationsRead);
router.patch('/:id/read', authMiddleware, notificationController.markNotificationRead);

module.exports = router;