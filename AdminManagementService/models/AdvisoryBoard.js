// AdvisoryBoard.js (Updated)
const mongoose = require("mongoose");

const advisoryBoardSchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true,
    unique: true
  },
  position: {
    type: String,
    required: true,
    enum: ["chairman", "vice_chairman", "member", "advisor"]
  },
  specialization: {
    type: String,
    required: true
  },
  bio: {
    type: String,
    maxlength: 1000
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  socialLinks: {
    linkedin: String,
    twitter: String,
    website: String
  },
  achievements: [String],
  metadata: mongoose.Schema.Types.Mixed
}, { 
  timestamps: true 
});

// Indexes remain the same
advisoryBoardSchema.index({ isActive: 1, order: 1 });
advisoryBoardSchema.index({ doctor: 1 }, { unique: true });

const AdvisoryBoard = mongoose.model("AdvisoryBoard", advisoryBoardSchema);
module.exports = AdvisoryBoard;