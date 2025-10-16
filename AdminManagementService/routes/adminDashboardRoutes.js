const express = require('express');
const router = express.Router();
const adminDashboardController = require('../controllers/adminDashboardController');
const { protect, authorize } = require('../middleware/authMiddleware'); // Assuming you have auth middleware

// Apply authentication and authorization middleware to all routes
// Only admins can access these routes
router.use(protect); // Verify JWT token
router.use(authorize('admin', 'superadmin')); // Only admin and superadmin roles

// Metrics endpoints
router.get('/metrics/doctors/count', adminDashboardController.getDoctorsCount);
router.get('/metrics/hospitals/count', adminDashboardController.getHospitalsCount);
router.get('/metrics/revenue', adminDashboardController.getRevenueMetrics);
router.get('/metrics/appointments/count', adminDashboardController.getAppointmentsCount);
router.get('/metrics/ratings/average', adminDashboardController.getAverageRating);
router.get('/metrics/top-doctors', adminDashboardController.getTopDoctors);

// Charts endpoints
router.get('/charts/specializations', adminDashboardController.getSpecializationDistribution);

// Appointments endpoints
router.get('/today-appointments', adminDashboardController.getTodayAppointments);

module.exports = router;