const mongoose = require("mongoose");

const StatisticsSchema = new mongoose.Schema({
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true,
        unique: true
      },
    average_rating: Number,
    total_ratings: Number,
    appointment_count: Number,
    total_earnings: Number
  });

  module.exports = mongoose.model("Statistics", StatisticsSchema);
