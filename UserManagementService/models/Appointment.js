const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
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
  appointmentType: {
    type: String,
    enum: ["clinic", "video"],
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  slot: {
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    }
  },
  reason: {
    type: String,
    maxlength: [500, "Reason cannot exceed 500 characters"]
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "completed", "cancelled", "no_show", "rescheduled"],
    default: "pending"
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Payment"
  }, 
  rescheduledFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment"
  }, 
  medicalRecords: [{
    type: {
      type: String,
      enum: ["prescription", "report", "image", "other"]
    },
    url: String,
    description: String
  }],
  prescription: {
    diagnosis: String,
    medicines: [{
      name: String,
      dosage: String,
      duration: String,
      notes: String
    }],
    tests: [String],
    advice: String,
    followUpDate: Date
  },
  review: {
    rating: {
      type: Number,
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
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  videoConferenceLink: {
    type: String
  },
  cancellation: {
    initiatedBy: {
      type: String,
      enum: ["patient", "doctor", "hospital", "system"]
    },
    reason: String,
    refundAmount: Number,
    cancelledAt: Date
  },
  reminders: [{
    type: {
      type: String,
      enum: ["email", "sms", "push"]
    },
    sentAt: Date,
    status: String
  }],
  followUp: {
    isRequired: Boolean,
    date: Date,
    originalAppointment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment"
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Middleware to update doctor's average rating when a review is added
appointmentSchema.post('save', async function(doc) {
  if (doc.review && doc.review.rating) {
    const Doctor = mongoose.model('Doctor');
    const doctor = await Doctor.findById(doc.doctor);
    
    if (doctor) {
      const totalRatings = doctor.totalRatings + 1;
      const newAverage = ((doctor.averageRating * doctor.totalRatings) + doc.review.rating) / totalRatings;
      
      await Doctor.findByIdAndUpdate(doc.doctor, {
        averageRating: newAverage,
        totalRatings: totalRatings
      });
    }
  }
});

// Post-update hook to check for completion and process earning
appointmentSchema.post('findOneAndUpdate', async function(doc) {
  if (doc && doc.status === "completed") {
    const UpcomingEarnings = mongoose.model("UpcomingEarnings");

    try {
      const earning = await UpcomingEarnings.findOne({
        appointment: doc._id,
        status: "pending"
      });

      if (earning) {
        await earning.processEarning();
        console.log(`Processed earnings for appointment: ${doc._id}`);
      }
    } catch (error) {
      console.error(`Failed to process earnings for appointment ${doc._id}:`, error);
    }
  }
});


// Virtual for appointment duration
appointmentSchema.virtual('duration').get(function() {
  const start = new Date(`1970-01-01T${this.slot.startTime}Z`);
  const end = new Date(`1970-01-01T${this.slot.endTime}Z`);
  return (end - start) / (1000 * 60); // duration in minutes
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

module.exports = Appointment;