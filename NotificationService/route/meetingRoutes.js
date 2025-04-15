// routes/meetingRoutes.js
const express = require('express');
const router = express.Router();
const { createManualMeeting } = require('../controller/meetingController');
const { protect, authorize } = require('../middleware/auth');

// Route to manually create a meeting for a specific patient
router.post('/create-meeting', protect, authorize("doctor"), createManualMeeting);

module.exports = router;