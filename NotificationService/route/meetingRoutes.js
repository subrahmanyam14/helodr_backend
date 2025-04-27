// routes/meetingRoutes.js
const express = require('express');
const router = express.Router();
const { createManualMeeting } = require('../controller/meetingController');
const { protect, authorize } = require('../middleware/auth');
const {getDoctorMessages,getDoctorThreadMessages}=require('../controller/NotificationController')

// Route to manually create a meeting for a specific patient
router.post('/create-meeting', protect, authorize("doctor"), createManualMeeting);

//get doctor meesages
router.get('/doctors/messages', getDoctorMessages);

//get messages between doctor and patient
router.get('/doctor/patient/threadmessages',getDoctorThreadMessages)


module.exports = router;