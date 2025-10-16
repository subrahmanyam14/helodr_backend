const Cluster = require('../models/Cluster');
const Hospital = require('../models/Hospital');
const mongoose = require('mongoose');

// Create a new cluster
exports.createCluster = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { user, clusterName, latitude, longitude, radius = 50000 } = req.body; // Default radius 50km

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
                coordinates: [parseFloat(longitude), parseFloat(latitude)] // GeoJSON format: [long, lat]
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
            .populate('user', 'name email')
            .populate('hospitals', 'name type address specialties') // Populate hospital details
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
            .populate('hospitals', 'name type address specialties facilities contact services statistics'); // Detailed hospital info

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
                coordinates: [parseFloat(longitude), parseFloat(latitude)]
            };
        }

        const updatedCluster = await Cluster.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, session }
        ).populate('user').populate('hospitals');

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
        const { longitude, latitude, maxDistance = 500000 } = req.query; // maxDistance in meters (500km default)

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
        })
        .populate('user', 'name')
        .populate('hospitals', 'name type address.city address.state specialties');

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

// Add hospital to cluster
// Add hospital to cluster
exports.addHospitalToCluster = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { clusterId, hospitalId } = req.params;

        const cluster = await Cluster.findById(clusterId).session(session);
        if (!cluster) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Cluster not found'
            });
        }

        const hospital = await Hospital.findById(hospitalId).session(session);
        if (!hospital) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Hospital not found'
            });
        }

        // Check if hospital is already in cluster
        if (cluster.hospitals.includes(hospitalId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Hospital already exists in this cluster'
            });
        }

        // Check hospital limit
        if (cluster.hospitals.length >= 50) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Cluster has reached maximum hospital limit (50)'
            });
        }

        // Add hospital to cluster
        await cluster.addHospital(hospitalId);

        // Add cluster to hospital's clusters array - FIXED
        if (!hospital.clusters) {
            hospital.clusters = []; // Initialize if undefined
        }
        hospital.clusters.push(clusterId);
        await hospital.save({ session });

        await session.commitTransaction();
        session.endSession();

        const updatedCluster = await Cluster.findById(clusterId)
            .populate('hospitals', 'name type address specialties');

        res.status(200).json({
            success: true,
            message: 'Hospital added to cluster successfully',
            cluster: updatedCluster
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Add hospital to cluster error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Remove hospital from cluster
exports.removeHospitalFromCluster = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { clusterId, hospitalId } = req.params;

        const cluster = await Cluster.findById(clusterId).session(session);
        if (!cluster) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Cluster not found'
            });
        }

        const hospital = await Hospital.findById(hospitalId).session(session);
        if (!hospital) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Hospital not found'
            });
        }

        // Check if hospital exists in cluster
        if (!cluster.hospitals.includes(hospitalId)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: 'Hospital not found in this cluster'
            });
        }

        // Remove hospital from cluster
        await cluster.removeHospital(hospitalId);

        // Remove cluster from hospital's clusters array
        hospital.clusters = hospital.clusters.filter(id => !id.equals(clusterId));
        await hospital.save({ session });

        await session.commitTransaction();
        session.endSession();

        const updatedCluster = await Cluster.findById(clusterId)
            .populate('hospitals', 'name type address specialties');

        res.status(200).json({
            success: true,
            message: 'Hospital removed from cluster successfully',
            cluster: updatedCluster
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Remove hospital from cluster error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Find hospitals within cluster radius
exports.getHospitalsInCluster = async (req, res) => {
    try {
        const cluster = await Cluster.findById(req.params.clusterId)
            .populate('hospitals', 'name type address specialties facilities contact services statistics');

        if (!cluster) {
            return res.status(404).json({
                success: false,
                message: 'Cluster not found'
            });
        }

        // Find nearby hospitals within cluster radius (optional - for discovering new hospitals)
        const nearbyHospitals = await Hospital.findNearby(
            cluster.location.coordinates,
            cluster.radius
        );

        res.status(200).json({
            success: true,
            clusterHospitals: cluster.hospitals,
            nearbyHospitals: nearbyHospitals.filter(hospital => 
                !cluster.hospitals.some(clusterHospital => 
                    clusterHospital._id.equals(hospital._id)
                )
            ),
            clusterInfo: {
                name: cluster.clusterName,
                radius: cluster.radius,
                location: cluster.location
            }
        });

    } catch (error) {
        console.error('Get hospitals in cluster error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};

// Auto-populate cluster with nearby hospitals
exports.autoPopulateCluster = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const cluster = await Cluster.findById(req.params.clusterId).session(session);
        if (!cluster) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({
                success: false,
                message: 'Cluster not found'
            });
        }

        // Find verified hospitals within cluster radius
        const nearbyHospitals = await Hospital.find({
            'address.coordinates': {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: cluster.location.coordinates
                    },
                    $maxDistance: cluster.radius
                }
            },
            'verification.status': 'verified'
        }).session(session);

        let addedCount = 0;
        for (const hospital of nearbyHospitals) {
            if (cluster.hospitals.length >= 50) break; // Respect limit
            
            if (!cluster.hospitals.includes(hospital._id)) {
                await cluster.addHospital(hospital._id);
                
                // Add cluster to hospital's clusters array
                if (!hospital.clusters.includes(cluster._id)) {
                    hospital.clusters.push(cluster._id);
                    await hospital.save({ session });
                }
                
                addedCount++;
            }
        }

        await session.commitTransaction();
        session.endSession();

        const updatedCluster = await Cluster.findById(cluster._id)
            .populate('hospitals', 'name type address specialties');

        res.status(200).json({
            success: true,
            message: `Added ${addedCount} hospitals to cluster`,
            cluster: updatedCluster,
            stats: {
                added: addedCount,
                total: updatedCluster.hospitals.length
            }
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Auto-populate cluster error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message
        });
    }
};