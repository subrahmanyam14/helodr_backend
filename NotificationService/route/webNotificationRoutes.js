// ============================================
// routes/notificationRoutes.js
// ============================================
const express = require('express');
const router = express.Router();
const webNotificationController = require('../controller/webNotificationController');

// SSE Stream endpoint
router.get('/stream/:userId', webNotificationController.streamNotifications);

// Send notification
router.post('/send', webNotificationController.sendNotification);

// Get all notifications for a user
router.get('/:userId', webNotificationController.getNotifications);

// Get notification count
router.get('/:userId/count', webNotificationController.getNotificationCount);

// Mark notification as read
router.put('/:notificationId/read', webNotificationController.markAsRead);

// Mark all notifications as read for a user
router.put('/:userId/read-all', webNotificationController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', webNotificationController.deleteNotification);

// Delete all notifications for a user
router.delete('/:userId/all', webNotificationController.deleteAllNotifications);

// Manual cleanup trigger (protect this route in production)
router.post('/cleanup/trigger', webNotificationController.triggerCleanup);

module.exports = router;
