// ListingPayment.js
const mongoose = require("mongoose");

const ListingPaymentSchema = new mongoose.Schema({
  // Core ListingPayment Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ["HospitalAdvertisement", "TopDoctorListing", "TopHospitalListing"]
  },
  entity: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'entityType'
  },

  // ListingPayment Details
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ListingPlan",
    required: function () {
      return !this.isManualAddition; // Required only for paid listings
    }
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
  paymentMethod: {
    type: String,
    enum: ["razorpay", "manual", "free", "other"],
    default: "razorpay"
  },

  // Razorpay Specific Fields
  razorpay: {
    orderId: String,
    paymentId: String,
    signature: String,
    orderResponse: mongoose.Schema.Types.Mixed,
    paymentResponse: mongoose.Schema.Types.Mixed
  },

  // Payment Status & Lifecycle
  paymentStatus: {
    type: String,
    enum: [
      "created",       // Order created in Razorpay
      "attempted",     // Payment attempted but not completed
      "paid",          // Payment successful
      "failed",        // Payment failed
      "refunded",      // Payment refunded
      "partially_refunded",
      "cancelled",     // Payment cancelled
      "expired"        // Razorpay order expired
    ],
    default: "created"
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "processing", "refunded"],
    default: "pending"
  },

  // Manual Addition Fields (for admin)
  isManualAddition: {
    type: Boolean,
    default: false
  },
  addedByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  adminNotes: String,

  // Subscription & Validity
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

  // Retry & Refund Information
  paymentAttempts: [{
    attemptDate: {
      type: Date,
      default: Date.now
    },
    razorpayOrderId: String,
    amount: Number,
    status: String,
    error: mongoose.Schema.Types.Mixed
  }],
  refunds: [{
    refundDate: Date,
    razorpayRefundId: String,
    amount: Number,
    reason: String,
    notes: String,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  }],

  // Analytics & Tracking
  metadata: mongoose.Schema.Types.Mixed,
  notes: String,

  // Timestamps
  paidAt: Date,
  failedAt: Date,
  refundedAt: Date
}, {
  timestamps: true
});

// Indexes for optimal querying
ListingPaymentSchema.index({ user: 1, createdAt: -1 });
ListingPaymentSchema.index({ entityType: 1, entity: 1 });
ListingPaymentSchema.index({ "razorpay.orderId": 1 }, { unique: true, sparse: true });
ListingPaymentSchema.index({ "razorpay.paymentId": 1 }, { unique: true, sparse: true });
ListingPaymentSchema.index({ paymentStatus: 1 });
ListingPaymentSchema.index({ isActive: 1, endDate: 1 });
ListingPaymentSchema.index({ isManualAddition: 1 });

// Virtual for checking if payment is currently active
ListingPaymentSchema.virtual('isCurrentlyActive').get(function () {
  return this.isActive && this.endDate && this.endDate > new Date();
});

// Virtual for days remaining
ListingPaymentSchema.virtual('daysRemaining').get(function () {
  if (!this.endDate || !this.isActive) return 0;
  const now = new Date();
  const end = new Date(this.endDate);
  const diffTime = end - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Pre-save middleware
ListingPaymentSchema.pre('save', function (next) {
  // Auto-set dates based on status changes
  if (this.isModified('paymentStatus')) {
    const now = new Date();

    if (this.paymentStatus === 'paid' && !this.paidAt) {
      this.paidAt = now;
      this.status = 'completed';
    }

    if ((this.paymentStatus === 'failed' || this.paymentStatus === 'cancelled') && !this.failedAt) {
      this.failedAt = now;
      this.status = 'failed';
    }

    if ((this.paymentStatus === 'refunded' || this.paymentStatus === 'partially_refunded') && !this.refundedAt) {
      this.refundedAt = now;
      this.status = 'refunded';
    }
  }

  next();
});

// Static Methods
ListingPaymentSchema.statics.findActivePayments = function (entityType, entityId) {
  return this.find({
    entityType,
    entity: entityId,
    isActive: true,
    endDate: { $gt: new Date() }
  }).sort({ createdAt: -1 });
};

ListingPaymentSchema.statics.findUserPayments = function (userId, options = {}) {
  const query = { user: userId };
  if (options.entityType) query.entityType = options.entityType;
  if (options.paymentStatus) query.paymentStatus = options.paymentStatus;

  return this.find(query)
    .populate('plan')
    .populate('entity')
    .sort({ createdAt: -1 });
};

// Instance Methods
ListingPaymentSchema.methods.markAsPaid = function (razorpayData = {}) {
  this.paymentStatus = 'paid';
  this.status = 'completed';
  this.isActive = true;
  this.paidAt = new Date();

  if (razorpayData.paymentId) {
    this.razorpay.paymentId = razorpayData.paymentId;
  }
  if (razorpayData.signature) {
    this.razorpay.signature = razorpayData.signature;
  }
  if (razorpayData.paymentResponse) {
    this.razorpay.paymentResponse = razorpayData.paymentResponse;
  }

  // Calculate end date based on plan
  if (this.plan && this.plan.type) {
    const startDate = new Date();
    this.startDate = startDate;

    if (this.plan.type === 'monthly') {
      this.endDate = new Date(startDate.setMonth(startDate.getMonth() + 1));
    } else if (this.plan.type === 'annual') {
      this.endDate = new Date(startDate.setFullYear(startDate.getFullYear() + 1));
    }
  }

  return this.save();
};

ListingPaymentSchema.methods.addRefund = function (refundData) {
  if (!this.refunds) {
    this.refunds = [];
  }

  this.refunds.push({
    refundDate: new Date(),
    razorpayRefundId: refundData.razorpayRefundId,
    amount: refundData.amount,
    reason: refundData.reason,
    notes: refundData.notes,
    processedBy: refundData.processedBy
  });

  // Update payment status based on refund amount
  if (refundData.amount === this.amount) {
    this.paymentStatus = 'refunded';
    this.isActive = false;
  } else {
    this.paymentStatus = 'partially_refunded';
  }

  return this.save();
};

ListingPaymentSchema.methods.addPaymentAttempt = function (attemptData) {
  if (!this.paymentAttempts) {
    this.paymentAttempts = [];
  }

  this.paymentAttempts.push({
    attemptDate: new Date(),
    razorpayOrderId: attemptData.razorpayOrderId,
    amount: attemptData.amount,
    status: attemptData.status,
    error: attemptData.error
  });

  return this.save();
};

const ListingPayment = mongoose.model("ListingPayment", ListingPaymentSchema);
module.exports = ListingPayment;