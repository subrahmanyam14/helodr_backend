const express = require('express');
const router = express.Router();
const availabilityController = require('../controllers/availabilityController');
const { protect, authorize } = require('../middleware/auth');

// Doctor availability routes
router.get('/', protect, authorize('doctor'), availabilityController.getAvailability);
router.post('/', protect, authorize('doctor'), availabilityController.setAvailability);
router.post('/overrides', protect, authorize('doctor'), availabilityController.addOverride);

// Public availability check
router.get('/slots', availabilityController.getAvailableSlots);

module.exports = router;