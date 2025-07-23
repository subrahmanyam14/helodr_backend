const nodemailer = require("nodemailer");
const express = require('express');
require('dotenv').config();
const {createEmailVerificationHTML, createReviewEmailHTML, createOtpHtml, createAppoinmentConfirmationHTML, createDoctorAppointmentConfirmationHTML} = require("./mailContents.js");

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
        await sendMail(email, 'One Time Password - HeloDr', html);

        res.status(200).json({ success: true, message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }

});

mailRouter.post('/sendAppointmentConfirmation', async(req, res) => {
    try {
        const { email, sub, patientName, doctorName, specialization, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink } = req.body;
        // console.log(fullName, email, token, url);
        if (!email || !sub || !patientName || !doctorName || !specialization || !appointmentDate || !appointmentStartTime || !appointmentEndTime || !duration || !patientProblem || !meetingLink) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = createAppoinmentConfirmationHTML(patientName, doctorName, specialization, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink);
        await sendMail(email, sub, html);

        res.status(200).json({ success: true, message: 'Appoinment confirmation email sent successfully' });
    } catch (error) {
        console.error('Error sending email sendAppointmentConfirmation:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }

});

mailRouter.post('/sendAppointmentScheduled', async(req, res) => {
    try {
        const { email, sub, doctorName, patientName, patientAge, patientGender, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink } = req.body;
        if (!email || !sub || !patientName || !doctorName || !patientAge || !patientGender || !appointmentDate || !appointmentStartTime || !appointmentEndTime || !duration || !patientProblem || !meetingLink) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = createDoctorAppointmentConfirmationHTML(doctorName, patientName, patientAge, patientGender, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink);
        await sendMail(email, sub, html);

        res.status(200).json({ success: true, message: 'Appoinment Schedule email sent successfully' });
    } catch (error) {
        console.error('Error sending email sendAppointmentScheduled:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }

});


module.exports = mailRouter;
