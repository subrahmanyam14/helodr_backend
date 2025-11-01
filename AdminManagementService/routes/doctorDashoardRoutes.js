const express = require('express');
const router = express.Router();
const {
  getAllDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  verifyDoctor,
  deleteDoctor,
  getDoctorStats,
  getAllDoctorsForadmin
} = require('../controllers/doctorController');

// Middleware (adjust paths as per your project structure)
const { protect, authorize } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(protect);

// Analytics routes
router.get('/analytics/stats', authorize('admin'), getDoctorStats);


router.get('/admin/doctors', authorize('admin'), getAllDoctorsForadmin);

// CRUD routes
router.route('/')
  .get(getAllDoctors)
  .post(authorize('admin'), createDoctor);

router.route('/:id')
  .get(getDoctorById)
  .put(authorize('admin'), updateDoctor)
  .delete(authorize('admin'), deleteDoctor);

// Verification route
router.post('/:id/verify', authorize('admin'), verifyDoctor);

module.exports = router;
