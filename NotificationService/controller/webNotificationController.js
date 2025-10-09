// ============================================
// controllers/WebNotificationController.js
// ============================================
const webNotificationService = require('../services/webNotificationService');

class WebNotificationController {
  // SSE Stream endpoint
  async streamNotifications(req, res) {
    const { userId } = req.params;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Register client
    webNotificationService.registerClient(userId, res);

    // Send connection success message
    res.write(`data: ${JSON.stringify({ 
      type: 'connected', 
      message: 'Connected to notification stream',
      userId 
    })}\n\n`);

    try {
      // Send existing unread notifications
      const unreadNotifications = await webNotificationService.getUnreadNotifications(userId);
      if (unreadNotifications.length > 0) {
        res.write(`data: ${JSON.stringify({ 
          type: 'existing', 
          notifications: unreadNotifications
        })}\n\n`);
      }

      // Send notification count
      const count = await webNotificationService.getNotificationCount(userId);
      res.write(`data: ${JSON.stringify({ 
        type: 'count', 
        count 
      })}\n\n`);
    } catch (error) {
      console.error('Error sending initial data:', error);
    }

    // Handle client disconnect
    req.on('close', () => {
      webNotificationService.unregisterClient(userId);
    });
  }

  // Send notification
  async sendNotification(req, res) {
    const { userId, message, title, type } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ 
        success: false, 
        error: 'userId and message are required' 
      });
    }

    try {
      const { notification, delivered } = await webNotificationService.createNotification(
        userId, 
        message, 
        title, 
        type
      );

      res.json({ 
        success: true, 
        notification,
        delivered,
        message: delivered 
          ? 'Notification sent and delivered to online user' 
          : 'Notification saved. User is offline, will receive when they login'
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to send notification',
        details: error.message 
      });
    }
  }

  // Get all notifications for a user
  async getNotifications(req, res) {
    const { userId } = req.params;
    const { unreadOnly, limit } = req.query;

    try {
      const notifications = unreadOnly === 'true'
        ? await webNotificationService.getUnreadNotifications(userId)
        : await webNotificationService.getNotificationsByUserId(userId, parseInt(limit) || 50);

      const count = await webNotificationService.getNotificationCount(userId);

      res.json({
        success: true,
        notifications,
        count
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch notifications',
        details: error.message 
      });
    }
  }

  // Get notification count
  async getNotificationCount(req, res) {
    const { userId } = req.params;

    try {
      const count = await webNotificationService.getNotificationCount(userId);
      res.json({ success: true, count });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get notification count',
        details: error.message 
      });
    }
  }

  // Mark notification as read
  async markAsRead(req, res) {
    const { notificationId } = req.params;

    try {
      const notification = await webNotificationService.markAsRead(notificationId);

      if (!notification) {
        return res.status(404).json({ 
          success: false, 
          error: 'Notification not found' 
        });
      }

      res.json({ 
        success: true, 
        notification
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to mark as read',
        details: error.message 
      });
    }
  }

  // Mark all notifications as read
  async markAllAsRead(req, res) {
    const { userId } = req.params;

    try {
      const count = await webNotificationService.markAllAsRead(userId);
      res.json({ 
        success: true, 
        count,
        message: `${count} notifications marked as read` 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to mark all as read',
        details: error.message 
      });
    }
  }

  // Delete notification
  async deleteNotification(req, res) {
    const { notificationId } = req.params;

    try {
      const deleted = await webNotificationService.deleteNotification(notificationId);

      if (!deleted) {
        return res.status(404).json({ 
          success: false, 
          error: 'Notification not found' 
        });
      }

      res.json({ 
        success: true, 
        message: 'Notification deleted',
        notification: deleted
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete notification',
        details: error.message 
      });
    }
  }

  // Delete all notifications for a user
  async deleteAllNotifications(req, res) {
    const { userId } = req.params;

    try {
      const count = await webNotificationService.deleteAllNotifications(userId);
      res.json({ 
        success: true, 
        count,
        message: `${count} notifications deleted` 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete notifications',
        details: error.message 
      });
    }
  }

  // Manual trigger for cleanup (admin only - add auth middleware in production)
  async triggerCleanup(req, res) {
    try {
      const deletedCount = await webNotificationService.deleteAllReadNotifications();
      res.json({
        success: true,
        deletedCount,
        message: `Cleanup completed. Deleted ${deletedCount} read notifications.`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to run cleanup',
        details: error.message
      });
    }
  }
}

module.exports = new WebNotificationController();
