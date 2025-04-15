// const Notification = require("../models/Notification");
// const User = require("../models/User");
// const axios = require("axios")
// require("dotenv").config();


// const startNotificationListener = () => {
//     const changeStream = Notification.watch();

//     changeStream.on("change", async (change) => {
//         if (change.operationType === "insert") {
//             const notification = change.fullDocument;
//             console.log("Observed nofication created");

//             try {
//                 const user = await User.findById(notification.user);
//                 if (!user || !user.mobileNumber) return;

//                 // Send SMS or push notification
//                 const res = await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
//                     to: user.countryCode + user.mobileNumber,
//                     message: notification.message
//                 });                
//                 if(!res.data.success)
//                 {
//                     console.log(`Failed to send the message ${notification.message} to user ${user.countryCode + user.mobileNumber}, error: `, res.data.error);
//                 }
//                 console.log(`Sent the message ${notification.message} to user ${user.countryCode + user.mobileNumber}.`);
//             } catch (err) {
//                 console.error("Error sending notification:", err);
//             }
//         }
//     });

//     console.log("🔔 Notification service listening for new notifications...");
// };

// module.exports = { startNotificationListener };
const Notification = require("../models/Notification");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const axios = require("axios");
const { createGoogleMeetLink } = require("../utils/googlemeet");
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
                    } else {
                        await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
                            to: appointment.patient.countryCode + appointment.patient.mobileNumber,
                            message
                        });
                    }

                    // Send to doctor as well
                    if (appointment.doctor.emailVerified) {
                        await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/email/sendMail`, {
                            to: appointment.doctor.email,
                            subject: "New Appointment Scheduled",
                            text: message
                        });
                    } else {
                        await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
                            to: appointment.doctor.countryCode + appointment.doctor.mobileNumber,
                            message
                        });
                    }
                }
            } catch (err) {
                console.error("Error sending notification:", err);
            }
        }
    });

    console.log("🔔 Notification service listening for new notifications...");
};

module.exports = { startNotificationListener };
