const { google } = require('googleapis');
require("dotenv").config();

const getOAuth2Client = (refreshToken) => {
    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI // optional if using refresh token directly
    );

    oAuth2Client.setCredentials({ refresh_token: refreshToken });
    return oAuth2Client;
};

module.exports = getOAuth2Client;
