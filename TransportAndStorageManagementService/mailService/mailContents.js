
const createReviewEmailHTML = (patientName, doctorName, doctorSpecialization, appointmentTime, appointmentDate, reviewLink) => {
    return `
    <!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Appointment Completed - HeloDr</title>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>

<body
	style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafa; color: #333333; line-height: 1.6;">
	<table cellpadding="0" cellspacing="0" width="100%"
		style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 12px; overflow: hidden;">
		<!-- Header with white background and logo -->
		<tr>
			<td style="padding: 0;">
				<table width="100%" cellpadding="0" cellspacing="0"
					style="background-color: #ffffff; padding: 24px 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-bottom: 1px solid #f0f0f0;">
					<tr>
						<td>
							<table align="center" cellpadding="0" cellspacing="0"
								style="border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 0;">
										<img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
											alt="HeloDr Logo" style="width: 70px; height: auto; display: block;">
									</td>
									<td style="padding: 0 0 0 15px;">
										<span
											style="font-size: 26px; font-weight: 700; color: #009490; display: inline-block; letter-spacing: -0.5px;">HeloDr</span>
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
			<td style="padding: 0; height: 4px; background: linear-gradient(to right, #009490, #00b8b3);"></td>
		</tr>

		<!-- Content -->
		<tr>
			<td style="padding: 40px 30px;">
				<table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
					<tr>
						<td>
							<h1
								style="margin: 0 0 24px; font-size: 24px; font-weight: 700; color: #009490; text-align: center;">
								Appointment Completed</h1>
							<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Dear <strong>${patientName}</strong>,
							</p>
							<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Thank you for consulting with Dr. <strong>${doctorName}</strong>. We hope your appointment was helpful and informative.
							</p>

							<!-- Appointment Details Box -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-calendar-check" style="margin-right: 8px;"></i>Appointment Details
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<table width="100%" cellpadding="0" cellspacing="0"
											style="border-spacing: 0; border-collapse: collapse;">
											<tr>
												<td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">
													Doctor:</td>
												<td style="padding: 8px 0; font-weight: 600; color: #333333;">Dr. ${doctorName}</td>
											</tr>
											<tr>
												<td style="padding: 8px 0; color: #666666; vertical-align: top;">Specialization:</td>
												<td style="padding: 8px 0; font-weight: 600; color: #333333;">${doctorSpecialization}</td>
											</tr>
											<tr>
												<td style="padding: 8px 0; color: #666666; vertical-align: top;">Date & Time:</td>
												<td style="padding: 8px 0; font-weight: 600; color: #333333;">${appointmentDate} at
													${appointmentTime}</td>
											</tr>
								
										</table>
									</td>
								</tr>
							</table>

							<!-- Review Request -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04); background-color: #f9fdfd;">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-star" style="margin-right: 8px;"></i>Share Your Experience
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<p style="margin: 0 0 15px; font-size: 15px; line-height: 1.6; color: #555555;">
											Your feedback helps us improve our services and assists other patients in finding the right doctor. Please take a moment to rate your experience with Dr. ${doctorName}.
										</p>
										<table width="100%" cellpadding="0" cellspacing="0"
											style="border-spacing: 0; border-collapse: collapse; margin-bottom: 20px;">
											<tr>
												<td align="center">
													<a href="${reviewLink}"
														style="display: inline-block; min-width: 180px; background-color: #009490; color: #ffffff; font-size: 16px; font-weight: 600; text-align: center; text-decoration: none; padding: 12px 24px; border-radius: 8px; box-shadow: 0 3px 8px rgba(0, 148, 144, 0.2); transition: all 0.2s ease;">
														<i class="fas fa-edit" style="margin-right: 8px;"></i>Leave a Review
													</a>
												</td>
											</tr>
										</table>
										<p style="margin: 0; font-size: 14px; color: #666666; text-align: center;">
											It only takes 1 minute!
										</p>
									</td>
								</tr>
							</table>

							<!-- Review Link Text -->
							<p style="margin: 0 0 5px; font-size: 14px; color: #666666; text-align: center;">
								If the button doesn't work, copy and paste this link in your browser:
							</p>
							<div
								style="padding: 12px 15px; background-color: #f7f7f7; border: 1px solid #eaeaea; border-radius: 6px; font-size: 13px; color: #666666; word-break: break-all; text-align: center; margin-bottom: 25px;">
								${reviewLink}
							</div>

							<!-- Next Steps -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 30px 0; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-info-circle" style="margin-right: 8px;"></i>Next Steps
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<ul style="margin: 0; padding-left: 20px; color: #555555;">
											<li style="margin-bottom: 10px;">Check your email for any follow-up notes from Dr. ${doctorName}</li>
											<li style="margin-bottom: 10px;">Download your prescription from your HeloDr dashboard if provided</li>
											<li>Schedule a follow-up appointment if needed</li>
										</ul>
									</td>
								</tr>
							</table>

							<p style="margin: 30px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								We appreciate you choosing HeloDr for your healthcare needs.
							</p>
							<p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Thank you,<br>
								The HeloDr Team
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>

		<!-- Footer -->
		<tr>
			<td style="padding: 0;">
				<table width="100%" cellpadding="0" cellspacing="0"
					style="background-color: #f5f9f9; padding: 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-top: 1px solid #eaeaea;">
					<tr>
						<td style="padding: 20px 0;">
							<!-- Small logo in footer -->
							<table align="center" cellpadding="0" cellspacing="0"
								style="margin-bottom: 12px; border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 0;">
										<img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
											alt="HeloDr" style="width: 40px; height: auto; display: block;">
									</td>
								</tr>
							</table>

							<p style="margin: 0 0 15px; font-size: 14px; color: #666666;">
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

</html>`
}

const createEmailVerificationHTML = (fullName, email, token, url) => {
    const verificationUrl = `${url}/verify-email?email=${email}&token=${token}`;
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
                                            <a href="${verificationUrl}"
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
                                                ${verificationUrl}
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

const createOtpHtml = (fullName, email, otpCode, generatedTime, expiryTime) => {
    return `
    <!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>OTP Verification - HeloDr</title>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>

<body
	style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafa; color: #333333; line-height: 1.6;">
	<table cellpadding="0" cellspacing="0" width="100%"
		style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 12px; overflow: hidden;">
		<!-- Header with white background and logo -->
		<tr>
			<td style="padding: 0;">
				<table width="100%" cellpadding="0" cellspacing="0"
					style="background-color: #ffffff; padding: 24px 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-bottom: 1px solid #f0f0f0;">
					<tr>
						<td>
							<table align="center" cellpadding="0" cellspacing="0"
								style="border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 0;">
										<img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
											alt="HeloDr Logo" style="width: 70px; height: auto; display: block;">
									</td>
									<td style="padding: 0 0 0 15px;">
										<span
											style="font-size: 26px; font-weight: 700; color: #009490; display: inline-block; letter-spacing: -0.5px;">HeloDr</span>
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
			<td style="padding: 0; height: 4px; background: linear-gradient(to right, #009490, #00b8b3);"></td>
		</tr>

		<!-- Content -->
		<tr>
			<td style="padding: 40px 30px;">
				<table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
					<tr>
						<td>
							<h1
								style="margin: 0 0 24px; font-size: 24px; font-weight: 700; color: #009490; text-align: center;">
								<i class="fas fa-shield-alt" style="margin-right: 10px;"></i>Email Verification</h1>
							
							<!-- OTP Icon -->
							<div style="text-align: center; margin-bottom: 30px;">
								<div style="display: inline-block; width: 80px; height: 80px; background: linear-gradient(135deg, #009490, #00b8b3); border-radius: 50%; line-height: 80px; text-align: center; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0, 148, 144, 0.3);">
									<i class="fas fa-key" style="font-size: 32px; color: #ffffff;"></i>
								</div>
							</div>

							<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Dear <strong>${fullName}</strong>,
							</p>
							<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								We have sent you a One-Time Password (OTP) to verify your email address. Please use the code below to complete your verification:
							</p>

							<!-- OTP Code Box -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 25px; border: 2px solid #009490; border-radius: 12px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 15px rgba(0, 148, 144, 0.15);">
								<tr>
									<td style="padding: 30px; background: linear-gradient(135deg, #f5fafa, #e8f8f5); text-align: center;">
										<p style="margin: 0 0 15px; font-size: 16px; font-weight: 600; color: #009490; text-transform: uppercase; letter-spacing: 1px;">
											Your Verification Code
										</p>
										<div style="display: inline-block; background-color: #ffffff; padding: 20px 30px; border-radius: 10px; border: 1px solid #eaeaea; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
											<span style="font-size: 36px; font-weight: 700; color: #009490; font-family: 'Courier New', monospace; letter-spacing: 8px;">${otpCode}</span>
										</div>
									</td>
								</tr>
							</table>

							<!-- Timer and Validity Info -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 25px; border: 1px solid #ffeaa7; background-color: #fefcf0; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 20px; text-align: center;">
																			
										<p style="margin: 0; font-size: 14px; color: #666666; line-height: 1.5;">
											<i class="fas fa-exclamation-triangle" style="margin-right: 5px; color: #d63031;"></i>
											This OTP is valid for <strong>15 minutes</strong> from the time it was sent.<br>
											Generated at: <strong>${generatedTime}</strong><br>
											Expires at: <strong>${expiryTime}</strong>
										</p>
									</td>
								</tr>
							</table>

							<!-- Verification Instructions -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 25px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-list-check" style="margin-right: 8px;"></i>How to Use This Code
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<ol style="margin: 0; padding-left: 20px; color: #555555; font-size: 15px; line-height: 1.6;">
											<li style="margin-bottom: 10px;">Return to the HeloDr website or app where you initiated the verification process.</li>
											<li style="margin-bottom: 10px;">Enter the 6-digit OTP code exactly as shown above.</li>
											<li style="margin-bottom: 10px;">Click "Verify" to complete the process.</li>
											<li style="margin-bottom: 0;">Your account will be verified and you can proceed with your appointment booking.</li>
										</ol>
									</td>
								</tr>
							</table>

							

							<!-- Security Note -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 25px; border: 1px solid #ffcdd2; background-color: #ffebee; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 20px;">
										<p style="margin: 0 0 10px; font-size: 16px; font-weight: 600; color: #d32f2f;">
											<i class="fas fa-shield-alt" style="margin-right: 8px;"></i>Security Notice
										</p>
										<ul style="margin: 0; padding-left: 20px; color: #666666; font-size: 14px; line-height: 1.5;">
											<li style="margin-bottom: 5px;">Never share this OTP with anyone, including HeloDr staff.</li>
											<li style="margin-bottom: 5px;">HeloDr will never ask for your OTP via phone or email.</li>
											<li style="margin-bottom: 5px;">This code is only valid for the email address: <strong>${email}</strong></li>
											<li style="margin-bottom: 0;">If you didn't request this verification, please ignore this email.</li>
										</ul>
									</td>
								</tr>
							</table>

							<p style="margin: 30px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								If you're having trouble with the verification process or need assistance, please contact our support team.
							</p>
							<p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Thank you for choosing HeloDr!<br>
								The HeloDr Team
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>

		<!-- Footer -->
		<tr>
			<td style="padding: 0;">
				<table width="100%" cellpadding="0" cellspacing="0"
					style="background-color: #f5f9f9; padding: 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-top: 1px solid #eaeaea;">
					<tr>
						<td style="padding: 20px 0;">
							<!-- Small logo in footer -->
							<table align="center" cellpadding="0" cellspacing="0"
								style="margin-bottom: 12px; border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 0;">
										<img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
											alt="HeloDr" style="width: 40px; height: auto; display: block;">
									</td>
								</tr>
							</table>

							<p style="margin: 0 0 15px; font-size: 14px; color: #666666;">
								Need help? Contact our support team at
								<a href="mailto:support@helodr.com"
									style="color: #009490; text-decoration: none; font-weight: 500;">support@helodr.com</a>
							</p>
							<p style="margin: 0 0 10px; font-size: 12px; color: #888888;">
								This is an automated message. Please do not reply to this email.
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
    `
}

const createOnlineAppoinmentConfirmationHTML = (patientName, doctorName, specialization, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink) => {
	return `

	<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Appointment Confirmation - HeloDr</title>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>

<body
	style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafa; color: #333333; line-height: 1.6;">
	<table cellpadding="0" cellspacing="0" width="100%"
		style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 12px; overflow: hidden;">
		<!-- Header with white background and logo -->
		<tr>
			<td style="padding: 0;">
				<table width="100%" cellpadding="0" cellspacing="0"
					style="background-color: #ffffff; padding: 24px 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-bottom: 1px solid #f0f0f0;">
					<tr>
						<td>
							<table align="center" cellpadding="0" cellspacing="0"
								style="border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 0;">
										<img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
											alt="HeloDr Logo" style="width: 70px; height: auto; display: block;">
									</td>
									<td style="padding: 0 0 0 15px;">
										<span
											style="font-size: 26px; font-weight: 700; color: #009490; display: inline-block; letter-spacing: -0.5px;">HeloDr</span>
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
			<td style="padding: 0; height: 4px; background: linear-gradient(to right, #009490, #00b8b3);"></td>
		</tr>

		<!-- Content -->
		<tr>
			<td style="padding: 40px 30px;">
				<table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
					<tr>
						<td>
							<h1
								style="margin: 0 0 24px; font-size: 24px; font-weight: 700; color: #009490; text-align: center;">
								Your Appointment is Confirmed</h1>
							<p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Dear <strong>${patientName}</strong>,
							</p>
							<p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Your appointment has been successfully scheduled. Here are your appointment details:
							</p>

							<!-- Doctor Info Box -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-user-md" style="margin-right: 8px;"></i>Doctor Information
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<table width="100%" cellpadding="0" cellspacing="0"
											style="border-spacing: 0; border-collapse: collapse;">
											<tr>
												<td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">
													Doctor Name:</td>
												<td style="padding: 8px 0; font-weight: 600; color: #333333;">Dr. ${doctorName}
												</td>
											</tr>
											<tr>
												<td style="padding: 8px 0; color: #666666; vertical-align: top;">Specialization:
												</td>
												<td style="padding: 8px 0; font-weight: 600; color: #333333;">${specialization}
												</td>
											</tr>
										</table>
									</td>
								</tr>
							</table>

							<!-- Appointment Details Box -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-calendar-check" style="margin-right: 8px;"></i>Appointment Details
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<table width="100%" cellpadding="0" cellspacing="0"
											style="border-spacing: 0; border-collapse: collapse;">
											<tr>
												<td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">Date
													& Time:</td>
												<td style="padding: 8px 0; font-weight: 600; color: #333333;">${appointmentDate.split('T')[0]} at
													${appointmentStartTime}</td>
											</tr>
											<tr>
												<td style="padding: 8px 0; color: #666666; vertical-align: top;">Upto:</td>
												<td style="padding: 8px 0; font-weight: 600; color: #333333;">${appointmentEndTime}
												</td>
											</tr>
										</table>
									</td>
								</tr>
							</table>

							<!-- Your Problem Summary -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-notes-medical" style="margin-right: 8px;"></i>Your Concern
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
											${patientProblem}
										</p>
									</td>
								</tr>
							</table>

							<!-- Join Meeting Button -->
							<p
								style="margin: 0 0 10px; font-size: 16px; line-height: 1.6; color: #555555; text-align: center;">
								Click the button below to join the meeting at the scheduled time:
							</p>
							<table width="100%" cellpadding="0" cellspacing="0"
								style="border-spacing: 0; border-collapse: collapse; margin-bottom: 30px;">
								<tr>
									<td align="center">
										<a href="${meetingLink}"
											style="display: inline-block; min-width: 180px; background-color: #009490; color: #ffffff; font-size: 16px; font-weight: 600; text-align: center; text-decoration: none; padding: 12px 24px; border-radius: 8px; box-shadow: 0 3px 8px rgba(0, 148, 144, 0.2); transition: all 0.2s ease;">
											<i class="fas fa-video" style="margin-right: 8px;"></i>Join Meeting
										</a>
									</td>
								</tr>
							</table>

							<!-- Meeting Link Text -->
							<p style="margin: 0 0 5px; font-size: 14px; color: #666666; text-align: center;">
								If the button doesn't work, copy and paste this link in your browser:
							</p>
							<div
								style="padding: 12px 15px; background-color: #f7f7f7; border: 1px solid #eaeaea; border-radius: 6px; font-size: 13px; color: #666666; word-break: break-all; text-align: center; margin-bottom: 25px;">
								${meetingLink}
							</div>

							<!-- Reminders Section -->
							<table width="100%" cellpadding="0" cellspacing="0"
								style="margin: 10px 0 0; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
								<tr>
									<td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
										<p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
											<i class="fas fa-bell" style="margin-right: 8px;"></i>Important Reminders
										</p>
									</td>
								</tr>
								<tr>
									<td style="padding: 20px;">
										<ul
											style="margin: 0; padding: 0 0 0 20px; font-size: 15px; line-height: 1.6; color: #555555;">
											<li style="margin-bottom: 10px; padding-left: 5px;">Please join the meeting 5 minutes
												before your scheduled
												time.</li>
											<li style="margin-bottom: 10px; padding-left: 5px;">Ensure you have a stable internet
												connection.</li>
											<li style="margin-bottom: 10px; padding-left: 5px;">Keep any relevant medical records
												or reports handy.
											</li>
											<li style="margin-bottom: 0; padding-left: 5px;">If you need to reschedule, please do
												so at least 6 hours
												in advance.</li>
										</ul>
									</td>
								</tr>
							</table>

							<p style="margin: 30px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								You can view and manage all your appointments in your HeloDr account.
							</p>
							<p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Thank you for choosing HeloDr for your healthcare needs.
							</p>
							<p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
								Best regards,<br>
								The HeloDr Team
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>

		<!-- Footer -->
		<tr>
			<td style="padding: 0;">
				<table width="100%" cellpadding="0" cellspacing="0"
					style="background-color: #f5f9f9; padding: 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-top: 1px solid #eaeaea;">
					<tr>
						<td style="padding: 20px 0;">
							<!-- Small logo in footer -->
							<table align="center" cellpadding="0" cellspacing="0"
								style="margin-bottom: 12px; border-spacing: 0; border-collapse: collapse;">
								<tr>
									<td style="padding: 0;">
										<img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png"
											alt="HeloDr" style="width: 40px; height: auto; display: block;">
									</td>
								</tr>
							</table>

							<p style="margin: 0 0 15px; font-size: 14px; color: #666666;">
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

	`
}

const createOfflineAppointmentConfirmationHTML = (patientName, doctorName, specialization, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, clinicAddress) => {
  return `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation - HeloDr</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>

<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafa; color: #333333; line-height: 1.6;">
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 12px; overflow: hidden;">
    <!-- Header with white background and logo -->
    <tr>
      <td style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 24px 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-bottom: 1px solid #f0f0f0;">
          <tr>
            <td>
              <table align="center" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0;">
                    <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png" alt="HeloDr Logo" style="width: 70px; height: auto; display: block;">
                  </td>
                  <td style="padding: 0 0 0 15px;">
                    <span style="font-size: 26px; font-weight: 700; color: #009490; display: inline-block; letter-spacing: -0.5px;">HeloDr</span>
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
      <td style="padding: 0; height: 4px; background: linear-gradient(to right, #009490, #00b8b3);"></td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 40px 30px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
          <tr>
            <td>
              <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 700; color: #009490; text-align: center;">
                Your In-Person Appointment is Confirmed
              </h1>
              <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Dear <strong>${patientName}</strong>,
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Your in-person appointment has been successfully scheduled. Here are your appointment details:
              </p>

              <!-- Doctor Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-user-md" style="margin-right: 8px;"></i>Doctor Information
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">
                          Doctor Name:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">Dr. ${doctorName}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Specialization:
                        </td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${specialization}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Appointment Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-calendar-check" style="margin-right: 8px;"></i>Appointment Details
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">Date & Time:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${appointmentDate.split('T')[0]} at ${appointmentStartTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Duration:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">Until ${appointmentEndTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Visit Type:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">In-person consultation</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Clinic Address Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-map-marker-alt" style="margin-right: 8px;"></i>Clinic Address
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
                      ${clinicAddress}
                    </p>
                    <p style="margin: 15px 0 0; font-size: 15px; line-height: 1.6; color: #555555;">
                      <a href="https://maps.google.com/?q=${encodeURIComponent(clinicAddress)}" style="color: #009490; text-decoration: none; font-weight: 500;">
                        <i class="fas fa-directions" style="margin-right: 5px;"></i>Get Directions
                      </a>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Your Problem Summary -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-notes-medical" style="margin-right: 8px;"></i>Your Concern
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
                      ${patientProblem}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Reminders Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 10px 0 0; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-bell" style="margin-right: 8px;"></i>Important Reminders
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <ul style="margin: 0; padding: 0 0 0 20px; font-size: 15px; line-height: 1.6; color: #555555;">
                      <li style="margin-bottom: 10px; padding-left: 5px;">Please arrive at the clinic 10-15 minutes before your scheduled time.</li>
                      <li style="margin-bottom: 10px; padding-left: 5px;">Bring your ID and any relevant medical records or reports.</li>
                      <li style="margin-bottom: 10px; padding-left: 5px;">Carry your health insurance card if applicable.</li>
                      <li style="margin-bottom: 0; padding-left: 5px;">If you need to reschedule, please do so at least 6 hours in advance.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                You can view and manage all your appointments in your HeloDr account.
              </p>
              <p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Thank you for choosing HeloDr for your healthcare needs.
              </p>
              <p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Best regards,<br>
                The HeloDr Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f9f9; padding: 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-top: 1px solid #eaeaea;">
          <tr>
            <td style="padding: 20px 0;">
              <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png" alt="HeloDr" style="width: 40px; height: auto; display: block; margin: 0 auto 12px;">
              <p style="margin: 0 0 15px; font-size: 14px; color: #666666;">
                Need help? Contact our support team at
                <a href="mailto:support@helodr.com" style="color: #009490; text-decoration: none; font-weight: 500;">support@helodr.com</a>
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
</body>

</html>
  `;
}

const createDoctorOnlineAppointmentConfirmationHTML = (doctorName, patientName, patientAge, patientGender, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem, meetingLink) => {
  return `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Appointment - HeloDr</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>

<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafa; color: #333333; line-height: 1.6;">
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 12px; overflow: hidden;">
    <!-- Header -->
    <tr>
      <td style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 24px 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-bottom: 1px solid #f0f0f0;">
          <tr>
            <td>
              <table align="center" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0;">
                    <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png" alt="HeloDr Logo" style="width: 70px; height: auto; display: block;">
                  </td>
                  <td style="padding: 0 0 0 15px;">
                    <span style="font-size: 26px; font-weight: 700; color: #009490; display: inline-block; letter-spacing: -0.5px;">HeloDr</span>
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
      <td style="padding: 0; height: 4px; background: linear-gradient(to right, #009490, #00b8b3);"></td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 40px 30px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
          <tr>
            <td>
              <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 700; color: #009490; text-align: center;">
                New Appointment Scheduled
              </h1>
              <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Dear Dr. <strong>${doctorName}</strong>,
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                A new appointment has been booked with you. Here are the details:
              </p>

              <!-- Patient Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-user-injured" style="margin-right: 8px;"></i>Patient Information
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">Name:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${patientName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Age & Gender:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${patientAge} years, ${patientGender}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Appointment Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-calendar-check" style="margin-right: 8px;"></i>Appointment Details
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">Date & Time:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${appointmentDate.split('T')[0]} at ${appointmentStartTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Duration:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">Until ${appointmentEndTime}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Patient's Concern -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-notes-medical" style="margin-right: 8px;"></i>Patient's Concern
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
                      ${patientProblem}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Join Meeting Button -->
              <p style="margin: 0 0 10px; font-size: 16px; line-height: 1.6; color: #555555; text-align: center;">
                Click below to join the consultation at the scheduled time:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse; margin-bottom: 30px;">
                <tr>
                  <td align="center">
                    <a href="${meetingLink}" style="display: inline-block; min-width: 180px; background-color: #009490; color: #ffffff; font-size: 16px; font-weight: 600; text-align: center; text-decoration: none; padding: 12px 24px; border-radius: 8px; box-shadow: 0 3px 8px rgba(0, 148, 144, 0.2); transition: all 0.2s ease;">
                      <i class="fas fa-video" style="margin-right: 8px;"></i>Join Consultation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Meeting Link Text -->
              <p style="margin: 0 0 5px; font-size: 14px; color: #666666; text-align: center;">
                If the button doesn't work, use this link:
              </p>
              <div style="padding: 12px 15px; background-color: #f7f7f7; border: 1px solid #eaeaea; border-radius: 6px; font-size: 13px; color: #666666; word-break: break-all; text-align: center; margin-bottom: 25px;">
                ${meetingLink}
              </div>

              <!-- Reminders Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 10px 0 0; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-bell" style="margin-right: 8px;"></i>Reminders
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <ul style="margin: 0; padding: 0 0 0 20px; font-size: 15px; line-height: 1.6; color: #555555;">
                      <li style="margin-bottom: 10px; padding-left: 5px;">Please join the consultation on time.</li>
                      <li style="margin-bottom: 10px; padding-left: 5px;">Review the patient's concern beforehand.</li>
                      <li style="margin-bottom: 0; padding-left: 5px;">If unavailable, reschedule/cancel via your HeloDr dashboard.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Manage appointments in your <a href="#" style="color: #009490; text-decoration: none; font-weight: 500;">HeloDr dashboard</a>.
              </p>
              <p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Best regards,<br>
                The HeloDr Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f9f9; padding: 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-top: 1px solid #eaeaea;">
          <tr>
            <td style="padding: 20px 0;">
              <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png" alt="HeloDr" style="width: 40px; height: auto; display: block; margin: 0 auto 12px;">
              <p style="margin: 0 0 15px; font-size: 14px; color: #666666;">
                Questions? Contact <a href="mailto:support@helodr.com" style="color: #009490; text-decoration: none; font-weight: 500;">support@helodr.com</a>
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
</body>

</html>
  `;
};

const createDoctorOfflineAppointmentConfirmationHTML = (doctorName, patientName, patientAge, patientGender, appointmentDate, appointmentStartTime, appointmentEndTime, patientProblem) => {
  return `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Appointment - HeloDr</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
</head>

<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafa; color: #333333; line-height: 1.6;">
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-spacing: 0; border-collapse: collapse; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border-radius: 12px; overflow: hidden;">
    <!-- Header -->
    <tr>
      <td style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #ffffff; padding: 24px 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-bottom: 1px solid #f0f0f0;">
          <tr>
            <td>
              <table align="center" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                <tr>
                  <td style="padding: 0;">
                    <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png" alt="HeloDr Logo" style="width: 70px; height: auto; display: block;">
                  </td>
                  <td style="padding: 0 0 0 15px;">
                    <span style="font-size: 26px; font-weight: 700; color: #009490; display: inline-block; letter-spacing: -0.5px;">HeloDr</span>
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
      <td style="padding: 0; height: 4px; background: linear-gradient(to right, #009490, #00b8b3);"></td>
    </tr>

    <!-- Content -->
    <tr>
      <td style="padding: 40px 30px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
          <tr>
            <td>
              <h1 style="margin: 0 0 24px; font-size: 24px; font-weight: 700; color: #009490; text-align: center;">
                New In-Person Appointment Scheduled
              </h1>
              <p style="margin: 0 0 25px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Dear Dr. <strong>${doctorName}</strong>,
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                A new in-person appointment has been booked with you. Here are the details:
              </p>

              <!-- Patient Info Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-user-injured" style="margin-right: 8px;"></i>Patient Information
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">Name:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${patientName}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Age & Gender:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${patientAge} years, ${patientGender}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Appointment Details Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-calendar-check" style="margin-right: 8px;"></i>Appointment Details
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-spacing: 0; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 8px 0; width: 140px; color: #666666; vertical-align: top;">Date & Time:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">${appointmentDate.split('T')[0]} at ${appointmentStartTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Duration:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">Until ${appointmentEndTime}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; vertical-align: top;">Visit Type:</td>
                        <td style="padding: 8px 0; font-weight: 600; color: #333333;">In-person consultation</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Patient's Concern -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 30px; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-notes-medical" style="margin-right: 8px;"></i>Patient's Concern
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
                      ${patientProblem}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Reminders Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 10px 0 0; border: 1px solid #eaeaea; border-radius: 10px; overflow: hidden; border-spacing: 0; border-collapse: collapse; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);">
                <tr>
                  <td style="padding: 16px; background-color: #f5fafa; border-bottom: 1px solid #eaeaea;">
                    <p style="margin: 0; font-size: 17px; font-weight: 600; color: #009490;">
                      <i class="fas fa-bell" style="margin-right: 8px;"></i>Reminders
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px;">
                    <ul style="margin: 0; padding: 0 0 0 20px; font-size: 15px; line-height: 1.6; color: #555555;">
                      <li style="margin-bottom: 10px; padding-left: 5px;">Please be available at your clinic at the scheduled time.</li>
                      <li style="margin-bottom: 10px; padding-left: 5px;">Review the patient's concern beforehand.</li>
                      <li style="margin-bottom: 0; padding-left: 5px;">If unavailable, reschedule/cancel via your HeloDr dashboard.</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Manage appointments in your <a href="#" style="color: #009490; text-decoration: none; font-weight: 500;">HeloDr dashboard</a>.
              </p>
              <p style="margin: 15px 0 0; font-size: 16px; line-height: 1.6; color: #555555; text-align: left;">
                Best regards,<br>
                The HeloDr Team
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f9f9; padding: 0; text-align: center; border-spacing: 0; border-collapse: collapse; border-top: 1px solid #eaeaea;">
          <tr>
            <td style="padding: 20px 0;">
              <img src="https://res.cloudinary.com/dnl1wajhw/image/upload/v1744544139/logo_dghuww.png" alt="HeloDr" style="width: 40px; height: auto; display: block; margin: 0 auto 12px;">
              <p style="margin: 0 0 15px; font-size: 14px; color: #666666;">
                Questions? Contact <a href="mailto:support@helodr.com" style="color: #009490; text-decoration: none; font-weight: 500;">support@helodr.com</a>
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
</body>

</html>
  `;
};
module.exports = {createEmailVerificationHTML, createReviewEmailHTML, createOtpHtml, createOnlineAppoinmentConfirmationHTML, createOfflineAppointmentConfirmationHTML, createDoctorOnlineAppointmentConfirmationHTML, createDoctorOfflineAppointmentConfirmationHTML}