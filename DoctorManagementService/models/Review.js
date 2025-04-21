const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment",
    required: true,
    unique: true
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  feedback: {
    type: String,
    maxlength: [1000, "Feedback cannot exceed 1000 characters"]
  },
  aspects: {
    waitingTime: {
      type: Number,
      min: 1,
      max: 5
    },
    staffCourteousness: {
      type: Number,
      min: 1,
      max: 5
    },
    doctorKnowledge: {
      type: Number,
      min: 1,
      max: 5
    },
    doctorFriendliness: {
      type: Number,
      min: 1,
      max: 5
    },
    treatmentExplanation: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  moderationReason: String,
  reply: {
    text: String,
    date: Date
  },
  isVerifiedConsultation: {
    type: Boolean,
    default: true
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  unhelpfulCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Middleware to update doctor's average rating when a review is added
reviewSchema.post('save', async function(doc) {
  if (doc.rating) {
    const Doctor = mongoose.model('Doctor');
    const doctor = await Doctor.findById(doc.doctor);
    
    if (doctor) {
      await doctor.updateRating(doc.rating);
    }
    
    // If hospital is associated, update hospital rating too
    if (doc.hospital) {
      const Hospital = mongoose.model('Hospital');
      const hospital = await Hospital.findById(doc.hospital);
      
      if (hospital) {
        hospital.totalRatings += 1;
        
        // Calculate new average
        hospital.averageRating = 
          ((hospital.averageRating * (hospital.totalRatings - 1)) + doc.rating) / 
          hospital.totalRatings;
        
        await hospital.save();
      }
    }
  }
});

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;