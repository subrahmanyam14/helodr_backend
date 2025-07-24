// notificationMonitorService.js
const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/User");
const axios = require("axios");
const Appointment = require("../models/Appointment");
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
    const notificationType = notification.type; // Fixed: was using undefined variable

    // Prepare notification content
    const notificationSubject = getNotificationSubject(notification.type);

    // Create base email and SMS payloads
    const emailPayload = {
      email: user.email,
      subject: notificationSubject,
      message: notification.message
    };

    const smsPayload = {
      phoneNumber: user.mobileNumber,
      message: notification.message
    };

    // Determine which endpoints to use based on notification type
    switch (notificationType) {
      case "appointment_scheduled":
        if (user.isEmailVerified && user.email) {
          const appointmentData = await Appointment.findById(notification.referenceId).populate("patient").populate("doctor");
          if(appointmentData.type === "video")
          {
            appointmentData.videoConferenceLink = appointmentData.doctor.meetingLink;
            await appointmentData.save();
          }
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendAppointmentScheduled`, {
            email: user.email,
            sub: notificationSubject,
            patientName: appointmentData.patient.fullName,
            doctorName: user.fullName,
            patientAge: appointmentData.patient.age,
            patientGender: appointmentData.patient.gender,
            appointmentDate: appointmentData.date,
            appointmentStartTime: appointmentData.slot.startTime,
            appointmentEndTime: appointmentData.slot.endTime,
            patientProblem: appointmentData.reason,
            meetingLink: appointmentData.videoConferenceLink || null
          });
          console.log(`Email notification (${notificationType}) sent to ${user.email}`);
        }
        break;

      case "appointment_confirmation":
        if (user.isEmailVerified && user.email) {
          const appointmentData = await Appointment.findById(notification.referenceId)
            .populate("doctor")
            .populate({
              path: "doctor.hospitalAffiliations.hospital",
              model: "Hospital"
            });
            if(appointmentData.type === "video"){
              appointmentData.videoConferenceLink = doctor.meetingLink;
              await appointmentData.save();
            }
            console.log("logging data: ", appointmentData);
          let clinicAddress = "";
          if (appointmentData.doctor.hospitalAffiliations && appointmentData.doctor.hospitalAffiliations.length > 0) {
            const hospital = appointmentData.doctor.hospitalAffiliations[0].hospital;
            clinicAddress = `${hospital?.name} ${hospital?.type}, ${hospital?.address?.street}, ${hospital?.address?.city}, ${hospital?.address?.state}, ${hospital?.address?.pinCode}`;
          } else if (appointmentData.doctor.address) {
            // Fallback to doctor's personal address if no hospital
            clinicAddress = `${appointmentData.doctor.address.street}, ${appointmentData.doctor.address.city}, ${appointmentData.doctor.address.state}, ${appointmentData.doctor.address.pinCode}`;
          } else {
            clinicAddress = "Address not specified";
          }
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendAppointmentConfirmation`, {
            email: user.email,
            sub: notificationSubject,
            patientName: user.fullName,
            doctorName: appointmentData.doctor.fullName,
            specialization: appointmentData.doctor?.specializations?.join(", ") || "",
            appointmentDate: appointmentData.date,
            appointmentStartTime: appointmentData.slot.startTime,
            appointmentEndTime: appointmentData.slot.endTime,
            patientProblem: appointmentData.reason,
            meetingLink: appointmentData.videoConferenceLink || null,
            clinicAddress: clinicAddress
          });
          console.log(`Email notification (${notificationType}) sent to ${user.email}`);
        }
        break;

      case "appointment_reschedule":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendAppointmentReschedule`, emailPayload);
          console.log(`Email notification (${notificationType}) sent to ${user.email}`);
        }
        // if (user.isMobileVerified && user.mobileNumber) {
        //   await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendAppointmentReschedule`, smsPayload);
        //   console.log(`SMS notification (${notificationType}) sent to ${user.mobileNumber}`);
        // }
        break;


      case "appointment_cancelation":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendAppointmentCancellation`, emailPayload);
          console.log(`Email notification (cancellation) sent to ${user.email}`);
        }
        // if (user.isMobileVerified && user.mobileNumber) {
        //   await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendAppointmentCancellation`, smsPayload);
        //   console.log(`SMS notification (cancellation) sent to ${user.mobileNumber}`);
        // }
        break;

      case "appointment_reminder_1-day":
      case "appointment_reminder_1-hour":
      case "appointment_reminder_30-min":
      case "appointment_reminder_10-min":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendAppointmentReminder`, {
            ...emailPayload,
            reminderType: notificationType.split('_').pop() // Extracts "1-day", "1-hour", etc.
          });
          console.log(`Email reminder (${notificationType}) sent to ${user.email}`);
        }
        // if (user.isMobileVerified && user.mobileNumber) {
        //   await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendAppointmentReminder`, {
        //     ...smsPayload,
        //     reminderType: notificationType.split('_').pop()
        //   });
        //   console.log(`SMS reminder (${notificationType}) sent to ${user.mobileNumber}`);
        // }
        break;

      case "payment_confirmation":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendPaymentConfirmation`, emailPayload);
          console.log(`Payment confirmation email sent to ${user.email}`);
        }
        // if (user.isMobileVerified && user.mobileNumber) {
        //   await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendPaymentConfirmation`, smsPayload);
        //   console.log(`Payment confirmation SMS sent to ${user.mobileNumber}`);
        // }
        break;

      case "refund_initiate":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendRefundInitiation`, emailPayload);
          console.log(`Refund initiation email sent to ${user.email}`);
        }
        // if (user.isMobileVerified && user.mobileNumber) {
        //   await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendRefundInitiation`, smsPayload);
        //   console.log(`Refund initiation SMS sent to ${user.mobileNumber}`);
        // }
        break;

      default:
        console.warn(`Unknown notification type: ${notificationType}`);
        break;
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
    case "appointment_scheduled":
      return "Appointment Scheduled";
    case "appointment_cancelation":
      return "Appointment Cancellation";
    case "appointment_reschedule":
      return "Appointment Rescheduled";
    case "payment_confirmation":
      return "Payment Confirmation";
    case "refund_initiate":
      return "Refund Initiated";
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

    // Process any unsent notifications - FIXED: Removed .populate("doctor")
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