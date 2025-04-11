const Notification = require("../models/Notification");
const User = require("../models/User");
const smsSender = require("../utils/smsSender");

const startNotificationListener = () => {
    const changeStream = Notification.watch();

    changeStream.on("change", async (change) => {
        if (change.operationType === "insert") {
            const notification = change.fullDocument;

            try {
                const user = await User.findById(notification.user);
                if (!user || !user.mobile) return;

                // Send SMS or push notification
                await smsSender.sendSMS(user.mobile, notification.message);
                console.log(`Notification sent to ${user.mobile}: ${notification.message}`);
            } catch (err) {
                console.error("Error sending notification:", err);
            }
        }
    });

    console.log("🔔 Notification service listening for new notifications...");
};

module.exports = { startNotificationListener };
