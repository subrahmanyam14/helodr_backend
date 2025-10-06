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
        enum: [
            "appointment_scheduled", 
            "appointment_confirmation", 
            "appointment_cancelation", 
            "appointment_reminder_1-day", 
            "appointment_reminder_1-hour", 
            "appointment_reminder_30-min", 
            "appointment_reminder_10-min", 
            "appointment_reschedule", 
            "payment_confirmation", 
            "refund_initiate",
            "appointment_completion_request",
            "appointment_completed"
        ],
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "scheduled", "sent", "failed", "cancelled"],
        default: "pending"
    },
    scheduledFor: {
        type: Date,
        // This field is required when status is "scheduled"
        validate: {
            validator: function(v) {
                // If status is "scheduled", scheduledFor must be provided
                if (this.status === "scheduled") {
                    return v != null;
                }
                return true;
            },
            message: "scheduledFor is required when status is 'scheduled'"
        }
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

// Index for efficient querying of scheduled notifications
notificationSchema.index({ status: 1, scheduledFor: 1 });

// Index for efficient querying by user and type
notificationSchema.index({ user: 1, type: 1 });

// Index for efficient querying by reference (appointment)
notificationSchema.index({ referenceId: 1 });

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;