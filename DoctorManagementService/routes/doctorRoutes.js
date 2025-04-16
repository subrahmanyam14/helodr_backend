const express = require('express');
const router = express.Router();
const DoctorController = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/auth');


// Doctor registration routes
router.post(
  '/register',
  protect,
  authorize('doctor', 'user'),
  DoctorController.registerDoctor
);

// Hospital routes
router.post(
  '/hospital',
  protect,
  authorize('doctor', 'admin'),
  DoctorController.registerHospital
);

// Hospital affiliation routes
router.post(
  '/:doctorId/hospital',
  protect,
  authorize('doctor', 'admin'),
  DoctorController.addHospitalAffiliation
);

// Bank details routes
router.post(
  '/:doctorId/bank-details',
  protect,
  authorize('doctor'),
  DoctorController.addBankDetails
);

router.put(
  '/:doctorId/bank-details',
  protect,
  authorize('doctor'),
  DoctorController.addBankDetails
);

// Settings routes
router.post(
  '/:userId/settings',
  protect,
  DoctorController.updateSettings
);

router.put(
  '/:userId/settings',
  protect,
  DoctorController.updateSettings
);

// Admin approval routes
router.put(
  '/:doctorId/admin-approval',
  protect,
  // authorize('admin'),
  DoctorController.adminApproval
);

// Super admin approval routes
router.put(
  '/:doctorId/super-admin-approval',
  protect,
  // authorize('superadmin'),
  DoctorController.superAdminApproval
);

// Get doctor profile route
router.get(
  '/:doctorId',
  protect,
  authorize('doctor', 'admin', "superadmin"),
  DoctorController.getDoctorProfile
);

// Get doctor's own profile
router.get(
  '/my-profile',
  protect,
  authorize('doctor'),
  
  DoctorController.getDoctorProfile
);

router.get('/search', async (req, res) => {
  try {
    const {
      specialization,
      subSpecializations,
      city,
      state,
      pinCode,
      isVerified,
      isActive,
      page = 1,
      limit = 10
    } = req.query;

    // Parse query parameters
    const searchParams = {
      specialization,
      city,
      state,
      pinCode
    };

    // Parse boolean values
    if (isVerified !== undefined) {
      searchParams.isVerified = isVerified === 'true';
    }
    
    if (isActive !== undefined) {
      searchParams.isActive = isActive === 'true';
    }
    
    // Parse array values
    if (subSpecializations) {
      searchParams.subSpecializations = Array.isArray(subSpecializations) 
        ? subSpecializations 
        : [subSpecializations];
    }

    const results = await searchDoctors(
      searchParams,
      parseInt(page),
      parseInt(limit)
    );

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/doctors/nearby
 * @desc    Find nearby doctors based on coordinates
 * @access  Public
 */
router.get('/nearby', async (req, res) => {
  try {
    const {
      longitude,
      latitude,
      maxDistance = 10000, // Default 10km
      specialization,
      subSpecializations,
      isVerified,
      isActive,
      page = 1,
      limit = 10
    } = req.query;

    if (!longitude || !latitude) {
      return res.status(400).json({ error: 'Longitude and latitude are required' });
    }

    const coordinates = [parseFloat(longitude), parseFloat(latitude)];
    
    // Parse filters
    const filters = { specialization };
    
    if (isVerified !== undefined) {
      filters.isVerified = isVerified === 'true';
    }
    
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }
    
    if (subSpecializations) {
      filters.subSpecializations = Array.isArray(subSpecializations) 
        ? subSpecializations 
        : [subSpecializations];
    }

    const results = await findNearbyDoctors(
      coordinates,
      parseFloat(maxDistance),
      filters,
      parseInt(page),
      parseInt(limit)
    );

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route   GET /api/doctors/hospital/:hospitalId
 * @desc    Find doctors affiliated with a specific hospital
 * @access  Public
 */
router.get('/hospital/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const {
      specialization,
      isVerified,
      isActive,
      page = 1,
      limit = 10
    } = req.query;

    // Parse filters
    const filters = { specialization };
    
    if (isVerified !== undefined) {
      filters.isVerified = isVerified === 'true';
    }
    
    if (isActive !== undefined) {
      filters.isActive = isActive === 'true';
    }

    const results = await findDoctorsByHospital(
      hospitalId,
      filters,
      parseInt(page),
      parseInt(limit)
    );

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;