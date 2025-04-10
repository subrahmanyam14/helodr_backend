const transactionSchema = new mongoose.Schema({
    user: {              // Doctor/Patient who performed transaction
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    type: {
      type: String,
      enum: [
        "appointment_payment",   // Patient pays for appointment
        "doctor_credit",         // Doctor earns from appointment
        "withdrawal_request",    // Doctor claims money
        "withdrawal_processed",  // Admin processes claim
        "coin_purchase",         // Doctor buys coins
        "service_payment",       // Doctor spends coins
        "refund"                 // Money returned to patient
      ],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    referenceId: {       // Links to appointment/payment/etc
      type: mongoose.Schema.Types.ObjectId
    },
    referenceType: {
      type: String,
      enum: ["Appointment", "Payment", "Withdrawal", "Service"]
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "processing"],
      default: "pending"
    },
    metadata: mongoose.Schema.Types.Mixed,  // Additional data
    notes: String                           // Admin/System notes
  }, { timestamps: true });
  
  const Transaction = mongoose.model("Transaction", transactionSchema);
  module.exports = Transaction;