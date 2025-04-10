// routes/availabilityRoutes.js
const express = require('express');
const availabilityRouter = express.Router();
const { check } = require('express-validator');
const availabilityController = require('../controllers/availabilityController');
const { protect, authorize } = require('../middleware/auth');

// Base route: /api/availabilities

// Get all availabilities (staff only)
// availabilityRouter.get('/', availabilityController.getAllAvailabilities);

// Get a single availability by ID
availabilityRouter.get('/:id', availabilityController.getAvailabilityById);

// Get doctor's available slots for a specific date (public)
availabilityRouter.get('/doctor/:doctorId/slots', availabilityController.getDoctorAvailableSlots);

// Create a new availability (doctor or admin only)
availabilityRouter.post(
  '/',
  [
    protect,
    authorize('doctor'),
    [
      check('doctor', 'Doctor ID is required').not().isEmpty(),
      check('slotDuration', 'Slot duration must be at least 5 minutes').isNumeric().toInt().isInt({ min: 5 }),
      check('schedule', 'Schedule is required').isArray({ min: 1 }),
      check('schedule.*.day', 'Day is required').isIn([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
      ]),
      check('schedule.*.shifts', 'Shifts are required').isArray({ min: 1 }),
      check('schedule.*.shifts.*.startTime', 'Start time is required').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('schedule.*.shifts.*.endTime', 'End time is required').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('schedule.*.shifts.*.consultationTypes', 'At least one consultation type is required').isArray({ min: 1 }),
      check('schedule.*.shifts.*.consultationTypes.*.type', 'Consultation type must be either clinic or video').isIn(['clinic', 'video']),
      check('schedule.*.shifts.*.consultationTypes.*.fee', 'Fee must be a positive number').isNumeric().toFloat().isFloat({ min: 0 })
    ]
  ],
  availabilityController.createAvailability
);

// Update an existing availability (doctor or admin only)
availabilityRouter.put(
  '/:id',
  [
    protect,
    authorize('doctor'),
    [
      check('slotDuration', 'Slot duration must be at least 5 minutes').optional().isNumeric().toInt().isInt({ min: 5 }),
      check('schedule.*.day', 'Day must be valid').optional().isIn([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
      ]),
      check('schedule.*.shifts.*.startTime', 'Start time must be valid').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('schedule.*.shifts.*.endTime', 'End time must be valid').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('schedule.*.shifts.*.consultationTypes.*.type', 'Consultation type must be either clinic or video').optional().isIn(['clinic', 'video']),
      check('schedule.*.shifts.*.consultationTypes.*.fee', 'Fee must be a positive number').optional().isNumeric().toFloat().isFloat({ min: 0 })
    ]
  ],
  availabilityController.updateAvailability
);

// Delete an availability (doctor or admin only)
availabilityRouter.delete('/:id', [ protect, authorize('doctor') ], availabilityController.deleteAvailability);

// Add an override for a specific date (doctor or admin only)
availabilityRouter.post(
  '/:id/override',
  [
    protect,
    authorize('doctor'),
    [
      check('date', 'Valid date is required').isISO8601().toDate(),
      check('isAvailable', 'isAvailable must be a boolean').isBoolean(),
      check('shifts', 'Shifts must be an array').optional().isArray(),
      check('shifts.*.startTime', 'Start time must be valid').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('shifts.*.endTime', 'End time must be valid').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('shifts.*.consultationTypes', 'Consultation types must be valid').optional().isArray(),
      check('shifts.*.consultationTypes.*.type', 'Consultation type must be either clinic or video').optional().isIn(['clinic', 'video']),
      check('shifts.*.consultationTypes.*.fee', 'Fee must be a positive number').optional().isNumeric().toFloat().isFloat({ min: 0 })
    ]
  ],
  availabilityController.addOverride
);

// Remove an override for a specific date (doctor or admin only)
availabilityRouter.delete('/:id/override/:date', [ protect, authorize('doctor')], availabilityController.removeOverride);

// Update a booked slot status (doctor or admin only)
availabilityRouter.patch(
  '/:id/slots/:slotId',
  [
    protect,
    authorize('doctor'),
    [
      check('status', 'Status is required').isIn(['booked', 'completed', 'cancelled', 'no_show'])
    ]
  ],
  availabilityController.updateBookedSlotStatus
);

// Book a slot (staff only)
availabilityRouter.post(
  '/:id/book',
  [
    protect,
    [
      check('date', 'Valid date is required').isISO8601().toDate(),
      check('startTime', 'Valid start time is required').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('consultationType', 'Consultation type must be either clinic or video').isIn(['clinic', 'video']),
      check('appointmentId', 'Appointment ID is required').not().isEmpty()
    ]
  ],
  availabilityController.bookSlot
);

module.exports = availabilityRouter;