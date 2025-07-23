const Notification = require("../models/Notification");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const axios = require("axios");
// const { createGoogleMeetLink } = require("../utils/googlemeet");
require("dotenv").config();

const startNotificationListener = () => {
    const changeStream = Notification.watch();

    changeStream.on("change", async (change) => {
        if (change.operationType === "insert") {
            const notification = change.fullDocument;
            console.log("Observed notification created");

            try {
                const user = await User.findById(notification.user);
                if (!user || !user.mobileNumber) return;

                // Check if it's a booking notification
                if (notification.type === "appointment_booking") {
                    const appointment = await Appointment.findById(notification.referenceId).populate('doctor patient');

                    // Get Google Meet link using doctor’s refresh token
                    const meetLink = await createGoogleMeetLink(appointment.doctor.refreshToken, appointment);

                    // Save to appointment
                    appointment.meetingLink = meetLink;
                    await appointment.save();

                    // Message to send
                    const message = `Your appointment is scheduled. Join here: ${meetLink}`;

                    // Send notification to patient
                    if (appointment.patient.emailVerified) {
                        await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/email/sendMail`, {
                            to: appointment.patient.email,
                            subject: "Appointment Confirmation",
                            text: message
                        });
                    } 
                    // else {
                    //     await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
                    //         to: appointment.patient.countryCode + appointment.patient.mobileNumber,
                    //         message
                    //     });
                    // }

                    // Send to doctor as well
                    if (appointment.doctor.emailVerified) {
                        await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/email/sendAppointmentConfirmation`, {
                            to: appointment.doctor.email,
                            subject: "New Appointment Scheduled",
                            text: message
                        });
                    } 
                    // else {
                    //     await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
                    //         to: appointment.doctor.countryCode + appointment.doctor.mobileNumber,
                    //         message
                    //     });
                    // }
                }
            } catch (err) {
                console.error("Error sending notification:", err);
            }
        }
    });

    console.log("🔔 Notification service listening for new notifications...");
};

//get doctors messages
const getDoctorMessages = async (req, res) => {
  try {
    // Use this line later when implementing authorization
    // const doctorId = req.user?.doctorId;

    // For now, accept doctorId from body for testing
    const doctorId = req.body.doctorId;

    if (!doctorId) {
      return res.status(400).json({ success: false, message: "doctorId is required in request body" });
    }

    // Find all relevant appointments for this doctor
    const appointments = await Appointment.find({ doctor: doctorId }).select("_id patient");

    const appointmentIds = appointments.map(app => app._id.toString());
    const patientMap = {};
    appointments.forEach(app => {
      patientMap[app._id.toString()] = app.patient.toString();
    });

    // Fetch all notifications related to those appointments
    const notifications = await Notification.find({
      referenceId: { $in: appointmentIds }
    }).sort({ createdAt: -1 });

    const threadsMap = {};

    notifications.forEach(notification => {
      const patientId = patientMap[notification.referenceId.toString()];
      if (!patientId) return;

      if (!threadsMap[patientId]) {
        threadsMap[patientId] = {
          id: patientId,
          lastMessage: notification.message,
          timestamp: notification.createdAt,
          unreadCount: 1 // for now, every message is unread
        };
      } else {
        threadsMap[patientId].unreadCount += 1;
      }
    });

    // Fetch user details for all patients
    const userIds = Object.keys(threadsMap);
    const users = await User.find({ _id: { $in: userIds } });

    const threads = users.map(user => {
      const thread = threadsMap[user._id.toString()];
      return {
        id: thread.id,
        participant: {
          id: user._id,
          name: user.name,
          avatar: user.avatar || null,
          status: user.status || "offline"
        },
        lastMessage: thread.lastMessage,
        timestamp: thread.timestamp,
        unreadCount: thread.unreadCount
      };
    });

    res.json({ threads });

  } catch (err) {
    console.error("Error fetching doctor messages:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

//threaded message i.e messages between patient and doctor
const getDoctorThreadMessages = async (req, res) => {
  try {
    const doctorId = req.body.doctorId; 
    const patientId = req.params.threadId;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!doctorId || !patientId) {
      return res.status(400).json({ success: false, message: "doctorId and threadId (patientId) are required" });
    }

    // Find all appointment IDs between this doctor and patient
    const appointments = await Appointment.find({
      doctor: doctorId,
      patient: patientId
    }).select("_id");

    const appointmentIds = appointments.map(app => app._id);

    if (appointmentIds.length === 0) {
      return res.status(404).json({ success: false, message: "No appointments found between doctor and patient" });
    }

    // Find notifications related to these appointments, paginated
    const notifications = await Notification.find({
      referenceId: { $in: appointmentIds }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const messages = notifications.map(n => ({
      id: n._id,
      sender: n.user, // You can populate if needed
      text: n.message,
      timestamp: n.createdAt,
      read: false // Add read tracking if implemented
    }));

    // Fetch participant (patient) info
    const participant = await User.findById(patientId).select("_id name avatar status");

    if (!participant) {
      return res.status(404).json({ success: false, message: "Participant not found" });
    }

    res.status(200).json({
      messages,
      participant: {
        id: participant._id,
        name: participant.name,
        avatar: participant.avatar || null,
        status: participant.status || "offline"
      }
    });

  } catch (err) {
    console.error("Error fetching thread messages:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


module.exports = { startNotificationListener,getDoctorMessages ,getDoctorThreadMessages};
