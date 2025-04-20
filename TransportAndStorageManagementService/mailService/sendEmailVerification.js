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
    <!DOCTYPE html>
    <html lang="en">

    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your HeloDr Account</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    </head>

    <body
        style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f9fa; color: #333333;">
        <table cellpadding="0" cellspacing="0" width="100%"
            style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1); border-radius: 16px; overflow: hidden;">
            <!-- Header with white background and logo -->
            <tr>
                <td style="padding: 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                        style="background-color: #ffffff; padding: 20px 0; text-align: center; border-spacing: 0; border-collapse: collapse;">
                        <tr>
                            <td>
                                <table align="center" cellpadding="0" cellspacing="0"
                                    style="border-spacing: 0; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 10px 0;">
                                            <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
                                                alt="HeloDr Logo" style="width: 60px; height: auto; display: block;">
                                        </td>
                                        <td style="padding: 0 0 0 15px;">
                                            <span
                                                style="font-size: 28px; font-weight: 700; color: #009490; display: inline-block;">HeloDr</span>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>

            <!-- Colored bar separator -->
            <tr>
                <td style="padding: 0; height: 6px; background-color: #009490;"></td>
            </tr>

            <!-- Content -->
            <tr>
                <td style="padding: 40px 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                        <tr>
                            <td>
                                <h1
                                    style="margin: 0 0 20px; font-size: 28px; font-weight: 700; color: #009490; text-align: center;">
                                    Verify Your Email Address</h1>
                                <p
                                    style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #555555; text-align: center;">
                                    Hi <strong>${fullName}</strong>, thank you for signing up with HeloDr. To complete your
                                    registration and access our healthcare
                                    services, please verify your email address.
                                </p>

                                <div style="text-align: center; margin: 40px 0;">
                                    <div
                                        style="display: inline-block; padding: 16px; background-color: rgba(0, 148, 144, 0.08); border-radius: 12px; max-width: 85%;">
                                        <p style="margin: 0; font-size: 14px; color: #009490; font-weight: 500;">
                                            This link will expire in 24 hours. If you didn't create an account, you can safely ignore
                                            this email.
                                        </p>
                                    </div>
                                </div>

                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="border-spacing: 0; border-collapse: collapse;">
                                    <tr>
                                        <td align="center">
                                            <a href="{{verificationUrl}}"
                                                style="display: inline-block; min-width: 200px; background-color: #009490; color: #ffffff; font-size: 16px; font-weight: 600; text-align: center; text-decoration: none; padding: 14px 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 148, 144, 0.25); transition: all 0.3s ease;">
                                                Confirm Email
                                            </a>
                                        </td>
                                    </tr>
                                </table>

                                <!-- Link without JavaScript Copy Button -->
                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="border-spacing: 0; border-collapse: collapse; margin-bottom: 30px;">
                                    <tr>
                                        <td style="padding: 0 30px;">
                                            <p
                                                style="margin: 30px 0 15px; font-size: 15px; line-height: 1.6; color: #666666; text-align: center;">
                                                If the button above doesn't work, copy and paste the following link into your browser:
                                            </p>
                                            <div
                                                style="padding: 12px 15px; background-color: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 14px; color: #555555; word-break: break-all; text-align: center;">
                                                {{verificationUrl}}
                                            </div>
                                        </td>
                                    </tr>
                                </table>

                            </td>
                        </tr>
                    </table>
                </td>
            </tr>

            <!-- Promotional Section -->
            <tr>
                <td style="padding: 0 30px 30px;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                        style="border-radius: 12px; overflow: hidden; background-color: #f5fafa; border-spacing: 0; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 25px 20px; text-align: center;">
                                <h2 style="margin: 0 0 15px; font-size: 18px; color: #009490;">What you can do with HeloDr</h2>

                                <table width="100%" cellpadding="0" cellspacing="0"
                                    style="border-spacing: 0; border-collapse: collapse;">
                                    <tr>
                                        <td width="33%" style="padding: 10px; text-align: center; vertical-align: top;">
                                            <div
                                                style="width: 50px; height: 50px; margin: 0 auto 10px; background-color: rgba(0, 148, 144, 0.2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                                                <i class="fas fa-calendar-check" style="color: #009490; font-size: 24px;"></i>
                                            </div>
                                            <p style="margin: 0; font-size: 14px; color: #555555;">Book Appointments</p>
                                        </td>
                                        <td width="33%" style="padding: 10px; text-align: center; vertical-align: top;">
                                            <div
                                                style="width: 50px; height: 50px; margin: 0 auto 10px; background-color: rgba(0, 148, 144, 0.2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                                                <i class="fas fa-video" style="color: #009490; font-size: 24px;"></i>
                                            </div>
                                            <p style="margin: 0; font-size: 14px; color: #555555;">Online Consultations</p>
                                        </td>
                                        <td width="33%" style="padding: 10px; text-align: center; vertical-align: top;">
                                            <div
                                                style="width: 50px; height: 50px; margin: 0 auto 10px; background-color: rgba(0, 148, 144, 0.2); border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
                                                <i class="fas fa-notes-medical" style="color: #009490; font-size: 24px;"></i>
                                            </div>
                                            <p style="margin: 0; font-size: 14px; color: #555555;">Health Records</p>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>

            <!-- Footer -->
            <tr>
                <td style="padding: 0;">
                    <table width="100%" cellpadding="0" cellspacing="0"
                        style="background-color: #f2f7f7; padding: 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-top: 1px solid #e0e0e0;">
                        <tr>
                            <td style="padding: 20px 0;">
                                <!-- Small logo in footer -->
                                <table align="center" cellpadding="0" cellspacing="0"
                                    style="margin-bottom: 15px; border-spacing: 0; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 0;">
                                            <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
                                                alt="HeloDr" style="width: 50px; height: auto; display: block;">
                                        </td>
                                    </tr>
                                </table>

                                <p style="margin: 0 15px 15px; font-size: 14px; color: #666666; line-height: 1.6;">
                                    Need help? Contact our support team at
                                    <a href="mailto:support@helodr.com"
                                        style="color: #009490; text-decoration: none; font-weight: 500;">support@helodr.com</a>
                                </p>
                                <p style="margin: 0; font-size: 12px; color: #888888;">
                                    &copy; 2023 HeloDr. All rights reserved.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>

        <!-- Spacer -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
            <tr>
                <td style="padding: 30px 0;"></td>
            </tr>
        </table>
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
