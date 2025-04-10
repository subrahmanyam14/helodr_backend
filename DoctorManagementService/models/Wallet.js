const mongoose = require("mongoose");

const WalletSchema = new mongoose.Schema({
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true,
        unique: true
      },
    current_balance: Number,
    total_earned: Number,
    total_withdrawn: Number,
    total_spent: Number,
    commission_rate: Number,
    last_payment_date: Date,
    last_withdrawal_date: Date
  });

  module.exports = mongoose.model("Wallet", WalletSchema);
  