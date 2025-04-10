const mongoose = require("mongoose");

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

// Process payment and distribute to doctor
paymentSchema.methods.processPayment = async function() {
  if (this.status !== 'captured') {
    throw new Error('Payment must be captured before processing');
  }
  
  const Doctor = mongoose.model('Doctor');
  const doctor = await Doctor.findById(this.doctor);
  
  if (!doctor) throw new Error('Doctor not found');
  
  const commission = doctor.wallet.commissionRate || 20;
  const platformCommission = this.amount * (commission / 100);
  const doctorShare = this.amount - platformCommission;
  
  await doctor.addCoins(
    doctorShare, 
    'appointment', 
    `Payment for appointment ${this.appointment}`
  );
  
  return { doctorShare, platformCommission };
};

const Payment = mongoose.model("Payment", paymentSchema);