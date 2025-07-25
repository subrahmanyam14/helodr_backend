// notificationMonitorService.js
const Notification = require("../models/Notification");
const axios = require("axios");
const Appointment = require("../models/Appointment");
const Hospital = require("../models/Hospital");
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

        // Only process notifications that are pending or scheduled for now/past
        if (notification.status === "pending" ||
          (notification.status === "scheduled" && notification.scheduledFor && new Date(notification.scheduledFor) <= new Date())) {

          // Mark as processed to prevent duplicate handling
          processedNotifications.add(notificationId.toString());

          // Send the notification
          await sendNotification(notification);
        }
      }
    } catch (error) {
      console.error("Error in notification change stream:", error);
    }
  });

  console.log("👀 Notification watcher started - monitoring for new notifications...");
};

/**
 * Process scheduled notifications that are due
 */
const processScheduledNotifications = async () => {
  try {
    const now = new Date();
    const dueNotifications = await Notification.find({
      status: "scheduled",
      scheduledFor: { $lte: now }
    }).populate("user");

    for (const notification of dueNotifications) {
      if (!processedNotifications.has(notification._id.toString())) {
        processedNotifications.add(notification._id.toString());
        await sendNotification(notification);
      }
    }
  } catch (error) {
    console.error("Error processing scheduled notifications:", error);
  }
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
    const notificationType = notification.type;

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
              path: "doctor",
              populate: {
                path: "hospitalAffiliations.hospital",
                model: "Hospital"
              }
            });

          // console.log("logging data: ", appointmentData.doctor.hospitalAffiliations[0].hospital);
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
        break;

      case "appointment_cancelation":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendAppointmentCancellation`, emailPayload);
          console.log(`Email notification (cancellation) sent to ${user.email}`);
        }
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
        break;

      case "payment_confirmation":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendPaymentConfirmation`, emailPayload);
          console.log(`Payment confirmation email sent to ${user.email}`);
        }
        break;

      case "refund_initiate":
        if (user.isEmailVerified && user.email) {
          await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendRefundInitiation`, emailPayload);
          console.log(`Refund initiation email sent to ${user.email}`);
        }
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
/**
 * Initialize the notification monitor service with enhanced processing
 */
const initNotificationMonitorService = async () => {
  try {
    // Start the watcher for new notifications
    startNotificationWatcher();

    // Process any unsent notifications with retry logic
    await processUnsentNotifications();

    // Set up periodic check for scheduled notifications (every minute)
    setInterval(processScheduledNotifications, 60000);

    // Set up periodic check for any stuck pending notifications (every 5 minutes)
    setInterval(processStuckNotifications, 5 * 60000);

    console.log("🔔 Notification monitor service initialized successfully!");
  } catch (error) {
    console.error("Failed to initialize notification monitor service:", error);
  }
};

/**
 * Process unsent notifications with better error handling
 */
const processUnsentNotifications = async () => {
  try {
    const unsentNotifications = await Notification.find({
      $or: [
        { status: "pending" },
        {
          status: "scheduled",
          scheduledFor: { $lte: new Date() }
        }
      ]
    }).populate("user");

    console.log(`📮 Processing ${unsentNotifications.length} unsent notifications...`);

    for (const notification of unsentNotifications) {
      if (!processedNotifications.has(notification._id.toString())) {
        console.log(`Processing unsent notification: ${notification._id} (${notification.type})`);
        processedNotifications.add(notification._id.toString());
        await sendNotification(notification);

        // Add small delay between notifications to avoid overwhelming the email service
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Completed processing unsent notifications`);
  } catch (error) {
    console.error("Error processing unsent notifications:", error);
  }
};

/**
 * Process notifications that might be stuck in pending status
 */
const processStuckNotifications = async () => {
  try {
    // Find notifications that have been pending for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const stuckNotifications = await Notification.find({
      status: "pending",
      createdAt: { $lt: fiveMinutesAgo }
    }).populate("user");

    if (stuckNotifications.length > 0) {
      console.log(`🔧 Found ${stuckNotifications.length} stuck notifications, processing...`);

      for (const notification of stuckNotifications) {
        if (!processedNotifications.has(notification._id.toString())) {
          console.log(`Processing stuck notification: ${notification._id}`);
          processedNotifications.add(notification._id.toString());
          await sendNotification(notification);
        }
      }
    }
  } catch (error) {
    console.error("Error processing stuck notifications:", error);
  }
};

module.exports = {
  initNotificationMonitorService,
  startNotificationWatcher
};