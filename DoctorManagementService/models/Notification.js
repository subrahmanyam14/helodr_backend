const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    referenceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Appointment",
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    message: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ["appoinment_scheduled", "appointment_confirmation", "appointment_cancelation", "appointment_reminder_1-day", "appointment_reminder_1-hour", "appointment_reminder_30-min", "appointment_reminder_10-min", "appointment_reschedule", "payment_confirmation", "refund_initiate"]
    },
    status: {
        type: String,
        enum: ["pending", "sent", "failed", "cancelled"],
        default: "pending"
    },
    sentAt: {
        type: Date
    },
    error: {
        type: String
    }
},
    {
        timestamps: true
    });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification