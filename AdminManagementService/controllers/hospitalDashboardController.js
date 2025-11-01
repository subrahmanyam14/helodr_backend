const Hospital = require('../models/Hospital');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Cluster = require('../models/Cluster');

/**
 * @desc    Get all hospitals with optional filters and includes
 * @route   GET /api/hospitals
 * @access  Private (Admin)
 * @query   include - comma separated: statistics, verification, doctors
 *          type - filter by hospital type
 *          status - filter by verification status
 */
exports.getAllHospitalsByAdminCluster = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      type, 
      verificationStatus,
      search 
    } = req.query;
    
    // Find the cluster assigned to this admin
    const cluster = await Cluster.findOne({ 
      user: adminId,
      isActive: true 
    });
    
    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No active cluster found for this admin'
      });
    }
    
    // Build query for hospitals in this cluster
    const query = {
      _id: { $in: cluster.hospitals }
    };
    
    // Add filters if provided
    if (type) query.type = type;
    if (verificationStatus) query['verification.status'] = verificationStatus;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { specialties: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Execute query with pagination
    const skip = (page - 1) * limit;
    const hospitals = await Hospital.find(query)
      .populate('doctors', 'fullName specializations experience review')
      .populate('verification.verifiedBy', 'fullName email')
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });
    
    const totalHospitals = await Hospital.countDocuments(query);
    
    // Enrich with statistics
    const enrichedHospitals = await Promise.all(
      hospitals.map(async (hospital) => {
        const hospitalObj = hospital.toObject();
        
        const appointmentsCount = await Appointment.countDocuments({
          doctor: { $in: hospital.doctors || [] }
        });
        
        hospitalObj.statistics = {
          ...hospitalObj.statistics,
          doctorsCount: hospital.doctors ? hospital.doctors.length : 0,
          appointmentsCount
        };
        
        return hospitalObj;
      })
    );
    
    res.status(200).json({
      success: true,
      count: enrichedHospitals.length,
      totalHospitals,
      totalPages: Math.ceil(totalHospitals / limit),
      currentPage: parseInt(page),
      clusterInfo: {
        id: cluster._id,
        name: cluster.clusterName,
        location: cluster.location,
        radius: cluster.radius
      },
      data: enrichedHospitals
    });
  } catch (error) {
    console.error('Get hospitals by admin cluster error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hospitals',
      error: error.message
    });
  }
};

/**
 * @desc    Get single hospital by ID
 * @route   GET /api/hospitals/:id
 * @access  Private
 */
exports.getHospitalById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const hospital = await Hospital.findById(id)
      .populate('doctors', 'fullName specializations experience review')
      .populate('verification.verifiedBy', 'fullName email');
    
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }
    
    const hospitalObj = hospital.toObject();
    
    // Get appointments count
    const appointmentsCount = await Appointment.countDocuments({
      doctor: { $in: hospital.doctors || [] }
    });
    
    hospitalObj.statistics = {
      ...hospitalObj.statistics,
      doctorsCount: hospital.doctors ? hospital.doctors.length : 0,
      appointmentsCount
    };
    
    res.status(200).json({
      success: true,
      data: hospitalObj
    });
  } catch (error) {
    console.error('Get hospital by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hospital',
      error: error.message
    });
  }
};

/**
 * @desc    Create new hospital
 * @route   POST /api/hospitals
 * @access  Private (Admin)
 */
exports.createHospital = async (req, res) => {
  try {
    const {
      name,
      type,
      about,
      specialties,
      facilities,
      address,
      contact,
      services,
      media,
      statistics
    } = req.body;
    
    // Validation
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        message: 'Name and type are required'
      });
    }
    
    // Create hospital
    const hospital = await Hospital.create({
      name,
      type,
      about,
      specialties: specialties || [],
      facilities: facilities || [],
      address: address || {},
      contact: contact || {},
      services: services || { emergency: false, ambulance: false, insuranceSupport: false },
      photos: media?.photos || [],
      featuredImage: media?.featuredImage || '',
      statistics: statistics || { averageRating: 0, totalRatings: 0 },
      verification: {
        status: 'pending'
      },
      addedBy: req.user._id,
      doctors: []
    });
    
    // Populate for response
    await hospital.populate('addedBy', 'fullName email');
    
    const hospitalObj = hospital.toObject();
    hospitalObj.statistics = {
      ...hospitalObj.statistics,
      doctorsCount: 0,
      appointmentsCount: 0
    };
    
    res.status(201).json({
      success: true,
      message: 'Hospital created successfully',
      data: hospitalObj
    });
  } catch (error) {
    console.error('Create hospital error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Hospital with this name already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating hospital',
      error: error.message
    });
  }
};

/**
 * @desc    Update hospital
 * @route   PUT /api/hospitals/:id
 * @access  Private (Admin)
 */
exports.updateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Find hospital
    const hospital = await Hospital.findById(id);
    
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }
    
    // Update fields
    const allowedUpdates = [
      'name', 'type', 'about', 'specialties', 'facilities',
      'address', 'contact', 'services', 'statistics'
    ];
    
    allowedUpdates.forEach(field => {
      if (updateData[field] !== undefined) {
        hospital[field] = updateData[field];
      }
    });
    
    // Handle media separately
    if (updateData.media) {
      if (updateData.media.photos) {
        hospital.photos = updateData.media.photos;
      }
      if (updateData.media.featuredImage !== undefined) {
        hospital.featuredImage = updateData.media.featuredImage;
      }
    }
    
    await hospital.save();
    
    // Populate for response
    await hospital.populate('doctors', 'fullName specializations experience review');
    
    const hospitalObj = hospital.toObject();
    
    // Get appointments count
    const appointmentsCount = await Appointment.countDocuments({
      doctor: { $in: hospital.doctors || [] }
    });
    
    hospitalObj.statistics = {
      ...hospitalObj.statistics,
      doctorsCount: hospital.doctors ? hospital.doctors.length : 0,
      appointmentsCount
    };
    
    res.status(200).json({
      success: true,
      message: 'Hospital updated successfully',
      data: hospitalObj
    });
  } catch (error) {
    console.error('Update hospital error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating hospital',
      error: error.message
    });
  }
};

/**
 * @desc    Verify hospital
 * @route   PUT /api/hospitals/:id/verify
 * @access  Private (Admin)
 */
exports.verifyHospital = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find hospital
    const hospital = await Hospital.findById(id);
    
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }
    
    // Update verification status
    hospital.verification = {
      status: 'verified',
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    };
    
    await hospital.save();
    
    // Populate for response
    await hospital.populate('doctors', 'fullName specializations experience review');
    await hospital.populate('verification.verifiedBy', 'fullName email');
    
    const hospitalObj = hospital.toObject();
    
    // Get appointments count
    const appointmentsCount = await Appointment.countDocuments({
      doctor: { $in: hospital.doctors || [] }
    });
    
    hospitalObj.statistics = {
      ...hospitalObj.statistics,
      doctorsCount: hospital.doctors ? hospital.doctors.length : 0,
      appointmentsCount
    };
    
    res.status(200).json({
      success: true,
      message: 'Hospital verified successfully',
      data: hospitalObj
    });
  } catch (error) {
    console.error('Verify hospital error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying hospital',
      error: error.message
    });
  }
};

/**
 * @desc    Delete hospital
 * @route   DELETE /api/hospitals/:id
 * @access  Private (Admin)
 */
exports.deleteHospital = async (req, res) => {
  try {
    const { id } = req.params;
    
    const hospital = await Hospital.findById(id);
    
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }
    
    // Check if hospital has active doctors
    if (hospital.doctors && hospital.doctors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete hospital with associated doctors. Please remove doctors first.'
      });
    }
    
    await hospital.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Hospital deleted successfully'
    });
  } catch (error) {
    console.error('Delete hospital error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting hospital',
      error: error.message
    });
  }
};

/**
 * @desc    Get hospital growth analytics
 * @route   GET /api/analytics/hospitals/growth
 * @access  Private (Admin)
 */
exports.getHospitalGrowth = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentYear = new Date().getFullYear();
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    
    // If clusterId is provided, get growth for specific cluster
    // Otherwise, get overall hospital growth across all clusters
    if (userId) {
      // Validate cluster existence
      const cluster = await Cluster.findOne({user: userId});
      if (!cluster) {
        return res.status(404).json({
          success: false,
          message: 'Cluster not found'
        });
      }

      // Get quarterly growth for specific cluster
      const clusterGrowthData = await Promise.all(
        quarters.map(async (quarter, index) => {
          const startMonth = index * 3;
          const endMonth = startMonth + 3;
          
          const startDate = new Date(currentYear, startMonth, 1);
          const endDate = new Date(currentYear, endMonth, 0);
          
          // Count hospitals in this cluster that were created by the end of each quarter
          const count = await Hospital.countDocuments({
            _id: { $in: cluster.hospitals },
            createdAt: { $lte: endDate }
          });
          
          return {
            quarter: `${quarter} ${currentYear}`,
            cluster: cluster.clusterName,
            hospitals: count,
            clusterId: cluster._id
          };
        })
      );
      
      res.status(200).json({
        success: true,
        data: clusterGrowthData,
        cluster: {
          id: cluster._id,
          name: cluster.clusterName,
          totalHospitals: cluster.hospitals.length
        }
      });
      
    } else {
      // Get overall hospital growth across all clusters
      const overallGrowthData = await Promise.all(
        quarters.map(async (quarter, index) => {
          const startMonth = index * 3;
          const endMonth = startMonth + 3;
          
          const startDate = new Date(currentYear, startMonth, 1);
          const endDate = new Date(currentYear, endMonth, 0);
          
          // Count all hospitals that exist in any cluster by the end of each quarter
          const count = await Hospital.countDocuments({
            'clusters': { $exists: true, $ne: [] }, // Hospitals that belong to at least one cluster
            createdAt: { $lte: endDate }
          });
          
          return {
            quarter: `${quarter} ${currentYear}`,
            hospitals: count,
            type: 'clustered_hospitals'
          };
        })
      );
      
      res.status(200).json({
        success: true,
        data: overallGrowthData,
        summary: {
          type: 'all_clustered_hospitals',
          description: 'Growth of hospitals that belong to clusters'
        }
      });
    }
    
  } catch (error) {
    console.error('Get hospital growth error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching growth analytics',
      error: error.message
    });
  }
};

/**
 * @desc    Get hospital revenue analytics
 * @route   GET /api/analytics/hospitals/revenue
 * @access  Private (Admin)
 */
exports.getHospitalRevenue = async (req, res) => {
  try {
    const userId = req.user._id;
    const currentYear = new Date().getFullYear();
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    
    let revenueData = [];

    if (userId) {
      // Get revenue for specific cluster
      const cluster = await Cluster.findOne({user: userId}).populate({
        path: 'hospitals',
        populate: {
          path: 'doctors',
          model: 'Doctor'
        }
      });

      if (!cluster) {
        return res.status(404).json({
          success: false,
          message: 'Cluster not found'
        });
      }

      revenueData = await Promise.all(
        quarters.map(async (quarter, index) => {
          const startMonth = index * 3;
          const endMonth = startMonth + 3;
          
          const startDate = new Date(currentYear, startMonth, 1);
          const endDate = new Date(currentYear, endMonth, 0);
          
          console.log(`Processing ${quarter}: ${startDate} to ${endDate}`);
          
          // Get all doctor IDs from hospitals in this cluster
          const doctorIds = [];
          cluster.hospitals.forEach(hospital => {
            if (hospital.doctors && hospital.doctors.length > 0) {
              doctorIds.push(...hospital.doctors.map(doc => doc._id));
            }
          });

          console.log(`Doctor IDs for ${quarter}:`, doctorIds.length);

          if (doctorIds.length === 0) {
            return {
              quarter: `${quarter} ${currentYear}`,
              revenue: 0,
              totalAppointments: 0,
              totalFee: 0,
              platformFee: 0,
              gstAmount: 0,
              originalFee: 0,
              cluster: cluster.clusterName
            };
          }

          // Get appointments with payment population
          const appointments = await Appointment.find({
            doctor: { $in: doctorIds },
            date: { $gte: startDate, $lte: endDate },
            status: 'completed'
          }).populate('payment');

          console.log(`Found ${appointments.length} appointments for ${quarter}`);

          let totalRevenue = 0;
          let totalAppointments = 0;
          let totalFee = 0;
          let platformFee = 0;
          let gstAmount = 0;
          let originalFee = 0;

          // Process each appointment
          for (const apt of appointments) {
            let paymentData = apt.payment;
            
            // If payment not populated, try to find it separately
            if (!paymentData) {
              paymentData = await Payment.findOne({ appointment: apt._id });
            }
            
            if (paymentData && paymentData.status === 'captured') {
              totalAppointments++;
              
              const amount = paymentData.amount || 0;
              const gstAmountValue = paymentData.gstamount || 0;
              const totalAmount = paymentData.totalamount || (amount + gstAmountValue);
              
              console.log(`Payment amounts - Base: ${amount}, GST: ${gstAmountValue}, Total: ${totalAmount}`);
              
              // Calculate platform fee (20% of total amount)
              const currentPlatformFee = totalAmount * 0.2;
              
              totalFee += totalAmount;
              gstAmount += gstAmountValue;
              originalFee += amount; // Original fee is the base amount without GST
              platformFee += currentPlatformFee;
              totalRevenue += currentPlatformFee;
              
              console.log(`Calculated platform fee: ${currentPlatformFee}`);
            }
          }

          console.log(`Quarter ${quarter}: Revenue=${totalRevenue}, TotalFee=${totalFee}, Appointments=${totalAppointments}`);

          // FIX: Return values in actual rupees instead of crores for small amounts
          // Since your revenue numbers are small (436, 531, 1416), crores conversion makes them 0
          return {
            quarter: `${quarter} ${currentYear}`,
            revenue: parseFloat(totalRevenue.toFixed(2)), // Keep in rupees
            totalAppointments,
            totalFee: parseFloat(totalFee.toFixed(2)), // Keep in rupees
            platformFee: parseFloat(platformFee.toFixed(2)), // Keep in rupees
            gstAmount: parseFloat(gstAmount.toFixed(2)), // Keep in rupees
            originalFee: parseFloat(originalFee.toFixed(2)), // Keep in rupees
            cluster: cluster.clusterName,
            currency: "INR" // Add currency info
          };
        })
      );

    } else {
      // Get overall revenue across all clusters (similar fixes applied)
      const allClusters = await Cluster.find().populate({
        path: 'hospitals',
        populate: {
          path: 'doctors',
          model: 'Doctor'
        }
      });

      revenueData = await Promise.all(
        quarters.map(async (quarter, index) => {
          const startMonth = index * 3;
          const endMonth = startMonth + 3;
          
          const startDate = new Date(currentYear, startMonth, 1);
          const endDate = new Date(currentYear, endMonth, 0);
          
          // Get all doctor IDs from all clusters
          const doctorIds = [];
          allClusters.forEach(cluster => {
            cluster.hospitals.forEach(hospital => {
              if (hospital.doctors && hospital.doctors.length > 0) {
                doctorIds.push(...hospital.doctors.map(doc => doc._id));
              }
            });
          });

          if (doctorIds.length === 0) {
            return {
              quarter: `${quarter} ${currentYear}`,
              revenue: 0,
              totalAppointments: 0,
              totalFee: 0,
              platformFee: 0,
              gstAmount: 0,
              originalFee: 0,
              totalClusters: allClusters.length
            };
          }

          // Get completed appointments
          const appointments = await Appointment.find({
            doctor: { $in: doctorIds },
            date: { $gte: startDate, $lte: endDate },
            status: 'completed'
          }).populate('payment');

          let totalRevenue = 0;
          let totalAppointments = 0;
          let totalFee = 0;
          let platformFee = 0;
          let gstAmount = 0;
          let originalFee = 0;

          // Process appointments
          for (const apt of appointments) {
            let paymentData = apt.payment;
            
            if (!paymentData) {
              paymentData = await Payment.findOne({ appointment: apt._id });
            }
            
            if (paymentData && paymentData.status === 'captured') {
              const amount = paymentData.amount || 0;
              const gstAmountValue = paymentData.gstamount || 0;
              const totalAmount = paymentData.totalamount || (amount + gstAmountValue);
              
              const currentPlatformFee = totalAmount * 0.2;
              
              totalFee += totalAmount;
              gstAmount += gstAmountValue;
              originalFee += amount;
              platformFee += currentPlatformFee;
              totalRevenue += currentPlatformFee;
              totalAppointments++;
            }
          }

          return {
            quarter: `${quarter} ${currentYear}`,
            revenue: parseFloat(totalRevenue.toFixed(2)),
            totalAppointments,
            totalFee: parseFloat(totalFee.toFixed(2)),
            platformFee: parseFloat(platformFee.toFixed(2)),
            gstAmount: parseFloat(gstAmount.toFixed(2)),
            originalFee: parseFloat(originalFee.toFixed(2)),
            totalClusters: allClusters.length,
            currency: "INR"
          };
        })
      );
    }

    res.status(200).json({
      success: true,
      data: revenueData,
      timeframe: {
        year: currentYear,
        type: 'quarterly'
      },
      currency: "INR"
    });

  } catch (error) {
    console.error('Get hospital revenue error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching revenue analytics',
      error: error.message
    });
  }
};

/**
 * @desc    Get hospitals verified by current admin
 * @route   GET /api/hospitals/my-verified
 * @access  Private (Admin)
 */
exports.getMyVerifiedHospitals = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    // Find all hospitals verified by this admin
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    })
      .populate('doctors', 'fullName specializations experience review')
      .populate('verification.verifiedBy', 'fullName email')
      .sort({ 'verification.verifiedAt': -1 });
    
    // Enrich with statistics
    const enrichedHospitals = await Promise.all(
      hospitals.map(async (hospital) => {
        const hospitalObj = hospital.toObject();
        
        const doctorsCount = hospital.doctors ? hospital.doctors.length : 0;
        const appointmentsCount = await Appointment.countDocuments({
          doctor: { $in: hospital.doctors || [] }
        });
        
        hospitalObj.statistics = {
          ...hospitalObj.statistics,
          doctorsCount,
          appointmentsCount
        };
        
        return hospitalObj;
      })
    );
    
    res.status(200).json({
      success: true,
      count: enrichedHospitals.length,
      data: enrichedHospitals
    });
  } catch (error) {
    console.error('Get my verified hospitals error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching verified hospitals',
      error: error.message
    });
  }
};

/**
 * @desc    Get doctors associated with hospitals verified by admin
 * @route   GET /api/hospitals/my-verified-doctors
 * @access  Private (Admin)
 */
exports.getMyVerifiedDoctors = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    // Find all hospitals verified by this admin
    const hospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    }).select('doctors');
    
    // Extract all doctor IDs
    const doctorIds = hospitals.reduce((acc, hospital) => {
      if (hospital.doctors && hospital.doctors.length > 0) {
        acc.push(...hospital.doctors);
      }
      return acc;
    }, []);
    
    // Remove duplicates
    const uniqueDoctorIds = [...new Set(doctorIds.map(id => id.toString()))];
    
    // Get doctor details
    const doctors = await Doctor.find({
      _id: { $in: uniqueDoctorIds }
    })
      .populate('user', 'fullName email mobileNumber profilePhoto')
      .populate('hospitalAffiliations.hospital', 'name city')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: doctors.length,
      data: doctors
    });
  } catch (error) {
    console.error('Get my verified doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching verified doctors',
      error: error.message
    });
  }
};


exports.getAllHospitalsNamesByAdminCluster = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      type, 
      verificationStatus,
      search 
    } = req.query;
    
    // Find the cluster assigned to this admin
    const cluster = await Cluster.findOne({ 
      user: adminId,
      isActive: true 
    });
    
    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No active cluster found for this admin'
      });
    }
    
    // Build query for hospitals in this cluster
    const query = {
      _id: { $in: cluster.hospitals }
    };
    
    // Add filters if provided
    if (type) query.type = type;
    if (verificationStatus) query['verification.status'] = verificationStatus;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { specialties: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Execute query with pagination and select only required fields
    const skip = (page - 1) * limit;
    const hospitals = await Hospital.find(query)
      .select('_id name addedBy') // Only fetch these fields
      .limit(parseInt(limit))
      .skip(skip)
      .sort({ createdAt: -1 });
    
    const totalHospitals = await Hospital.countDocuments(query);
    
    // Transform the data to match the desired format
    const formattedHospitals = hospitals.map(hospital => ({
      id: hospital._id,
      name: hospital.name,
      addedBy: hospital.addedBy
    }));
    
    res.status(200).json({
      success: true,
      count: formattedHospitals.length,
      totalHospitals,
      totalPages: Math.ceil(totalHospitals / limit),
      currentPage: parseInt(page),
      clusterInfo: {
        id: cluster._id,
        name: cluster.clusterName,
        location: cluster.location,
        radius: cluster.radius
      },
      data: formattedHospitals
    });
  } catch (error) {
    console.error('Get hospitals by admin cluster error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching hospitals',
      error: error.message
    });
  }
};

module.exports = exports;