// TopHospitalListing.js (Updated)
const mongoose = require("mongoose");

const topHospitalListingSchema = new mongoose.Schema({
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
topHospitalListingSchema.index({ isActive: 1, endDate: 1 });
topHospitalListingSchema.index({ hospital: 1 }, { unique: true, partialFilterExpression: { isActive: true } });

const TopHospitalListing = mongoose.model("TopHospitalListing", topHospitalListingSchema);
module.exports = TopHospitalListing;