// notificationMonitorService.js
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");
const axios = require("axios");
require("dotenv").config();

// Initialize processed notifications set to prevent duplicate processing
const processedNotifications = new Set();

/**
 * Start watching the notification collection for changes
 */
const startNotificationWatcher = () => {
  const changeStream = Notification.watch();
  
  changeStream.on("change", async (change) => {
    try {
      if (change.operationType === "insert" || change.operationType === "update") {
        const notificationId = change.documentKey._id;
        
        // Skip if we've already processed this notification
        if (processedNotifications.has(notificationId.toString())) {
          return;
        }
        
        const notification = await Notification.findById(notificationId)
          .populate("user");
        
        if (!notification) return;
        
        // Mark as processed to prevent duplicate handling
        processedNotifications.add(notificationId.toString());
        
        // Send the notification
        await sendNotification(notification);
      }
    } catch (error) {
      console.error("Error in notification change stream:", error);
    }
  });
  
  console.log("👀 Notification watcher started - monitoring for new notifications...");
};

/**
 * Send a notification through appropriate channels
 */
const sendNotification = async (notification) => {
  try {
    if (!notification.user) {
      console.error(`User not found for notification ${notification._id}`);
      return;
    }
    
    // Get user communication preferences
    const user = notification.user;
    
    // Prepare notification content
    const notificationSubject = getNotificationSubject(notification.type);
    const notificationMessage = notification.message;
    
    // Send via email if user has verified email
    // if (user.isEmailVerified && user.email) {
    //   await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/email/sendMail`, {
    //     to: user.email,
    //     subject: notificationSubject,
    //     text: notificationMessage
    //   });
    //   console.log(`Email notification sent to ${user.email}`);
    // }
    
    // Send via SMS if user has verified mobile
    if (user.isMobileVerified && user.mobileNumber) {
      await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
        to: user.countryCode + user.mobileNumber,
        message: notificationMessage
      });
      console.log(`SMS notification sent to ${user.countryCode}${user.mobileNumber}`);
    }
    
    // Mark notification as sent in the database
    await Notification.findByIdAndUpdate(notification._id, {
      $set: { 
        sentAt: new Date(),
        status: "sent" 
      }
    });
    
  } catch (error) {
    console.error("Error sending notification:", error);
    
    // Mark notification as failed
    await Notification.findByIdAndUpdate(notification._id, {
      $set: { 
        sentAt: new Date(),
        status: "failed",
        error: error.message
      }
    });
  }
};

/**
 * Get the subject line for email notifications
 */
const getNotificationSubject = (type) => {
  switch (type) {
    case "appointment_confirmation":
      return "Appointment Confirmation";
    case "appointment_reminder_1-day":
      return "Appointment Reminder - Tomorrow";
    case "appointment_reminder_1-hour":
      return "Appointment Reminder - In 1 Hour";
    case "appointment_reminder_10-min":
      return "Appointment Reminder - Starting Soon";
    case "appointment_reminder_30-min":
      return "Appointment Reminder - In 30 Minutes";
    default:
      return "Notification from Health App";
  }
};

/**
 * Initialize the notification monitor service
 */
const initNotificationMonitorService = async () => {
  try {
    // Start the watcher for new notifications
    startNotificationWatcher();
    
    // Process any unsent notifications
    const unsentNotifications = await Notification.find({
      status: { $ne: "sent" }
    }).populate("user");
    
    console.log(`Processing ${unsentNotifications.length} unsent notifications...`);
    
    for (const notification of unsentNotifications) {
      await sendNotification(notification);
    }
    
    console.log("🔔 Notification monitor service initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize notification monitor service:", error);
  }
};

module.exports = {
  initNotificationMonitorService,
  startNotificationWatcher
};