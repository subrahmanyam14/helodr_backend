const getOAuth2Client = require('../services/googleClient');
const { google } = require('googleapis');

const createGoogleMeetLink = async (refreshToken, appointment) => {
    const auth = getOAuth2Client(refreshToken);
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
        summary: `Appointment with ${appointment.patientName}`,
        start: { dateTime: appointment.startTime },
        end: { dateTime: appointment.endTime },
        conferenceData: {
            createRequest: { requestId: `meet-${Date.now()}` }
        }
    };

    const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        conferenceDataVersion: 1,
    });

    return response.data.hangoutLink;
};

module.exports = { createGoogleMeetLink };
