const mongoose = require("mongoose");
const hospitalSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ["private", "government", "clinic", "diagnostic_center", "multi_specialty"],
    default: "hospital"
  },
  about: {
    type: String,
    maxlength: 2000
  },
  specialties: [String],
  facilities: [String],

  // Location Information
  address: {
    street: String,
    city: String,
    state: String,
    country: {
      type: String,
      default: "India"
    },
    pinCode: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: "2dsphere"
    }
  },

  // Contact Information
  contact: {
    phone: String,
    email: String,
    website: String
  },

  // Services
  services: {
    emergency: Boolean,
    ambulance: Boolean,
    insuranceSupport: Boolean
  },

  // Doctors (reference only)
  doctors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor"
  }],

  // Statistics
  statistics: {
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalRatings: {
      type: Number,
      default: 0
    }
  },

  // Verification
  verification: {
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending"
    },
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  },

  // Media
  photos: [String], // URLs to photos
  featuredImage: {
    type: String
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// // Virtuals
// hospitalSchema.virtual('profileUrl').get(function() {
//   return `/hospitals/${this._id}`;
// });

// Methods
hospitalSchema.methods.updateRating = async function(newRating) {
  const totalRatings = this.statistics.totalRatings + 1;
  const newAverage = ((this.statistics.averageRating * this.statistics.totalRatings) + newRating) / totalRatings;
  
  this.statistics.averageRating = newAverage;
  this.statistics.totalRatings = totalRatings;
  await this.save();
};

// Indexes
hospitalSchema.index({ name: 'text', specialties: 'text' });
hospitalSchema.index({ 'address.coordinates': '2dsphere' });

const Hospital = mongoose.model("Hospital", hospitalSchema);

module.exports = Hospital;