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
    hospitals: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hospital"
        }],
        default: [],
        validate: [arrayLimit, '{PATH} exceeds the limit of 50 hospitals'] // Adjusted limit for hospitals
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

// Validate hospitals array length
function arrayLimit(val) {
    return val.length <= 50;
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

// Virtual to populate hospitals
clusterSchema.virtual('hospitalDetails', {
    ref: 'Hospital',
    localField: 'hospitals',
    foreignField: '_id'
});

// Instance method to add hospital to cluster
clusterSchema.methods.addHospital = function(hospitalId) {
    if (!this.hospitals.includes(hospitalId)) {
        this.hospitals.push(hospitalId);
    }
    return this.save();
};

// Instance method to remove hospital from cluster
clusterSchema.methods.removeHospital = function(hospitalId) {
    this.hospitals = this.hospitals.filter(id => !id.equals(hospitalId));
    return this.save();
};

// Static method to find clusters near a location
clusterSchema.statics.findNearby = function(coordinates, maxDistance = 5000) {
    return this.find({
        location: {
            $near: {
                $geometry: {
                    type: "Point",
                    coordinates: coordinates
                },
                $maxDistance: maxDistance
            }
        },
        isActive: true
    }).populate('hospitals');
};

const Cluster = mongoose.model("Cluster", clusterSchema);

module.exports = Cluster;