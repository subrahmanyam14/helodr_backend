const mongoose = require("mongoose");

const StatisticsSchema = new mongoose.Schema({
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true,
        unique: true
      },
    average_rating: {
      type: Number,
      default: 0,
    },
    total_ratings: {
      type: Number,
      default: 0,
    },
    appointment_count: {
      type: Number,
      default: 0,
    },
    total_earnings: {
      type: Number,
      default: 0,
    },
  });

  module.exports = mongoose.model("Statistics", StatisticsSchema);
