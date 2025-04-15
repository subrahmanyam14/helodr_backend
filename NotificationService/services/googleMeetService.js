// utils/googlemeet.js
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

/**
 * Create a Google Meet link for an appointment
 * @param {string} refreshToken - Doctor's Google refresh token
 * @param {Object} appointment - The appointment object with populated doctor and patient
 * @returns {Promise<string>} - The Google Meet link
 */
const createGoogleMeetLink = async (refreshToken, appointment) => {
  try {
    // Set up OAuth client
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    // Set credentials using the doctor's refresh token
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    
    // Initialize Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Prepare the appointment date and times
    const appointmentDate = new Date(appointment.date);
    
    // Set start time
    const [startHours, startMinutes] = appointment.slot.startTime.split(':');
    appointmentDate.setHours(parseInt(startHours), parseInt(startMinutes), 0, 0);
    
    // Calculate end time
    const endTime = new Date(appointmentDate);
    const [endHours, endMinutes] = appointment.slot.endTime.split(':');
    endTime.setHours(parseInt(endHours), parseInt(endMinutes), 0, 0);
    
    // Get patient name
    const patientName = appointment.patient.fullName;
    
    // Get doctor name - assuming doctor model has fullName too
    const doctorName = appointment.doctor.fullName;
    
    // Create event object
    const event = {
      summary: `Appointment: Dr. ${doctorName} with ${patientName}`,
      description: `Medical appointment${appointment.reason ? ` for ${appointment.reason}` : ''}`,
      start: {
        dateTime: appointmentDate.toISOString(),
        timeZone: 'Asia/Kolkata', // Use appropriate timezone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Kolkata', // Use appropriate timezone
      },
      // Add conference data request
      conferenceData: {
        createRequest: {
          requestId: `appointment-${appointment._id}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
      // Add attendees if available
      attendees: [
        { email: appointment.doctor.email },
        { email: appointment.patient.email }
      ].filter(attendee => attendee.email), // Filter out any undefined emails
      // Add reminders
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },  // 1 hour before
          { method: 'popup', minutes: 10 }   // 10 minutes before
        ]
      }
    };
    
    // Insert the event
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all' // Send updates to attendees
    });
    
    // Return the Google Meet link
    if (response.data && response.data.hangoutLink) {
      console.log(`Google Meet link created for appointment ${appointment._id}: ${response.data.hangoutLink}`);
      return response.data.hangoutLink;
    } else {
      throw new Error('No hangout link returned from Google Calendar API');
    }
  } catch (error) {
    console.error('Error creating Google Meet link:', error);
    throw error;
  }
};

module.exports = { createGoogleMeetLink };