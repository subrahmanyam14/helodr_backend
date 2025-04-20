// controllers/meetingController.js
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const { createGoogleMeetLink } = require('../services/googleMeetService');
const Notification = require('../models/Notification');

/**
 * Create a manual Google Meet session for a specific patient
 * @route POST /api/meetings/create-meeting
 * @access Private (Doctors only)
 */
const createManualMeeting = async (req, res) => {
  try {
    const { patientId, title, startTime, endTime, date, reason } = req.body;
    
    // Input validation
    if (!patientId || !startTime || !endTime || !date) {
      return res.status(400).json({
        success: false,
        message: 'Please provide patient ID, start time, end time, and date'
      });
    }
    
    // Format validation for time (HH:MM format)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
      return res.status(400).json({
        success: false,
        message: 'Time must be in HH:MM format'
      });
    }
    
    // Get doctor information (current authenticated user)
    const doctorId = req.user._id;
    const doctor = await Doctor.findOne({ user: doctorId });
    
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor profile not found'
      });
    }
    
    // Check if doctor has connected Google Calendar (has refresh token)
    if (!doctor.refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'You need to connect your Google Calendar first',
        redirectUrl: '/auth/google'
      });
    }
    
    // Check if patient exists
    const patient = await User.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: 'Patient not found'
      });
    }
    
    // Create a temporary appointment object for the Meet link generation
    const tempAppointment = {
      _id: Date.now().toString(), // Temporary ID
      doctor: doctor,
      patient: patient,
      date: new Date(date),
      slot: {
        startTime: startTime,
        endTime: endTime
      },
      reason: reason || 'Ad-hoc consultation'
    };
    
    // Create Google Meet link
    const meetLink = await createGoogleMeetLink(doctor.refreshToken, tempAppointment);
    
    if (!meetLink) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create Google Meet link'
      });
    }
    
    // Create a record of this meeting (we'll use Appointment model with a special type)
    const appointment = await Appointment.create({
      patient: patientId,
      doctor: doctor._id,
      appointmentType: 'video',
      date: new Date(date),
      slot: {
        startTime,
        endTime
      },
      reason: reason || 'Ad-hoc consultation',
      status: 'confirmed',
      videoConferenceLink: meetLink,
      isAdHoc: true // Flag to indicate this is a manually created meeting
    });
    
    // Send notification to patient
    await Notification.create({
      referenceId: appointment._id,
      user: patientId,
      message: `Dr. ${doctor.name || 'your doctor'} has scheduled a video consultation with you on ${new Date(date).toLocaleDateString()} at ${startTime}. Join here: ${meetLink}`,
      type: 'manual_meeting_invitation'
    });
    
    // Send notification to doctor as well (for their records)
    await Notification.create({
      referenceId: appointment._id,
      user: doctorId,
      message: `You've scheduled a video consultation with ${patient.fullName} on ${new Date(date).toLocaleDateString()} at ${startTime}. Join here: ${meetLink}`,
      type: 'manual_meeting_created'
    });
    
    return res.status(201).json({
      success: true,
      message: 'Google Meet session created successfully',
      data: {
        appointmentId: appointment._id,
        meetLink,
        patient: {
          id: patient._id,
          name: patient.fullName
        },
        dateTime: {
          date: new Date(date).toLocaleDateString(),
          startTime,
          endTime
        }
      }
    });
  } catch (error) {
    console.error('Error creating manual meeting:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create meeting',
      error: error.message
    });
  }
};

module.exports = {
  createManualMeeting
};