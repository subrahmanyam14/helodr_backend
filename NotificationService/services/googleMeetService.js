const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const createGoogleMeetLink = async (appointment) => {
  try {
    // Validate required fields
    if (!appointment?.doctor?.email || !appointment?.patient?.email) {
      throw new Error('Both doctor and patient emails are required');
    }

    // Service account authentication with domain-wide delegation
    const auth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      subject: process.env.GOOGLE_ADMIN_EMAIL // Required for domain-wide delegation
    });

    const calendar = google.calendar({ version: 'v3', auth });

    // Prepare event times with proper timezone
    const startTime = new Date(appointment.date);
    const [startHours, startMinutes] = appointment.slot.startTime.split(':').map(Number);
    startTime.setHours(startHours, startMinutes, 0, 0);

    const endTime = new Date(startTime);
    const [endHours, endMinutes] = appointment.slot.endTime.split(':').map(Number);
    endTime.setHours(endHours, endMinutes, 0, 0);

    // Create the event with conference data
    const event = {
      summary: `Appointment: Dr. ${appointment.doctor.fullName} with ${appointment.patient.fullName}`,
      description: `Medical consultation${appointment.reason ? ` for ${appointment.reason}` : ''}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'Asia/Kolkata', // Use your preferred timezone
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Kolkata',
      },
      conferenceData: {
        createRequest: {
          requestId: `appointment-${appointment._id}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet' // This is the correct current type
          }
        }
      },
      attendees: [
        { email: appointment.doctor.email },
        { email: appointment.patient.email }
      ].filter(a => a.email), // Remove any empty entries
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    // Insert the event
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      conferenceDataVersion: 1,
      sendUpdates: 'all' // Send notifications to attendees
    });

    return response.data.hangoutLink;
  } catch (error) {
    console.error('Detailed Google Meet creation error:', {
      message: error.message,
      response: error.response?.data,
      stack: error.stack
    });
    throw new Error('Failed to create Google Meet: ' + error.message);
  }
};

module.exports = { createGoogleMeetLink };