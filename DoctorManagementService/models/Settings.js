const mongoose = require("mongoose");

const SettingsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
    email_notifications: Boolean,
    sms_notifications: Boolean,
    push_notifications: Boolean,
    auto_withdraw: Boolean,
    auto_withdraw_threshold: Number,
    payment_method: String
  });

  module.exports = mongoose.model("Settings", SettingsSchema);
