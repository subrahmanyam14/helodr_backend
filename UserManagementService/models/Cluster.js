const mongoose = require('mongoose');
const User = require('./User');

const clusterSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },
    clusterName: {
        type: String,
        required: true,
        trim: true
    },
    location: {  // Changed to GeoJSON format for better geospatial queries
        type: {
            type: String,
            default: "Point",
            enum: ["Point"]
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    radius: {
        type: Number,
        default: 50, // in meters
        min: 10      // minimum radius
    },
    doctors: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }],
        default: [],
        validate: [arrayLimit, '{PATH} exceeds the limit of 100 doctors'] // Add doctor limit
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Validate doctors array length
function arrayLimit(val) {
    return val.length <= 100;
}

// Create geospatial index
clusterSchema.index({ location: "2dsphere" });

// Virtual for latitude (easier access)
clusterSchema.virtual('latitude').get(function() {
    return this.location.coordinates[1];
});

// Virtual for longitude (easier access)
clusterSchema.virtual('longitude').get(function() {
    return this.location.coordinates[0];
});

const Cluster = mongoose.model("Cluster", clusterSchema);

module.exports = Cluster;