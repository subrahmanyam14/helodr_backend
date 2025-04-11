// Payment.js
const mongoose = require("mongoose");
const Wallet = require("./Wallet");
const Transaction = require("./Transaction");

const paymentSchema = new mongoose.Schema({
    appointment: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Appointment",
        required: true
    },
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true
    },
    patient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ["pending", "authorized", "captured", "refunded", "failed", "partially_refunded"],
        default: "pending"
    },
    paymentMethod: {
        type: String,
        enum: ["online", "upi", "card", "net_banking"],
        required: true
    },
    gateway: {
        name: String,
        transactionId: String,
        referenceId: String
    },
    refund: {
        amount: Number,
        reason: String,
        initiatedBy: {
            type: String,
            enum: ["system", "admin", "doctor", "patient"]
        },
        status: {
            type: String,
            enum: ["pending", "processed", "failed"]
        }
    }
}, {
    timestamps: true
});

// Create payment and transaction record
paymentSchema.statics.createPayment = async function(paymentData) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Create the payment
        const payment = new this(paymentData);
        await payment.save({ session });
        
        // Create transaction record for patient
        await Transaction.createTransaction({
            user: payment.patient,
            type: "appointment_payment",
            amount: payment.amount,
            referenceId: payment._id,
            referenceType: "Payment",
            status: payment.status === "captured" ? "completed" : "pending",
            notes: `Payment for appointment ${payment.appointment}`
        }, { session });
        
        await session.commitTransaction();
        session.endSession();
        
        return payment;
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

// Process payment and distribute to doctor
paymentSchema.methods.processPayment = async function() {
    if (this.status !== 'captured') {
        throw new Error('Payment must be captured before processing');
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const wallet = await Wallet.findOne({ doctor: this.doctor }).session(session);
        
        if (!wallet) {
            throw new Error('Doctor wallet not found');
        }
        
        const commission = wallet.commission_rate || 20;
        const platformCommission = this.amount * (commission / 100);
        const doctorShare = this.amount - platformCommission;
        
        // Update doctor's wallet
        await wallet.addFunds(
            doctorShare,
            'appointment',
            `Payment for appointment ${this.appointment}`,
            this.appointment
        );
        
        // Update transaction record for patient
        const patientTransaction = await Transaction.findOne({
            user: this.patient,
            referenceId: this._id,
            type: "appointment_payment"
        }).session(session);
        
        if (patientTransaction && patientTransaction.status !== "completed") {
            patientTransaction.status = "completed";
            await patientTransaction.save({ session });
        }
        
        await session.commitTransaction();
        session.endSession();
        
        return { doctorShare, platformCommission };
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

// Process refund
paymentSchema.methods.processRefund = async function(refundAmount, reason, initiatedBy) {
    if (this.status !== 'captured') {
        throw new Error('Payment must be captured before refunding');
    }
    
    if (refundAmount > this.amount) {
        throw new Error('Refund amount cannot exceed payment amount');
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Update payment with refund details
        this.refund = {
            amount: refundAmount,
            reason,
            initiatedBy,
            status: "processed"
        };
        
        this.status = refundAmount === this.amount ? "refunded" : "partially_refunded";
        await this.save({ session });
        
        // Create refund transaction for patient
        await Transaction.createTransaction({
            user: this.patient,
            type: "refund",
            amount: refundAmount,
            referenceId: this._id,
            referenceType: "Payment",
            status: "completed",
            notes: `Refund for appointment ${this.appointment}: ${reason}`
        }, { session });
        
        // If doctor already received payment, adjust wallet
        if (refundAmount > 0) {
            const wallet = await Wallet.findOne({ doctor: this.doctor }).session(session);
            
            if (wallet) {
                // Calculate the doctor's portion of the refund
                const commission = wallet.commission_rate || 20;
                const doctorSharePercentage = (100 - commission) / 100;
                const doctorRefundAmount = refundAmount * doctorSharePercentage;
                
                // Only deduct if wallet has sufficient balance
                if (wallet.current_balance >= doctorRefundAmount) {
                    wallet.current_balance -= doctorRefundAmount;
                    wallet.total_earned -= doctorRefundAmount; // Adjust total earned
                    await wallet.save({ session });
                    
                    // Create transaction for doctor refund deduction
                    await Transaction.createTransaction({
                        user: this.doctor,
                        type: "refund",
                        amount: -doctorRefundAmount, // Negative to indicate deduction
                        referenceId: this._id,
                        referenceType: "Payment",
                        status: "completed",
                        notes: `Refund deduction for appointment ${this.appointment}`
                    }, { session });
                }
            }
        }
        
        await session.commitTransaction();
        session.endSession();
        
        return this;
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

const Payment = mongoose.model("Payment", paymentSchema);
module.exports = Payment;