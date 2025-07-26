const nodemailer = require("nodemailer");
const express = require('express');
require('dotenv').config();
const {createEmailVerificationHTML, createReviewEmailHTML, createOtpHtml, createOnlineAppoinmentConfirmationHTML, createOfflineAppointmentConfirmationHTML, createDoctorOfflineAppointmentConfirmationHTML, createDoctorOnlineAppointmentConfirmationHTML} = require("./mailContents.js");

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
        const { email, patientName, doctorName, doctorSpecialization, appointmentTime, appointmentDate, reviewLink } = req.body;
        if (!email || !patientName || !doctorName || !doctorSpecialization || !appointmentTime || !appointmentDate || !reviewLink) {
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
        const { email, sub, patientName, doctorName, specialization, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink, clinicAddress } = req.body;
        
        if (!email || !sub || !patientName || !doctorName || !specialization || !appointmentDate || !appointmentStartTime || !appointmentEndTime ) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = meetingLink? createOnlineAppoinmentConfirmationHTML(patientName, doctorName, specialization, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink || ""): createOfflineAppointmentConfirmationHTML(patientName, doctorName, specialization, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, clinicAddress || "");
        await sendMail(email, sub, html);

        res.status(200).json({ success: true, message: 'Appointment confirmation email sent successfully' });
    } catch (error) {
        console.error('Error sending email sendAppointmentConfirmation:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

mailRouter.post('/sendAppointmentScheduled', async(req, res) => {
    try {
        const { email, sub, doctorName, patientName, patientAge, patientGender, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink } = req.body;
        
        if (!email || !sub || !patientName || !doctorName || !patientAge || !patientGender || !appointmentDate || !appointmentStartTime || !appointmentEndTime ) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = meetingLink? createDoctorOnlineAppointmentConfirmationHTML(doctorName, patientName, patientAge, patientGender, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink): createDoctorOfflineAppointmentConfirmationHTML(doctorName, patientName, patientAge, patientGender, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem);
        await sendMail(email, sub, html);

        res.status(200).json({ success: true, message: 'Appointment schedule email sent successfully' });
    } catch (error) {
        console.error('Error sending email sendAppointmentScheduled:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Add other email endpoints as needed (reminder, cancellation, reschedule, etc.)
mailRouter.post('/sendAppointmentReminder', async(req, res) => {
    try {
        const { email, subject, message, reminderType } = req.body;
        
        if (!email || !subject || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // You can create a specific HTML template for reminders or use a simple message
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Appointment Reminder</h2>
                <p>${message}</p>
                <p><strong>Reminder Type:</strong> ${reminderType}</p>
            </div>
        `;
        
        await sendMail(email, subject, html);

        res.status(200).json({ success: true, message: 'Appointment reminder email sent successfully' });
    } catch (error) {
        console.error('Error sending appointment reminder email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

mailRouter.post('/sendAppointmentCancellation', async(req, res) => {
    try {
        const { email, subject, message } = req.body;
        
        if (!email || !subject || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Appointment Cancellation</h2>
                <p>${message}</p>
            </div>
        `;
        
        await sendMail(email, subject, html);

        res.status(200).json({ success: true, message: 'Appointment cancellation email sent successfully' });
    } catch (error) {
        console.error('Error sending appointment cancellation email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

mailRouter.post('/sendAppointmentReschedule', async(req, res) => {
    try {
        const { email, subject, message } = req.body;
        
        if (!email || !subject || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Appointment Rescheduled</h2>
                <p>${message}</p>
            </div>
        `;
        
        await sendMail(email, subject, html);

        res.status(200).json({ success: true, message: 'Appointment reschedule email sent successfully' });
    } catch (error) {
        console.error('Error sending appointment reschedule email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

mailRouter.post('/sendPaymentConfirmation', async(req, res) => {
    try {
        const { email, subject, message } = req.body;
        
        if (!email || !subject || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Payment Confirmation</h2>
                <p>${message}</p>
            </div>
        `;
        
        await sendMail(email, subject, html);

        res.status(200).json({ success: true, message: 'Payment confirmation email sent successfully' });
    } catch (error) {
        console.error('Error sending payment confirmation email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

mailRouter.post('/sendRefundInitiation', async(req, res) => {
    try {
        const { email, subject, message } = req.body;
        
        if (!email || !subject || !message) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Refund Initiated</h2>
                <p>${message}</p>
            </div>
        `;
        
        await sendMail(email, subject, html);

        res.status(200).json({ success: true, message: 'Refund initiation email sent successfully' });
    } catch (error) {
        console.error('Error sending refund initiation email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

module.exports = mailRouter;