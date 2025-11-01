const express = require('express');
const availabilityRouter = express.Router();
const { check } = require('express-validator');
const availabilityController = require('../controllers/availabilityController');
const { protect, authorize } = require('../middleware/auth');

// Base route: /api/availabilities
availabilityRouter.get('/doctor/:doctorId/status', availabilityController.getAvailabilityStatus);

availabilityRouter.get('/doctor/:doctorId/calendar', availabilityController.getDoctorCalendar);

availabilityRouter.get('/doctor/:doctorId/today', availabilityController.getTodaySchedule);

availabilityRouter.get('/doctor/:doctorId/stats', availabilityController.getMonthlyStats);

// Get a single availability by ID
availabilityRouter.get('/', protect, authorize('doctor'), availabilityController.getAvailabilityById);

// Get doctor's available slots for a specific date (public)
availabilityRouter.get('/doctor/:doctorId/slots', availabilityController.getDoctorAvailableSlots);
// Create a new availability (doctor or admin only)
availabilityRouter.post(
  '/',
  [
    protect,
    authorize('doctor', 'admin'), // Added admin role if needed
    [
      check('doctor', 'Doctor ID is required').isMongoId(), // More specific validation
      check('slotDuration', 'Slot duration must be at least 5 minutes')
        .isInt({ min: 5, max: 60 }) // Added max limit for safety
        .toInt(),
      check('bufferTime', 'Buffer time must be a non-negative number')
        .optional()
        .isInt({ min: 0 })
        .toInt(),
      check('schedule', 'Schedule is required').isArray({ min: 1 }),
      check('schedule.*.day', 'Valid day is required').isIn([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
      ]),
      check('schedule.*.shifts', 'At least one shift is required per day').isArray({ min: 1 }),
      check('schedule.*.shifts.*.startTime', 'Valid start time (HH:MM) is required')
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('schedule.*.shifts.*.endTime', 'Valid end time (HH:MM) is required')
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('schedule.*.shifts.*.consultationTypes', 'At least one consultation type is required')
        .isArray({ min: 1 }),
      check('schedule.*.shifts.*.consultationTypes.*.type', 'Consultation type must be clinic or video')
        .isIn(['clinic', 'video']),
      
      // Optional fields validation
      check('isVirtual', 'isVirtual must be a boolean').optional().isBoolean(),
      check('recurrence', 'Recurrence must be daily, weekly, custom, or null')
        .optional()
        .isIn(['daily', 'weekly', 'custom', null]),
      check('effectiveFrom', 'Effective from must be a valid date').optional().isISO8601(),
      check('effectiveTo', 'Effective to must be a valid date').optional().isISO8601(),
      
      // Overrides validation (if provided)
      check('overrides', 'Overrides must be an array').optional().isArray(),
      check('overrides.*.date', 'Override date is required').optional().isISO8601(),
      check('overrides.*.isAvailable', 'isAvailable must be a boolean').optional().isBoolean(),
      check('overrides.*.shifts', 'Override shifts must be an array').optional().isArray(),
      check('overrides.*.shifts.*.startTime', 'Valid override start time (HH:MM) is required')
        .optional()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('overrides.*.shifts.*.endTime', 'Valid override end time (HH:MM) is required')
        .optional()
        .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
      check('overrides.*.shifts.*.consultationTypes', 'Override consultation types must be an array')
        .optional()
        .isArray(),
      check('overrides.*.shifts.*.consultationTypes.*.type', 'Override consultation type must be clinic or video')
        .optional()
        .isIn(['clinic', 'video'])
    ]
  ],
  availabilityController.createAvailability
);

// Update an existing availability (doctor or admin only)
availabilityRouter.put(
  '/',
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
  '/override',
  [
    protect,
    authorize('doctor'),
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

availabilityRouter.get(
  '/slots/:doctorId',
    protect,
    authorize('doctor'),
    availabilityController.getDoctorAvailability
)

availabilityRouter.post(
  '/slots/:doctorId',
    protect,
    authorize('doctor'),
    availabilityController.createDoctorAvailability
)

availabilityRouter.put(
  '/slots/:doctorId',
    protect,
    authorize('doctor'),
    availabilityController.updateDoctorAvailability
)

module.exports = availabilityRouter;