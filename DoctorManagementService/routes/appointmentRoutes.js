const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/auth');

// Appointment routes
router.post('/', protect, authorize('patient'), appointmentController.bookAppointment);
router.get('/', protect, appointmentController.getAppointments);
router.get('/:id', protect, appointmentController.getAppointment);
router.put('/:id/status', protect, appointmentController.updateAppointmentStatus);
router.put('/:id/prescription', protect, authorize('doctor'), appointmentController.addPrescription);

module.exports = router;