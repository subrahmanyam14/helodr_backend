const express = require('express');
const router = express.Router();
const DoctorController = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/auth');


//get hospital names and ids
router.get(
  '/hospitals',
  DoctorController.getAllHospitals
);

// Search doctors
router.get('/search', DoctorController.searchDoctors);

// Get doctor by specializations
router.get('/bySpecializations', DoctorController.getDoctorsBySpecializations);

// Find nearby doctors
router.get('/nearby', DoctorController.findNearbyDoctors);

// Find doctors by hospital
router.get('/hospital/:hospitalId', DoctorController.findDoctorsByHospital);

router.post("/dummy", DoctorController.insertDummyData);

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
router.get('/my-profile',
  // protect,
  // authorize('doctor'),
  
  DoctorController.getDoctorProfile
);



module.exports = router;