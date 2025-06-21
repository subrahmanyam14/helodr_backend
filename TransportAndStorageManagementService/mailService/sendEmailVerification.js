const nodemailer = require("nodemailer");
const express = require('express');
require('dotenv').config();
const {createEmailVerificationHTML, createReviewEmailHTML, createOtpHtml} = require("./mailContents.js");

const mailRouter = express.Router();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, // Your Gmail email
        pass: process.env.EMAIL_PASS  // Your Gmail App Password
    }
});



const sendMail = async (to, subject, html) => {
    const info = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html
    });
    console.log('Email sent:', info.messageId);
}



mailRouter.post('/sendEmailVerification', async (req, res) => {
    try {
        const { fullName, email, token, url } = req.body;
        // console.log(fullName, email, token, url);
        if (!fullName || !email || !token || !url) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = createEmailVerificationHTML(fullName, email, token, url);
        await sendMail(email, 'Verify Your Email - HeloDr', html);

        res.status(200).json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});
mailRouter.post('/sendFeedBackLink', async(req, res) => {
    try {
        const { patientName, doctorName, doctorSpecialization, appointmentTime, appointmentDate, reviewLink } = req.body;
        // console.log(fullName, email, token, url);
        if (!patientName || !doctorName || !doctorSpecialization || !appointmentTime || !appointmentDate || !reviewLink) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = createReviewEmailHTML(patientName, doctorName, doctorSpecialization, appointmentTime, appointmentDate, reviewLink);
        await sendMail(email, 'Feedback form - HeloDr', html);

        res.status(200).json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }

});

mailRouter.post('/sendOTP', async(req, res) => {
    try {
        const { fullName, email, otpCode, generatedTime, expiryTime } = req.body;
        // console.log(fullName, email, token, url);
        if (!fullName || !email || !otpCode || !generatedTime || !expiryTime) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = createOtpHtml(fullName, email, otpCode, generatedTime, expiryTime);
        await sendMail(email, 'Feedback form - HeloDr', html);

        res.status(200).json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }

});

module.exports = mailRouter;
