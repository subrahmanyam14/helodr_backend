const Notification = require("../models/Notification");
const User = require("../models/User");
const axios = require("axios")
require("dotenv").config();


const startNotificationListener = () => {
    const changeStream = Notification.watch();

    changeStream.on("change", async (change) => {
        if (change.operationType === "insert") {
            const notification = change.fullDocument;
            console.log("Observed nofication created");

            try {
                const user = await User.findById(notification.user);
                if (!user || !user.mobileNumber) return;

                // Send SMS or push notification
                const res = await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/sms/sendMessage`, {
                    to: user.countryCode + user.mobileNumber,
                    message: notification.message
                });                
                if(!res.data.success)
                {
                    console.log(`Failed to send the message ${notification.message} to user ${user.countryCode + user.mobileNumber}, error: `, res.data.error);
                }
                console.log(`Sent the message ${notification.message} to user ${user.countryCode + user.mobileNumber}.`);
            } catch (err) {
                console.error("Error sending notification:", err);
            }
        }
    });

    console.log("🔔 Notification service listening for new notifications...");
};

module.exports = { startNotificationListener };
