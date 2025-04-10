const withdrawalSchema = new mongoose.Schema({
    doctor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Doctor",
      required: true
    },
    amount: {           // In rupees
      type: Number,
      required: true,
      min: 100          // Minimum withdrawal amount
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "rejected"],
      default: "pending"
    },
    paymentMethod: {
      type: String,
      enum: ["bank_transfer", "upi"],
      required: true
    },
    transaction: {      // Links to the transaction record
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction"
    },
    processedBy: {      // Admin who processed
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    processedAt: Date,
    rejectionReason: String
  }, { timestamps: true });
  
  const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);
  
  module.exports = Withdrawal;