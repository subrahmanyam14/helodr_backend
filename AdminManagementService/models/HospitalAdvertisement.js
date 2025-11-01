// HospitalAdvertisement.js (Updated)
const mongoose = require("mongoose");

const hospitalAdvertisementSchema = new mongoose.Schema({
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hospital",
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  // Media assets
  video: {
    url: String,
    thumbnail: String,
    duration: Number
  },
  image: {
    url: String,
    altText: String
  },
  titleCard: {
    url: String,
    altText: String
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ListingPlan"
  },
  // Payment reference
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ListingPayment"
  },
  // Placement information
  placement: {
    type: String,
    enum: ["homepage", "search_results", "hospital_page", "all"],
    default: "all"
  },
  clicks: {
    type: Number,
    default: 0
  },
  impressions: {
    type: Number,
    default: 0
  },
  startDate: {
    type: Date,
    default: null
  },
  endDate: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: false
  },
  // Admin manual addition fields
  addedByAdmin: {
    type: Boolean,
    default: false
  },
  adminNotes: String,
  adminAddedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true
});

const HospitalAdvertisement = mongoose.model("HospitalAdvertisement", hospitalAdvertisementSchema);
module.exports = HospitalAdvertisement;