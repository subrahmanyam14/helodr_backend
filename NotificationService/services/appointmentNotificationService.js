// appointmentNotificationService.js
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Notification = require("../models/Notification");
const User = require("../models/User");
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

        console.log("Appointment change detected:", change.documentKey._id);
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
    // Check if notifications already exist for this appointment
    const existingNotifications = await Notification.find({
      referenceId: appointment._id,
      type: { $in: ["appointment_confirmation", "appointment_scheduled"] }
    });

    // Only create notifications if they don't already exist
    if (existingNotifications.length === 0) {
      // Create and send confirmation notifications immediately
      await createNotification(
        appointment._id,
        appointment.patient._id,
        `Your appointment on ${formatDate(appointment.date)} at ${appointment.slot.startTime} has been confirmed.${appointment.videoConferenceLink
          ? ` Join the video call: ${appointment.videoConferenceLink}`
          : ''
        }`,
        "appointment_confirmation"
      );

      await createNotification(
        appointment._id,
        appointment.doctor.user,
        `New appointment scheduled on ${formatDate(appointment.date)} at ${appointment.slot.startTime}.${appointment.videoConferenceLink
          ? ` Join the video call: ${appointment.videoConferenceLink}`
          : ''
        }`,
        "appointment_scheduled"
      );
    }

    // Schedule reminder notifications by creating notification records
    await scheduleReminderNotifications(appointment);
  } catch (error) {
    console.error("Error handling confirmed appointment:", error);
  }
};

/**
 * Create scheduled reminder notifications in the database
 */
const scheduleReminderNotifications = async (appointment) => {
  const appointmentDate = new Date(appointment.date);
  const [hours, minutes] = appointment.slot.startTime.split(":");
  appointmentDate.setHours(hours, minutes, 0, 0);

  // Calculate reminder times
  const oneDayBefore = new Date(appointmentDate);
  oneDayBefore.setDate(oneDayBefore.getDate() - 1);

  const oneHourBefore = new Date(appointmentDate);
  oneHourBefore.setHours(oneHourBefore.getHours() - 1);

  const thirtyMinBefore = new Date(appointmentDate);
  thirtyMinBefore.setMinutes(thirtyMinBefore.getMinutes() - 30);

  const tenMinBefore = new Date(appointmentDate);
  tenMinBefore.setMinutes(tenMinBefore.getMinutes() - 10);

  const now = new Date();

  // Create notification records for future reminders
  const reminderNotifications = [];
  const reminderTypes = [];

  // Helper function to add reminders
  const addReminder = (time, typeSuffix) => {
    if (time > now) {
      const type = `appointment_reminder_${typeSuffix}`;
      const reminderText = getReminderText(typeSuffix, appointment.slot.startTime);
      const videoText = appointment.videoConferenceLink
        ? ` Join the video call: ${appointment.videoConferenceLink}`
        : '';

      // Patient reminder
      reminderNotifications.push({
        referenceId: appointment._id,
        user: appointment.patient._id,
        message: `${reminderText}${videoText}`,
        type,
        status: "scheduled",
        scheduledFor: time
      });

      // Doctor reminder
      reminderNotifications.push({
        referenceId: appointment._id,
        user: appointment.doctor._id,
        message: `${reminderText}${videoText}`,
        type,
        status: "scheduled",
        scheduledFor: time
      });

      reminderTypes.push(typeSuffix);
      console.log(`Prepared ${typeSuffix} reminder for appointment ${appointment._id}`);
    }
  };

  // Add all reminders
  addReminder(oneDayBefore, '1-day');
  addReminder(oneHourBefore, '1-hour');
  addReminder(thirtyMinBefore, '30-min');
  addReminder(tenMinBefore, '10-min');

  // Check for existing reminders
  if (reminderNotifications.length > 0) {
    const existingReminders = await Notification.find({
      referenceId: appointment._id,
      type: { $in: reminderNotifications.map(r => r.type) }
    });

    // Filter out existing reminders
    const existingTypes = existingReminders.map(r => r.type);
    const newReminders = reminderNotifications.filter(
      r => !existingTypes.includes(r.type)
    );

    // Insert only new reminders
    if (newReminders.length > 0) {
      await Notification.insertMany(newReminders);
      console.log(`Created ${newReminders.length} new reminder notifications for appointment ${appointment._id}`);

      // Update appointment reminders tracking
      for (const typeSuffix of reminderTypes) {
        await updateAppointmentReminders(
          appointment._id,
          getChannelType(typeSuffix),
          "scheduled",
          typeSuffix
        );
      }
    } else {
      console.log(`All reminders already exist for appointment ${appointment._id}`);
    }
  }
};

/**
 * Get reminder text based on type
 */
const getReminderText = (type, startTime) => {
  switch (type) {
    case '1-day':
      return `Reminder: You have an appointment tomorrow at ${startTime}.`;
    case '1-hour':
      return `Reminder: Your appointment starts in 1 hour at ${startTime}.`;
    case '30-min':
      return `Reminder: Your appointment starts in 30 minutes at ${startTime}.`;
    case '10-min':
      return `Reminder: Your appointment starts in 10 minutes at ${startTime}.`;
    default:
      return `Reminder: Your appointment is coming up at ${startTime}.`;
  }
};

/**
 * Get channel type based on reminder type
 */
const getChannelType = (reminderType) => {
  switch (reminderType) {
    case "1-day":
      return "email";
    case "1-hour":
    case "10-min":
      return "sms";
    case "30-min":
      return "push";
    default:
      return "email";
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

    // Check if notification exists in database
    const existingNotification = await Notification.findOne({
      referenceId,
      user: userId,
      type
    });

    if (existingNotification) {
      console.log(`Notification already exists: ${notificationKey}`);
      notificationsSent.set(notificationKey, true);
      return existingNotification;
    }

    // Create notification in database
    const notification = await Notification.create({
      referenceId,
      user: userId,
      message,
      type,
      status: "pending"
    });

    // Mark as sent in our local tracking
    notificationsSent.set(notificationKey, true);

    console.log(`Created new notification: ${notificationKey}`);
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
    // Clear in-memory tracking on startup
    notificationsSent.clear();

    // Start the watcher for new changes
    startAppointmentWatcher();

    // Find all confirmed appointments in the future
    const futureAppointments = await Appointment.find({
      status: "confirmed",
      date: { $gt: new Date() }
    }).populate("patient doctor");

    console.log(`Found ${futureAppointments.length} confirmed future appointments to process...`);

    // Process each future appointment
    for (const appointment of futureAppointments) {
      try {
        // Check if notifications already exist for this appointment
        const existingNotifications = await Notification.find({
          referenceId: appointment._id,
          $or: [
            { type: { $regex: /^appointment_reminder_/ } },
            { type: { $in: ["appointment_confirmation", "appointment_scheduled"] } }
          ]
        });

        if (existingNotifications.length === 0) {
          console.log(`Processing new appointment ${appointment._id}`);
          await handleConfirmedAppointment(appointment);
        } else {
          console.log(`Skipping appointment ${appointment._id} - notifications already exist`);
        }
      } catch (error) {
        console.error(`Error processing appointment ${appointment._id}:`, error);
      }
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