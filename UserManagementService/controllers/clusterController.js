const Cluster = require('../models/Cluster');
const mongoose = require('mongoose');

// Create a new cluster
exports.createCluster = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { user, clusterName, latitude, longitude, radius = 50 } = req.body;

        // Validate coordinates
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Valid latitude and longitude are required' });
        }

        // Check for existing cluster for this user
        const existing = await Cluster.findOne({ user }).session(session);
        if (existing) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Cluster already exists for this user.' });
        }

        const cluster = new Cluster({
            user,
            clusterName,
            location: {
                type: "Point",
                coordinates: [longitude, latitude] // GeoJSON format: [long, lat]
            },
            radius
        });

        await cluster.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.status(201).json({ 
            success: true,
            message: 'Cluster created successfully', 
            cluster 
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Create cluster error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: error.message 
        });
    }
};

// Get all clusters with pagination
exports.getAllClusters = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const clusters = await Cluster.find()
            .skip(skip)
            .limit(limit)
            .populate('user', 'name email') // Only select necessary fields
            .populate('doctors', 'name specialty')
            .lean();

        const total = await Cluster.countDocuments();

        res.status(200).json({
            success: true,
            data: clusters,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit),
                limit
            }
        });
    } catch (error) {
        console.error('Fetch clusters error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: error.message 
        });
    }
};

// Get cluster by user ID
exports.getClusterByUserId = async (req, res) => {
    try {
        const cluster = await Cluster.findOne({ user: req.params.userId })
            .populate('user', 'name email')
            .populate('doctors', 'name specialty');

        if (!cluster) {
            return res.status(404).json({ 
                success: false,
                message: 'Cluster not found' 
            });
        }

        res.status(200).json({
            success: true,
            cluster
        });
    } catch (error) {
        console.error('Get cluster error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: error.message 
        });
    }
};

// Update cluster by ID
exports.updateCluster = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { clusterName, latitude, longitude, radius } = req.body;
        const updates = {};

        if (clusterName) updates.clusterName = clusterName;
        if (radius) updates.radius = radius;
        
        if (latitude && longitude) {
            updates.location = {
                type: "Point",
                coordinates: [longitude, latitude]
            };
        }

        const updatedCluster = await Cluster.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, session }
        ).populate('user').populate('doctors');

        if (!updatedCluster) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ 
                success: false,
                message: 'Cluster not found' 
            });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ 
            success: true,
            message: 'Cluster updated', 
            cluster: updatedCluster 
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Update cluster error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: error.message 
        });
    }
};

// Delete cluster by ID
exports.deleteCluster = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const deleted = await Cluster.findByIdAndDelete(req.params.id, { session });
        if (!deleted) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ 
                success: false,
                message: 'Cluster not found' 
            });
        }

        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ 
            success: true,
            message: 'Cluster deleted successfully' 
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Delete cluster error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Server error',
            error: error.message 
        });
    }
};

// Find nearest clusters to a point
exports.findNearbyClusters = async (req, res) => {
    try {
        const { longitude, latitude, maxDistance = 5000 } = req.query; // maxDistance in meters

        if (!longitude || !latitude) {
            return res.status(400).json({
                success: false,
                message: 'Longitude and latitude are required'
            });
        }

        const clusters = await Cluster.find({
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: parseInt(maxDistance)
                }
            },
            isActive: true
        }).populate('user', 'name');

        res.status(200).json({
            success: true,
            count: clusters.length,
            clusters
        });
    } catch (error) {
        console.error('Find nearby clusters error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};




////reqbody


// {
//     "user": "65d5f8a1c4b3e12a7f8b4567",
//     "clusterName": "Downtown Medical Cluster",
//     "latitude": 40.7128,
//     "longitude": -74.0060,
//     "radius": 100
//   }
