const twilio = require('twilio');
const express = require('express');
const dotenv = require('dotenv');
dotenv.config();

const smsRouter = express.Router();

// Initialize Twilio client
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const sendOTP = async (to, otp) => {
    try {
        await twilioClient.messages.create({
            body: `Your HeloDr verification code is: ${otp}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to
        });
    } catch (twilioError) {
        console.error('Twilio error: in sendOTP', twilioError);
        throw new Error('Failed to send OTP: ' + twilioError.message);
    }
};

const sendMessage = async( to, message ) => {
    try {
        await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to
        });
    } catch (error) {
        console.error('Twilio error: in sendMessage', error);
        throw new Error('Failed to send message: ' + error.message);
    }
}





smsRouter.post('/sendOTP', async (req, res) => {
  try {
      const { to, otp } = req.body;
      if (!to || !otp) {
          return res.status(400).json({ success: false, message: "Phone number and OTP are required." });
      }

      await sendOTP(to, otp);

      return res.status(200).json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
      console.error('Error sending OTP:', error);

      if (!res.headersSent) {
          return res.status(500).json({ success: false, message: error.message });
      }
  }
});

smsRouter.post('/sendMessage', async (req, res) => {
    try {
        const { to, message } = req.body;
        if (!to || !message) {
            return res.status(400).json({ success: false, message: "Phone number and message are required." });
        }
  
        await sendMessage(to, message);
  
        return res.status(200).json({ success: true, message: 'message sent successfully' });
    } catch (error) {
        console.error('Error sending message:', error);
  
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
  });
  
module.exports = smsRouter;
