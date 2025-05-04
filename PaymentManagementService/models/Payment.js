// Modified Payment.js with Upcoming Earnings feature
const mongoose = require("mongoose");
const Wallet = require("./Wallet");
const Transaction = require("./Transaction");
const UpcomingEarnings = require("./UpcomingEarnings");

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
    gstamount: {
        type: Number
    },
    totalamount: {
        type: Number
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
        referenceId: String,
        captureId: String 
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
    },
    upcomingEarning: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UpcomingEarnings"
    }
}, {
    timestamps: true
});

// Create payment and transaction record
paymentSchema.statics.createPayment = async function (paymentData, appointmentDate) {
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

        // If payment is captured, create upcoming earnings record
        if (payment.status === "captured") {
            // Calculate doctor's share
            const wallet = await Wallet.findOne({ doctor: payment.doctor }).session(session);
            const commission = wallet ? wallet.commission_rate : 20;
            const doctorShare = payment.amount * ((100 - commission) / 100);

            // Create upcoming earnings record
            const upcomingEarning = await UpcomingEarnings.createUpcomingEarning({
                doctor: payment.doctor,
                appointment: payment.appointment,
                amount: doctorShare,
                payment: payment._id,
                scheduledDate: appointmentDate || new Date(),
                status: "pending",
                notes: `Pending earnings for appointment ${payment.appointment}`
            }, session);

            // Link upcoming earning to payment
            payment.upcomingEarning = upcomingEarning._id;
            await payment.save({ session });
        }

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
paymentSchema.methods.processPayment = async function () {
    if (this.status !== 'captured') {
        throw new Error('Payment must be captured before processing');
    }

    console.log(`Starting payment processing for payment ID: ${this._id}, Amount: ${this.amount}`);

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        console.log('Transaction session started');

        // Find the upcoming earning record
        const upcomingEarning = await UpcomingEarnings.findById(this.upcomingEarning).session(session);
        
        if (!upcomingEarning) {
            throw new Error('Upcoming earning record not found');
        }
        
        // Process the earning to add funds to wallet
        const result = await upcomingEarning.processEarning(session);

        // Update transaction record for patient
        await Transaction.updateOne(
            {
                user: this.patient,
                referenceId: this._id,
                type: "appointment_payment"
            },
            { $set: { status: "completed" } },
            { session }
        );
        console.log('Patient transaction updated');

        await session.commitTransaction();
        session.endSession();
        console.log('Transaction committed successfully');

        // Calculate commission for the response
        const wallet = result.wallet;
        const commission = wallet.commission_rate || 20;
        const platformCommission = this.amount * (commission / 100);
        const doctorShare = upcomingEarning.amount;

        return { 
            doctorShare, 
            platformCommission,
            walletBalance: wallet.current_balance,
            totalEarned: wallet.total_earned
        };
    } catch (error) {
        console.error('Error in processPayment:', error);
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};

// Process refund with modifications for upcoming earnings
paymentSchema.methods.processRefund = async function (refundAmount, reason, initiatedBy) {
    if (this.status !== 'captured') {
      throw new Error('Payment must be captured before refunding');
    }
  
    if (refundAmount > this.amount) {
      throw new Error('Refund amount cannot exceed payment amount');
    }
  
    if (!this.gateway || !this.gateway.transactionId) {
      throw new Error('Payment gateway information missing');
    }
  
    const session = await mongoose.startSession();
    session.startTransaction();
  
    try {
      // 1. First initiate the Razorpay refund
      const razorpayRefund = await initiateRazorpayRefund(
        this.gateway.transactionId,
        refundAmount,
        'normal' // or 'optimum' for faster processing
      );
  
      console.log('Razorpay refund initiated:', razorpayRefund.id);
  
      // 2. Update payment with refund details
      this.refund = {
        amount: refundAmount,
        reason,
        initiatedBy,
        status: "processed",
        gatewayRefundId: razorpayRefund.id
      };
  
      this.status = refundAmount === this.amount ? "refunded" : "partially_refunded";
      await this.save({ session });
  
      // 3. Create refund transaction for patient
      await Transaction.createTransaction({
        user: this.patient,
        type: "refund",
        amount: refundAmount,
        referenceId: this._id,
        referenceType: "Payment",
        status: "completed",
        notes: `Refund for appointment ${this.appointment}: ${reason}`
      }, { session });
  
      // 4. Handle upcoming earnings adjustment
      if (this.upcomingEarning) {
        const upcomingEarning = await UpcomingEarnings.findById(this.upcomingEarning).session(session);
        
        if (upcomingEarning && upcomingEarning.status === "pending") {
          // If full refund, mark as refunded
          if (refundAmount === this.amount) {
            upcomingEarning.status = "refunded";
          } else {
            // If partial refund, adjust the amount proportionally
            const refundRatio = refundAmount / this.amount;
            upcomingEarning.amount = upcomingEarning.amount * (1 - refundRatio);
          }
          await upcomingEarning.save({ session });
        }
      }

      // 5. If doctor already received payment, adjust wallet
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
            wallet.total_earned -= doctorRefundAmount;
            await wallet.save({ session });
  
            // Create transaction for doctor refund deduction
            await Transaction.createTransaction({
              user: this.doctor,
              type: "refund",
              amount: -doctorRefundAmount,
              referenceId: this._id,
              referenceType: "Payment",
              status: "completed",
              notes: `Refund deduction for appointment ${this.appointment}`
            }, { session });
          } else {
            // Handle insufficient balance case
            console.warn(`Insufficient balance in doctor's wallet for refund deduction`);
            // You might want to track this for manual follow-up
          }
        }
      }
  
      await session.commitTransaction();
      session.endSession();
  
      return {
        payment: this,
        razorpayRefund
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      
      // Handle specific Razorpay errors
      if (error.error && error.error.description) {
        throw new Error(`Razorpay refund failed: ${error.error.description}`);
      }
      throw error;
    }
  };
  
  /**
   * Automatic refund trigger for failed appointments
   */
  paymentSchema.statics.autoRefund = async function(paymentId, reason = "Appointment cancellation") {
    const payment = await this.findById(paymentId);
    
    if (!payment) {
      throw new Error('Payment not found');
    }
    
    if (payment.status !== 'captured') {
      throw new Error('Only captured payments can be refunded');
    }
    
    if (payment.refund && payment.refund.status === 'processed') {
      throw new Error('Refund already processed');
    }
    
    // Process full refund
    return payment.processRefund(payment.amount, reason, 'system');
  };

const Payment = mongoose.model("Payment", paymentSchema);
module.exports = Payment;