const mongoose = require('mongoose');

const hospitalAffiliationRequestSchema = new mongoose.Schema({
  hospital: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hospital",
    required: [true, "Hospital is required"],
    index: true
  },
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: [true, "Doctor is required"],
    index: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Requesting user is required"]
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected", "cancelled"],
    default: "pending",
    index: true
  },
  reason: {
    type: String,
    required: [true, "Reason for affiliation request is required"],
    maxlength: 1000
  },
  
  // Additional details for the affiliation
  proposedDetails: {
    department: {
      type: String,
      trim: true
    },
    position: {
      type: String,
      trim: true
    },
    startDate: {
      type: Date
    }
  },

  // Response from doctor
  responseMessage: {
    type: String,
    maxlength: 1000
  },
  respondedAt: {
    type: Date
  },
  
  // Expiration for pending requests (optional)
  expiresAt: {
    type: Date,
    default: function() {
      // Default expiration: 30 days from creation
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to prevent duplicate pending requests from SAME hospital to SAME doctor
hospitalAffiliationRequestSchema.index(
  { hospital: 1, doctor: 1, status: 1 },
  { 
    unique: true,
    partialFilterExpression: { status: "pending" },
    name: "unique_pending_hospital_doctor"
  }
);

// Index for querying requests by hospital
hospitalAffiliationRequestSchema.index({ hospital: 1, createdAt: -1 });

// Index for querying requests by doctor
hospitalAffiliationRequestSchema.index({ doctor: 1, createdAt: -1 });

// Virtual to check if request is expired
hospitalAffiliationRequestSchema.virtual('isExpired').get(function() {
  return this.status === 'pending' && this.expiresAt < new Date();
});

// Method to accept the request and create hospital affiliation
hospitalAffiliationRequestSchema.methods.acceptRequest = async function(responseMessage = '') {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Update request status
    this.status = 'accepted';
    this.responseMessage = responseMessage;
    this.respondedAt = new Date();
    await this.save({ session });

    // Add affiliation to doctor's record
    const Doctor = mongoose.model('Doctor');
    const doctor = await Doctor.findById(this.doctor).session(session);
    
    if (!doctor) {
      throw new Error('Doctor not found');
    }

    // Check if affiliation already exists
    const existingAffiliation = doctor.hospitalAffiliations.find(
      aff => aff.hospital.toString() === this.hospital.toString()
    );

    if (!existingAffiliation) {
      doctor.hospitalAffiliations.push({
        hospital: this.hospital,
        department: this.proposedDetails.department,
        position: this.proposedDetails.position,
        from: this.proposedDetails.startDate || new Date(),
        currentlyWorking: true
      });
      await doctor.save({ session });
    }

    // Add doctor to hospital's doctors array
    const Hospital = mongoose.model('Hospital');
    const hospital = await Hospital.findById(this.hospital).session(session);
    
    if (hospital && !hospital.doctors.includes(this.doctor)) {
      hospital.doctors.push(this.doctor);
      await hospital.save({ session });
    }

    await session.commitTransaction();
    return this;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Method to reject the request
hospitalAffiliationRequestSchema.methods.rejectRequest = async function(responseMessage = '') {
  this.status = 'rejected';
  this.responseMessage = responseMessage;
  this.respondedAt = new Date();
  await this.save();
  return this;
};

// Method to cancel the request (by hospital)
hospitalAffiliationRequestSchema.methods.cancelRequest = async function() {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be cancelled');
  }
  this.status = 'cancelled';
  this.respondedAt = new Date();
  await this.save();
  return this;
};

// Static method to create a new request
hospitalAffiliationRequestSchema.statics.createRequest = async function(data) {
  const { hospitalId, doctorId, requestedById, reason, proposedDetails } = data;

  // Check if there's already a pending request
  const existingRequest = await this.findOne({
    hospital: hospitalId,
    doctor: doctorId,
    status: 'pending'
  });

  if (existingRequest) {
    throw new Error('A pending request already exists for this doctor and hospital');
  }

  // Verify the requesting user is associated with the hospital
  const Hospital = mongoose.model('Hospital');
  const hospital = await Hospital.findById(hospitalId);
  
  if (!hospital) {
    throw new Error('Hospital not found');
  }

  if (hospital.addedBy.toString() !== requestedById.toString()) {
    throw new Error('Only hospital admin can create affiliation requests');
  }

  // Create the request
  const request = await this.create({
    hospital: hospitalId,
    doctor: doctorId,
    requestedBy: requestedById,
    reason,
    proposedDetails: proposedDetails || {}
  });

  return request;
};

// Static method to get pending requests for a doctor
hospitalAffiliationRequestSchema.statics.getPendingRequestsForDoctor = async function(doctorId) {
  return await this.find({
    doctor: doctorId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
  .populate('hospital', 'name type address contact')
  .populate('requestedBy', 'fullName email')
  .sort({ createdAt: -1 });
};

// Static method to get all requests for a hospital
hospitalAffiliationRequestSchema.statics.getRequestsForHospital = async function(hospitalId, status = null) {
  const query = { hospital: hospitalId };
  if (status) {
    query.status = status;
  }

  return await this.find(query)
    .populate('doctor', 'fullName specializations registrationNumber')
    .populate('requestedBy', 'fullName email')
    .sort({ createdAt: -1 });
};

// Middleware to auto-expire old pending requests
hospitalAffiliationRequestSchema.pre('find', function() {
  // Optionally auto-update expired requests
  this.where('status').ne('expired');
});

const HospitalAffiliationRequest = mongoose.model("HospitalAffiliationRequest", hospitalAffiliationRequestSchema);

module.exports = HospitalAffiliationRequest;