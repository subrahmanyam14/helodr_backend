// UpcomingEarnings.js
const mongoose = require("mongoose");
const {
    queueWalletCreditNotification,
    queueUpcomingEarningCreatedNotification
} = require('../services/walletCreditNotificationService');

const upcomingEarningsSchema = new mongoose.Schema({
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true
    },
    appointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Appointment",
        required: true,
        unique: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    payment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "credited", "cancelled", "refunded"],
        default: "pending"
    },
    scheduledDate: {
        type: Date,
        required: true
    },
    notes: String
}, {
    timestamps: true
});

// Static method to create upcoming earnings record
upcomingEarningsSchema.statics.createUpcomingEarning = async function (data, session = null) {
    const Appointment = mongoose.model("Appointment");
    const Doctor = mongoose.model("Doctor");
    const User = mongoose.model("User");

    try {
        const options = session ? { session } : {};
        const upcomingEarning = new this(data);
        await upcomingEarning.save(options);

        // Send upcoming earning created notification to doctor
        try {
            // Get appointment details for notification
            const appointment = await Appointment.findById(data.appointment)
                .populate('patient', 'fullName')
                .session(session);

            // Get doctor's user ID for notification
            const doctor = await Doctor.findById(data.doctor)
                .populate('user')
                .session(session);

            if (appointment && doctor && doctor.user) {
                const upcomingEarningData = {
                    doctorId: data.doctor.toString(),
                    doctorUserId: doctor.user._id.toString(),
                    amount: data.amount,
                    appointmentId: data.appointment.toString(),
                    patientName: appointment.patient.fullName,
                    scheduledDate: data.scheduledDate,
                    createdAt: new Date()
                };

                // Queue upcoming earning created notification
                await queueUpcomingEarningCreatedNotification(upcomingEarningData);
            }
        } catch (notificationError) {
            console.warn('Upcoming earning created notification failed:', notificationError);
            // Don't fail the creation process if notification fails
        }

        return upcomingEarning;
    } catch (error) {
        console.error("Error creating upcoming earning:", error);
        throw error;
    }
};

// Static method to get total upcoming earnings for a doctor
upcomingEarningsSchema.statics.getTotalUpcomingEarnings = async function (doctorId) {
    try {
        const result = await this.aggregate([
            { $match: { doctor: new mongoose.Types.ObjectId(doctorId), status: "pending" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);
        return result.length > 0 ? result[0].total : 0;
    } catch (error) {
        console.error("Error getting total upcoming earnings:", error);
        throw error;
    }
};

// Method to process the earning (move to wallet)
upcomingEarningsSchema.methods.processEarning = async function (session = null) {
    const options = session ? { session } : {};
    const Wallet = mongoose.model("Wallet");
    const Appointment = mongoose.model("Appointment");
    const User = mongoose.model("User");

    try {
        // Find the doctor's wallet
        let wallet = await Wallet.findOne({ doctor: this.doctor }).session(session);

        if (!wallet) {
            // Create new wallet if it doesn't exist
            wallet = new Wallet({
                doctor: this.doctor,
                current_balance: 0,
                total_earned: 0
            });
        }

        // Store current balance for notification
        const oldBalance = wallet.current_balance;

        // Add the pending amount to the wallet
        await wallet.addFunds(
            this.amount,
            'appointment',
            `Payment credited for completed appointment ${this.appointment}`,
            this.payment,
            session
        );

        // Update status to credited
        this.status = "credited";
        await this.save(options);

        // Send wallet credit notification to doctor
        try {
            // Get appointment details for notification
            const appointment = await Appointment.findById(this.appointment)
                .populate('patient', 'fullName')
                .session(session);

            // Get doctor's user ID for notification
            const doctor = await Doctor.findById(this.doctor)
                .populate('user')
                .session(session);

            if (appointment && doctor && doctor.user) {
                const walletData = {
                    doctorId: this.doctor.toString(),
                    doctorUserId: doctor.user._id.toString(),
                    currentBalance: wallet.current_balance,
                    previousBalance: oldBalance
                };

                const earningData = {
                    amount: this.amount,
                    appointmentId: this.appointment.toString(),
                    patientName: appointment.patient.fullName,
                    creditedAt: new Date()
                };

                // Queue wallet credit notification
                await queueWalletCreditNotification(walletData, earningData);
            }
        } catch (notificationError) {
            console.warn('Wallet credit notification failed:', notificationError);
            // Don't fail the earning process if notification fails
        }

        return {
            success: true,
            wallet,
            upcomingEarning: this
        };
    } catch (error) {
        console.error("Error processing upcoming earning:", error);
        throw error;
    }
};

const UpcomingEarnings = mongoose.model("UpcomingEarnings", upcomingEarningsSchema);
module.exports = UpcomingEarnings;