// appointmentNotificationService.js
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const axios = require("axios");
const googleMeetService = require("./googleMeetService");
const schedule = require("node-schedule");
require("dotenv").config();

// Initialize notification tracking to prevent duplicates
const notificationsSent = new Map();

/**
 * Start watching the appointment collection for changes
 */
const startAppointmentWatcher = () => {
  const changeStream = Appointment.watch();
  
  changeStream.on("change", async (change) => {
    try {
      if (change.operationType === "insert" || 
          (change.operationType === "update" && 
           change.updateDescription.updatedFields.status === "confirmed")) {
        
        const appointmentId = change.documentKey._id;
        const appointment = await Appointment.findById(appointmentId)
          .populate("patient")
          .populate("doctor");
        
        if (!appointment) return;
        
        // Handle new appointments or status changes to confirmed
        if (appointment.status === "confirmed") {
          await handleConfirmedAppointment(appointment);
        }
      }
    } catch (error) {
      console.error("Error in appointment change stream:", error);
    }
  });
  
  console.log("👀 Appointment watcher started - monitoring for new appointments...");
};

/**
 * Handle appointment when it's confirmed
 */
const handleConfirmedAppointment = async (appointment) => {
  try {
    // For video appointments, create Google Meet link
    if (appointment.appointmentType === "video" && !appointment.videoConferenceLink) {
      const meetLink = await googleMeetService.createMeeting(appointment);
      
      if (meetLink) {
        appointment.videoConferenceLink = meetLink;
        await appointment.save();
      }
    }
    
    // Create and send confirmation notifications
    await createNotification(
      appointment._id,
      appointment.patient._id,
      `Your appointment on ${formatDate(appointment.date)} at ${appointment.slot.startTime} has been confirmed.${
        appointment.videoConferenceLink 
          ? ` Join the video call: ${appointment.videoConferenceLink}` 
          : ''
      }`,
      "appointment_confirmation"
    );
    
    await createNotification(
      appointment._id,
      appointment.doctor._id,
      `New appointment confirmed on ${formatDate(appointment.date)} at ${appointment.slot.startTime}.${
        appointment.videoConferenceLink 
          ? ` Join the video call: ${appointment.videoConferenceLink}` 
          : ''
      }`,
      "appointment_confirmation"
    );
    
    // Schedule reminder notifications
    scheduleReminders(appointment);
  } catch (error) {
    console.error("Error handling confirmed appointment:", error);
  }
};

/**
 * Schedule reminder notifications for the appointment
 */
const scheduleReminders = (appointment) => {
  const appointmentDate = new Date(appointment.date);
  const [hours, minutes] = appointment.slot.startTime.split(":");
  appointmentDate.setHours(hours, minutes, 0, 0);
  
  // Get date for 1 day before appointment
  const oneDayBefore = new Date(appointmentDate);
  oneDayBefore.setDate(oneDayBefore.getDate() - 1);
  
  // Get date for 30 minutes before appointment
  const thirtyMinBefore = new Date(appointmentDate);
  thirtyMinBefore.setMinutes(thirtyMinBefore.getMinutes() - 30);
  
  // Only schedule if the dates are in the future
  const now = new Date();
  
  // Schedule 1-day reminder
  if (oneDayBefore > now) {
    schedule.scheduleJob(oneDayBefore, async () => {
      await sendReminderNotification(appointment, "1-day");
    });
    
    // Log record of scheduled reminder
    console.log(`Scheduled 1-day reminder for appointment ${appointment._id} at ${oneDayBefore}`);
    
    // Add to appointment reminders array
    updateAppointmentReminders(appointment._id, "email", "scheduled", "1-day");
  }
  
  // Schedule 30-min reminder
  if (thirtyMinBefore > now) {
    schedule.scheduleJob(thirtyMinBefore, async () => {
      await sendReminderNotification(appointment, "30-min");
    });
    
    // Log record of scheduled reminder
    console.log(`Scheduled 30-min reminder for appointment ${appointment._id} at ${thirtyMinBefore}`);
    
    // Add to appointment reminders array
    updateAppointmentReminders(appointment._id, "push", "scheduled", "30-min");
  }
};

/**
 * Send reminder notification for an appointment
 */
const sendReminderNotification = async (appointment, reminderType) => {
  try {
    const appointmentObj = appointment._id ? appointment : await Appointment.findById(appointment)
      .populate("patient")
      .populate("doctor");
    
    if (!appointmentObj || appointmentObj.status !== "confirmed") return;
    
    const reminderText = reminderType === "1-day" 
      ? `Reminder: You have an appointment tomorrow at ${appointmentObj.slot.startTime}.`
      : `Reminder: Your appointment starts in 30 minutes at ${appointmentObj.slot.startTime}.`;
    
    const videoText = appointmentObj.videoConferenceLink
      ? ` Join the video call: ${appointmentObj.videoConferenceLink}`
      : '';
    
    // Send to patient
    await createNotification(
      appointmentObj._id,
      appointmentObj.patient._id,
      `${reminderText}${videoText}`,
      `appointment_reminder_${reminderType}`
    );
    
    // Send to doctor
    await createNotification(
      appointmentObj._id,
      appointmentObj.doctor._id,
      `${reminderText}${videoText}`,
      `appointment_reminder_${reminderType}`
    );
    
    // Update appointment reminder status
    updateAppointmentReminders(
      appointmentObj._id, 
      reminderType === "1-day" ? "email" : "push", 
      "sent",
      reminderType
    );
  } catch (error) {
    console.error(`Error sending ${reminderType} reminder:`, error);
  }
};

/**
 * Create a notification and trigger transport
 */
const createNotification = async (referenceId, userId, message, type) => {
  try {
    // Check if we've already sent this notification (prevent duplicates)
    const notificationKey = `${referenceId.toString()}_${userId.toString()}_${type}`;
    if (notificationsSent.has(notificationKey)) {
      return;
    }
    
    // Create notification in database
    const notification = await Notification.create({
      referenceId,
      user: userId,
      message,
      type
    });
    
    // Mark as sent
    notificationsSent.set(notificationKey, true);
    
    // Get user details for sending notification
    const user = await User.findById(userId);
    
    if (!user) {
      console.error(`User ${userId} not found for notification`);
      return;
    }
    
    // Send notification via appropriate channel
    if (user.isEmailVerified && user.email) {
      await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/email/sendMail`, {
        to: user.email,
        subject: getNotificationSubject(type),
        text: message
      });
    } else if (user.isMobileVerified && user.mobileNumber) {
      await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
        to: user.countryCode + user.mobileNumber,
        message
      });
    }
    
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

/**
 * Update appointment reminders array
 */
const updateAppointmentReminders = async (appointmentId, type, status, reminderType) => {
  try {
    await Appointment.findByIdAndUpdate(appointmentId, {
      $push: {
        reminders: {
          type,
          sentAt: new Date(),
          status,
          reminderType
        }
      }
    });
  } catch (error) {
    console.error("Error updating appointment reminders:", error);
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
    case "appointment_reminder_30-min":
      return "Appointment Reminder - Starting Soon";
    default:
      return "Notification from Health App";
  }
};

/**
 * Format date for display
 */
const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

/**
 * Initialize the service and process existing appointments
 */
const initAppointmentNotificationService = async () => {
  try {
    // Start the watcher for new changes
    startAppointmentWatcher();
    
    // Find all confirmed appointments in the future
    const futureAppointments = await Appointment.find({
      status: "confirmed",
      date: { $gt: new Date() }
    }).populate("patient doctor");
    
    console.log(`Processing ${futureAppointments.length} existing confirmed appointments...`);
    
    // Schedule reminders for each future appointment
    for (const appointment of futureAppointments) {
      scheduleReminders(appointment);
    }
    
    console.log("🔔 Appointment notification service initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize appointment notification service:", error);
  }
};

module.exports = {
  initAppointmentNotificationService,
  startAppointmentWatcher
};