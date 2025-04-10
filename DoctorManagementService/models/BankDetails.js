const mongoose = require("mongoose");

const BankDetailsSchema = new mongoose.Schema({
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true,
        unique: true
      },
    account_num: String,
    account_name: String,
    bank_name: String,
    IFSC_code: String,
    UPI_id: String,
    is_verified: Boolean
  });
  
  module.exports = mongoose.model("BankDetails", BankDetailsSchema);
