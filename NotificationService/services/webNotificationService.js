// services/webNotificationService.js
// ============================================
const WebNotification = require('../models/WebNotification');

class WebNotificationService {
  constructor() {
    this.clients = new Map(); // userId -> SSE response object
  }

  // Register SSE client connection
  registerClient(userId, res) {
    this.clients.set(userId, res);
    console.log(`Client ${userId} connected. Total clients: ${this.clients.size}`);
  }

  // Unregister SSE client
  unregisterClient(userId) {
    this.clients.delete(userId);
    console.log(`Client ${userId} disconnected. Total clients: ${this.clients.size}`);
  }

  // Check if user is connected
  isUserConnected(userId) {
    return this.clients.has(userId);
  }

  // Create and send notification
  async createNotification(userId, message, title = null, type = 'info') {
    try {
      const notification = new WebNotification({
        userId,
        title,
        message,
        type
      });

      await notification.save();

      // Send to connected client if online
      const sent = this.sendToClient(userId, {
        type: 'notification',
        notification: notification.toObject()
      });

      return { notification, delivered: sent };
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Send data to specific client via SSE
  sendToClient(userId, data) {
    const clientRes = this.clients.get(userId);
    if (clientRes) {
      try {
        clientRes.write(`data: ${JSON.stringify(data)}\n\n`);
        return true;
      } catch (error) {
        console.error(`Error sending to client ${userId}:`, error.message);
        this.unregisterClient(userId);
        return false;
      }
    }
    return false;
  }

  // Get all notifications for a user
  async getNotificationsByUserId(userId, limit = 50) {
    try {
      return await WebNotification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  }

  // Get unread notifications for a user
  async getUnreadNotifications(userId) {
    try {
      return await WebNotification.find({ userId, isRead: false })
        .sort({ createdAt: -1 });
    } catch (error) {
      console.error('Error fetching unread notifications:', error);
      throw error;
    }
  }

  // Get notification by ID
  async getNotificationById(notificationId) {
    try {
      return await WebNotification.findById(notificationId);
    } catch (error) {
      console.error('Error fetching notification:', error);
      return null;
    }
  }

  // Mark notification as read
  async markAsRead(notificationId) {
    try {
      const notification = await WebNotification.findById(notificationId);
      if (notification) {
        return await notification.markAsRead();
      }
      return null;
    } catch (error) {
      console.error('Error marking as read:', error);
      throw error;
    }
  }

  // Mark all notifications as read for a user
  async markAllAsRead(userId) {
    try {
      const result = await WebNotification.updateMany(
        { userId, isRead: false },
        { 
          $set: { 
            isRead: true, 
            readAt: new Date(),
            updatedAt: new Date()
          } 
        }
      );
      return result.modifiedCount;
    } catch (error) {
      console.error('Error marking all as read:', error);
      throw error;
    }
  }

  // Delete notification
  async deleteNotification(notificationId) {
    try {
      return await WebNotification.findByIdAndDelete(notificationId);
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  // Delete all notifications for a user
  async deleteAllNotifications(userId) {
    try {
      const result = await WebNotification.deleteMany({ userId });
      return result.deletedCount;
    } catch (error) {
      console.error('Error deleting all notifications:', error);
      throw error;
    }
  }

  // Get notification count for a user
  async getNotificationCount(userId) {
    try {
      const all = await WebNotification.countDocuments({ userId });
      const unread = await WebNotification.countDocuments({ userId, isRead: false });
      return { all, unread };
    } catch (error) {
      console.error('Error getting notification count:', error);
      throw error;
    }
  }

  // Delete all read notifications (for daily cleanup)
  async deleteAllReadNotifications() {
    try {
      const result = await WebNotification.deleteMany({ 
        isRead: true,
        readAt: { $ne: null }
      });
      console.log(`Daily cleanup: Deleted ${result.deletedCount} read notifications`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error in daily cleanup:', error);
      throw error;
    }
  }
}

// Singleton instance
const webNotificationService = new WebNotificationService();
module.exports = webNotificationService;
