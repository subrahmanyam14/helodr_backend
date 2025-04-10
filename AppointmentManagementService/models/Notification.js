const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
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
    }
},
    {
        timestamps: true
    });

const Payment = mongoose.model("Notification", paymentSchema);