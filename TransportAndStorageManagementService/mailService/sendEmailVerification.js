const nodemailer = require("nodemailer");
const express = require('express');
require('dotenv').config();

const mailRouter = express.Router();

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, // Your Gmail email
        pass: process.env.EMAIL_PASS  // Your Gmail App Password
    }
});

const createHTML = (fullName, email, token, url) => {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification - HeloDr</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    </head>
    <body style="background-color: #f4f4f4; font-family: Arial, sans-serif;">
        <div style="max-width: 600px; margin: auto; background: #fff; padding: 20px; text-align: center; border-radius: 10px; box-shadow: 0px 0px 10px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #009490;">Verify Your Email</h2>
            <p>Hi <strong>${fullName}</strong>,</p>
            <p>Please click the button below to verify your email address. This link is valid for only 24 hours.</p>
            <a href="${url}?token=${token}&email=${email}" 
               style="display: inline-block; background-color: #009490; color: white; padding: 12px 20px; text-decoration: none; font-size: 16px; border-radius: 5px;">
                Confirm Email
            </a>
            <p>If you didn’t request this, you can safely ignore this email.</p>
            <p>Best Regards,<br>Team HeloDr</p>
        </div>
    </body>
    </html>
    `;
}

const sendEmail = async (to, subject, html) => {
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

        const html = createHTML(fullName, email, token, url);
        await sendEmail(email, 'Verify Your Email - HeloDr', html);

        res.status(200).json({ message: 'Verification email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

module.exports = mailRouter;
