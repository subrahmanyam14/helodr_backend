// models/Notification.js
// ============================================
const mongoose = require('mongoose');

const webNotificationSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    default: null
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info'
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
webNotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
webNotificationSchema.index({ isRead: 1, readAt: 1 });

// Method to mark as read
webNotificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  this.updatedAt = new Date();
  return this.save();
};

const WebNotification = mongoose.model('WebNotification', webNotificationSchema);

module.exports = WebNotification;
