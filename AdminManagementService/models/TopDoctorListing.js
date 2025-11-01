// TopDoctorListing.js (Updated)
const mongoose = require("mongoose");

const topDoctorListingSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
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
  isFeatured: {
    type: Boolean,
    default: false
  },
  featuredOrder: {
    type: Number,
    default: 0
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
  },
  metadata: mongoose.Schema.Types.Mixed
}, { 
  timestamps: true 
});

// Indexes remain the same
topDoctorListingSchema.index({ isActive: 1, endDate: 1 });
topDoctorListingSchema.index({ doctor: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

// Method to check if listing is active
topDoctorListingSchema.methods.isListingActive = function() {
  return this.isActive && this.endDate && this.endDate > new Date();
};

const TopDoctorListing = mongoose.model("TopDoctorListing", topDoctorListingSchema);
module.exports = TopDoctorListing;