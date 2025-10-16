const express = require('express');
const router = express.Router();
const {
  getAllHospitalsByAdminCluster,
  getHospitalById,
  createHospital,
  updateHospital,
  verifyHospital,
  deleteHospital,
  getHospitalGrowth,
  getHospitalRevenue,
  getMyVerifiedHospitals,
  getMyVerifiedDoctors
} = require('../controllers/hospitalDashboardController');

// Middleware imports (adjust paths as needed)
const { protect, authorize } = require('../middleware/authMiddleware');

// Analytics routes
router.get('/analytics/hospitals/growth', protect, authorize('admin', 'superadmin'), getHospitalGrowth);
router.get('/analytics/hospitals/revenue', protect, authorize('admin', 'superadmin'), getHospitalRevenue);

// Admin-specific routes
router.get('/my-verified', protect, authorize('admin', 'superadmin'), getMyVerifiedHospitals);
router.get('/my-verified-doctors', protect, authorize('admin', 'superadmin'), getMyVerifiedDoctors);

// Main hospital routes
router.route('/')
  .get(protect, authorize('admin', 'superadmin'), getAllHospitalsByAdminCluster)
  .post(protect, authorize('admin', 'superadmin'), createHospital);

router.route('/:id')
  .get(protect, getHospitalById)
  .put(protect, authorize('admin', 'superadmin'), updateHospital)
  .delete(protect, authorize('admin', 'superadmin'), deleteHospital);

// Verification route
router.put('/:id/verify', protect, authorize('admin', 'superadmin'), verifyHospital);

module.exports = router;