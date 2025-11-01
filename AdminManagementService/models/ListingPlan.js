// ListingPlan.js
const mongoose = require("mongoose");

const listingPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ["top_doctor", "top_hospital", "hospital_advertisement"]
  },
  type: {
    type: String,
    required: true,
    enum: ["monthly", "annual"]
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: "INR"
  },
  features: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  description: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

listingPlanSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

const ListingPlan = mongoose.model("ListingPlan", listingPlanSchema);
module.exports = ListingPlan;