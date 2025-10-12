const mongoose = require("mongoose");

const withdrawalSchema = new mongoose.Schema({
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true
    },
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 100
    },
    // Track which transaction IDs are being withdrawn
    transactionIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true
    }],
    status: {
      type: String,
      enum: [
        "pending",                    // Doctor requested
        "admin_approved",             // Admin approved
        "hospital_payment_completed", // Admin transferred to hospital
        "doctor_payment_pending",     // Hospital needs to pay doctor
        "doctor_otp_verified",        // Doctor verified receipt from hospital
        "completed",                  // Final completion
        "rejected"                    // Rejected by admin
      ],
      default: "pending"
    },
    paymentMethod: {
      type: String,
      enum: ["bank_transfer", "upi", "cash"],
      required: true
    },
    
    // Admin to Hospital Transfer
    adminToHospital: {
      paymentReference: String,
      paymentProof: String,
      transferredAt: Date,
      notes: String
    },
    
    // Hospital to Doctor Transfer
    hospitalToDoctor: {
      otp: {
        code: String,
        generatedAt: Date,
        expiresAt: Date,
        attempts: {
          type: Number,
          default: 0
        }
      },
      paymentReference: String,
      paymentProof: String,
      settledAt: Date,
      settledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"  // Hospital admin who settled
      },
      notes: String
    },
    
    // Admin who approved the request
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    approvedAt: Date,
    
    // Doctor who verified the payment
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: Date,
    
    // Main transaction record for this withdrawal
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction"
    },
    
    // Additional transactions created during the process
    adminTransferTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction"
    },
    
    rejectionReason: String,
    notes: String
  }, { 
    timestamps: true 
  });

// Generate OTP for doctor verification
withdrawalSchema.methods.generateDoctorOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  this.hospitalToDoctor.otp = {
    code: otp,
    generatedAt: new Date(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    attempts: 0
  };
  return otp;
};

// Verify OTP from doctor
withdrawalSchema.methods.verifyDoctorOTP = function(inputOTP) {
  if (!this.hospitalToDoctor.otp || !this.hospitalToDoctor.otp.code) {
    return { success: false, message: "No OTP generated for this withdrawal" };
  }

  if (new Date() > this.hospitalToDoctor.otp.expiresAt) {
    return { success: false, message: "OTP has expired. Please request a new OTP." };
  }

  if (this.hospitalToDoctor.otp.attempts >= 5) {
    return { success: false, message: "Maximum OTP attempts exceeded. Please contact support." };
  }

  this.hospitalToDoctor.otp.attempts += 1;

  if (this.hospitalToDoctor.otp.code !== inputOTP) {
    return { success: false, message: `Invalid OTP. ${5 - this.hospitalToDoctor.otp.attempts} attempts remaining.` };
  }

  return { success: true, message: "OTP verified successfully" };
};

// Add indexes for better query performance
withdrawalSchema.index({ doctor: 1, status: 1 });
withdrawalSchema.index({ hospital: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

module.exports = Withdrawal;