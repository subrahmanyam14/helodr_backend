// services/notificationService.js
const WebNotification = require('../models/WebNotification');

class NotificationService {
  // Send single notification
  static async sendNotification(userId, title, message, type = 'info') {
    try {
      const notification = new WebNotification({
        userId,
        title,
        message,
        type
      });
      
      await notification.save();
      return notification;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }
  
  // Send multiple notifications
  static async sendBulkNotifications(notifications) {
    try {
      return await WebNotification.insertMany(notifications);
    } catch (error) {
      console.error('Error sending bulk notifications:', error);
      throw error;
    }
  }
  
  // Get user notifications
  static async getUserNotifications(userId, limit = 20, page = 1) {
    try {
      const skip = (page - 1) * limit;
      
      const notifications = await WebNotification.find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      const total = await WebNotification.countDocuments({ userId });
      
      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching user notifications:', error);
      throw error;
    }
  }
  
  // Mark notification as read
  static async markAsRead(notificationId) {
    try {
      const notification = await WebNotification.findById(notificationId);
      if (!notification) {
        throw new Error('Notification not found');
      }
      
      return await notification.markAsRead();
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }
  
  // Mark all notifications as read for user
  static async markAllAsRead(userId) {
    try {
      return await WebNotification.updateMany(
        { userId, isRead: false },
        { 
          isRead: true, 
          readAt: new Date(),
          updatedAt: new Date()
        }
      );
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;