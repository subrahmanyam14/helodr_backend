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
router.post('/bySpecializations', DoctorController.getDoctorsBySpecializations);

// Find nearby doctors
router.get('/nearby', DoctorController.findNearbyDoctors);

// Find doctors by hospital
router.get('/hospital/:hospitalId', DoctorController.findDoctorsByHospital);

router.post("/dummy", DoctorController.insertDummyData);

router.get("/cities", DoctorController.getAllCities);

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
  authorize('hospitaladmin', 'admin'),
  DoctorController.registerHospital
);

router.get(
  '/hospital',
  protect,
  authorize('hospitaladmin', 'admin'),
  DoctorController.getHospitalByUserId
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
  // protect,
  // authorize('doctor', 'admin', "superadmin"),
  DoctorController.getDoctorProfile
);

// Get doctor's own profile
router.get('/my-profile',
  // protect,
  // authorize('doctor'),
  
  DoctorController.getDoctorProfile
);

router.get('/doctor/revenue-summary', 
  protect,
  authorize('doctor'),
  DoctorController.getRevenueSummary
);


router.get('/doctor/coins-collected', 
  protect,
  authorize('doctor'),
  DoctorController.getCoinsCollected
);

router.get('/affiliations',
  protect,
  authorize('admin', 'superadmin'),
  DoctorController.getDoctorsWithAffiliations
);

router.get('/hospital/:hospitalId/current', 
  protect,
  authorize('hospitaladmin', 'admin'),
  DoctorController.getDoctorsByHospitalCurrent
);

router.get('/available/doctors', 
  protect,
  authorize('hospitaladmin', 'admin', 'superadmin'),
  DoctorController.getAvailableDoctors
);


router.get('/:doctorId/affiliations',
  protect,
  authorize('doctor', 'admin', 'superadmin'),
  DoctorController.getDoctorAffiliations
);

router.get('/hospital/doctors/profile',
  protect,
  authorize('hospitaladmin', 'admin'),
  DoctorController.getHospitalDoctors
);

router.get('/hospital/meta/doctor-counts',
  protect,
  authorize('hospitaladmin', 'admin'),
  DoctorController.getHospitalDoctorCounts
);

router.get('/doctor/:id',
  protect,
  authorize('hospitaladmin', 'admin'),
  DoctorController.getDoctorById
);

router.get('/hospitalId/dashboardstats',
  protect,
  authorize('hospitaladmin'),
  DoctorController.getHospitalDashboardStats
);

router.get('/hospitalId/dashboard',
  protect,
  authorize('hospitaladmin'),
  DoctorController.getHospitalDashboard
);


router.get('/hospitalId/patients', 
  protect,
  authorize('hospitaladmin', 'admin'),
  DoctorController.getHospitalPatients
)


router.get('/hospitalId/appoinments', 
  protect,
  authorize('hospitaladmin'),
  DoctorController.getHospitalAppointments
)


router.get('/hospitalId/reviews', 
  protect,
  authorize('hospitaladmin'),
  DoctorController.getHospitalReviews
)


router.get('/hospitalId/earnigs', 
  protect,
  authorize('hospitaladmin'),
  DoctorController.getHospitalEarnings
)

module.exports = router;