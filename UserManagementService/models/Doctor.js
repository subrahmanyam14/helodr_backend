const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  // Basic Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  title: {
    type: String,
    enum: ["Dr.", "Prof.", "Mr.", "Mrs.", "Ms.", null],
    default: "Dr."
  },
  specialization: {
    type: String,
    required: [true, "Specialization is required"],
    index: true
  },
  subSpecializations: [{
    type: String,
    index: true
  }],
  registrationNumber: {
    type: String,
    required: true,
    unique: true
  },

  // Professional Details
  qualifications: [{
    degree: String,
    college: String,
    year: Number,
    certificateUrl: String
  }],
  experience: {
    type: Number,
    min: 0,
    default: 0
  },
  languages: [String],
  bio: {
    type: String,
    maxlength: 2000
  },

  // Practice Information
  clinicConsultationFee: {
    isAvailable: {
      type: Boolean,
      default: false
    },
    consultationFee: {
      type: Number,
      min: 0,
      default: 0
    },
    followUpFee: {
      type: Number,
      min: 0
    },
  },
  // Online Consultation
  onlineConsultation: {
    isAvailable: {
      type: Boolean,
      default: false
    },
    consultationFee: {
      type: Number,
      min: 0,
      default: 0
    },
    followUpFee: {
      type: Number,
      min: 0
    }
  },
  services: [String],

  // Hospital Affiliations
  hospitalAffiliations: [{
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital"
    },
    department: String,
    position: String
  }],

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
  // Verification
  verification: {
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending"
    },
    documents: [String],
    verifiedAt: Date
  },

  verifiedByAdmin: {
    admin:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: Date,
    comments: String
  },

  verifiedBySuperAdmin: {
    superAdmin:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: Date,
    comments: String
  },

  isActive: {
    type: Boolean,
    default: false
  }
});

const Doctor = mongoose.model("Doctor", doctorSchema);

module.exports = Doctor;