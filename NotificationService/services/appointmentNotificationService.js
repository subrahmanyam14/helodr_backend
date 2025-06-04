// appointmentNotificationService.js
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Notification = require("../models/Notification");
const User = require("../models/User");
const axios = require("axios");
const { createGoogleMeetLink } = require("./googleMeetService");
const schedule = require("node-schedule");
require("dotenv").config();

// Initialize notification tracking to prevent duplicates
const notificationsSent = new Map();

/**
 * 
 * Start watching the appointment collection for changes
 */
const startAppointmentWatcher = () => {
  const changeStream = Appointment.watch();

  changeStream.on("change", async (change) => {
    try {
      if (change.operationType === "insert" ||
        (change.operationType === "update" &&
          change.updateDescription.updatedFields.status === "confirmed")) {

        console.log("appointment found", change.documentKey._id);
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
    // For video appointments, create Google Meet link if not already present
    if (appointment.appointmentType === "video" && !appointment.videoConferenceLink) {
      await createAndUpdateMeetLink(appointment);
    }

    // Create and send confirmation notifications
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
      appointment.doctor._id,
      `New appointment confirmed on ${formatDate(appointment.date)} at ${appointment.slot.startTime}.${appointment.videoConferenceLink
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
 * Create and update Google Meet link for an appointment
 */
const createAndUpdateMeetLink = async (appointment) => {
  try {
    const meetLink = await createGoogleMeetLink(appointment);

    if (meetLink) {
      // Update the appointment with the Google Meet link
      await Appointment.findByIdAndUpdate(appointment._id, {
        $set: { videoConferenceLink: meetLink }
      });

      console.log(`Updated appointment ${appointment._id} with Google Meet link: ${meetLink}`);

      // Update our local copy of the appointment
      appointment.videoConferenceLink = meetLink;
    }
  } catch (error) {
    console.error(`Error creating/updating Google Meet link for appointment ${appointment._id}:`, error);
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

  // Get date for 1 hour before appointment
  const oneHourBefore = new Date(appointmentDate);
  oneHourBefore.setHours(oneHourBefore.getHours() - 1);

  // Get date for 30 minutes before appointment
  const thirtyMinBefore = new Date(appointmentDate);
  thirtyMinBefore.setMinutes(thirtyMinBefore.getMinutes() - 30);

  // Get date for 10 minutes before appointment
  const tenMinBefore = new Date(appointmentDate);
  tenMinBefore.setMinutes(tenMinBefore.getMinutes() - 10);

  // Only schedule if the dates are in the future
  const now = new Date();

  // Schedule 1-day reminder (email)
  if (oneDayBefore > now) {
    schedule.scheduleJob(oneDayBefore, async () => {
      await sendReminderNotification(appointment, "1-day");
    });

    // Log record of scheduled reminder
    console.log(`Scheduled 1-day reminder for appointment ${appointment._id} at ${oneDayBefore}`);

    // Add to appointment reminders array
    updateAppointmentReminders(appointment._id, "email", "scheduled", "1-day");
  }

  // Schedule 1-hour reminder (SMS)
  if (oneHourBefore > now) {
    schedule.scheduleJob(oneHourBefore, async () => {
      await sendReminderNotification(appointment, "1-hour");
    });

    // Log record of scheduled reminder
    console.log(`Scheduled 1-hour reminder for appointment ${appointment._id} at ${oneHourBefore}`);

    // Add to appointment reminders array
    updateAppointmentReminders(appointment._id, "sms", "scheduled", "1-hour");
  }

  // Schedule 30-min reminder (push)
  if (thirtyMinBefore > now) {
    schedule.scheduleJob(thirtyMinBefore, async () => {
      await sendReminderNotification(appointment, "30-min");
    });

    // Log record of scheduled reminder
    console.log(`Scheduled 30-min reminder for appointment ${appointment._id} at ${thirtyMinBefore}`);

    // Add to appointment reminders array
    updateAppointmentReminders(appointment._id, "push", "scheduled", "30-min");
  }

  // Schedule 10-min reminder (SMS)
  if (tenMinBefore > now) {
    schedule.scheduleJob(tenMinBefore, async () => {
      await sendReminderNotification(appointment, "10-min");
    });

    // Log record of scheduled reminder
    console.log(`Scheduled 10-min reminder for appointment ${appointment._id} at ${tenMinBefore}`);

    // Add to appointment reminders array
    updateAppointmentReminders(appointment._id, "sms", "scheduled", "10-min");
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

    let reminderText;
    switch (reminderType) {
      case "1-day":
        reminderText = `Reminder: You have an appointment tomorrow at ${appointmentObj.slot.startTime}.`;
        break;
      case "1-hour":
        reminderText = `Reminder: Your appointment starts in 1 hour at ${appointmentObj.slot.startTime}.`;
        break;
      case "30-min":
        reminderText = `Reminder: Your appointment starts in 30 minutes at ${appointmentObj.slot.startTime}.`;
        break;
      case "10-min":
        reminderText = `Reminder: Your appointment starts in 10 minutes at ${appointmentObj.slot.startTime}.`;
        break;
      default:
        reminderText = `Reminder: You have an upcoming appointment at ${appointmentObj.slot.startTime}.`;
    }

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
      appointmentObj.doctor.user,
      `${reminderText}${videoText}`,
      `appointment_reminder_${reminderType}`
    );

    // Determine channel type based on reminder type
    let channelType;
    switch (reminderType) {
      case "1-day":
        channelType = "email";
        break;
      case "1-hour":
      case "10-min":
        channelType = "sms";
        break;
      case "30-min":
        channelType = "push";
        break;
      default:
        channelType = "email";
    }

    // Update appointment reminder status
    updateAppointmentReminders(
      appointmentObj._id,
      channelType,
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
      type,
      status: "pending"
    });

    // Mark as sent in our local tracking
    notificationsSent.set(notificationKey, true);

    return notification;

    // Note: We no longer need to handle sending here because the notification monitor service
    // will detect the new notification and send it automatically
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
    // Start the watcher for new changes
    startAppointmentWatcher();

    // Find all confirmed appointments in the future
    const futureAppointments = await Appointment.find({
      status: "confirmed",
      date: { $gt: new Date() }
    }).populate("patient doctor").select("-reminders");

    console.log(`Processing ${futureAppointments.length} existing confirmed appointments...`);

    // For video appointments without a Google Meet link, create and update links
    for (const appointment of futureAppointments) {
      if (appointment.appointmentType === "video" && !appointment.videoConferenceLink) {
        // console.log("Appointmentss", appointment);
        appointment.doctor = await User.findById(appointment.doctor.user);
        await createAndUpdateMeetLink(appointment);
      }

      // Schedule reminders for each future appointment
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