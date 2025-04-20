const User = require('../models/User');
const Otp = require('../models/Otp');
const LoginStatus = require('../models/LoginStatus');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const axios = require('axios');
const FormData = require('form-data');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { default: isEmail } = require('validator/lib/isEmail');
dotenv.config();

const transportStorageServiceUrl = process.env.TRANSPORT_STORAGE_SERVICE_URL;



// Generate OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


exports.login = async (req, res) => {
  try {
    const { emailOrMobile, password } = req.body;

    // Validate input
    if (!emailOrMobile) {
      return res.status(400).json({
        success: false,
        message: 'Email or mobile number is required'
      });
    }

    // Find user by email or mobile
    const user = await User.findOne({
      $or: [{ mobileNumber: emailOrMobile }, { email: emailOrMobile }]
    }).select('password role mobileNumber fullName countryCode isMobileVerified isEmailVerified _id ');
    // console.log(user);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Password-based login
    if (password) {
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid password'
        });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Update login status
      await LoginStatus.findOneAndUpdate(user._id, {
        last_login: new Date(),
        ip_address: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        device: req.headers['user-agent'] || 'Unknown',
      },
      { new: true, runValidators: true }
    );
 
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'Login successful',
        user: {
          fullName: user.fullName,
          mobileNumber: user.mobileNumber,
          countryCode: user.countryCode,
          profilePhoto: user.profilePhoto,
          role: user.role,
          id: user._id
        },
        token
      });
    }

    // OTP-based login
    if (user.isMobileVerified) {
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

      await Otp.findOneAndUpdate(
        { user_id: user._id },
        {
          otp_code: otp,
          expires_at: otpExpiry
        },
        {
          upsert: true, // create if not exists
          new: true,    // return the updated document
          setDefaultsOnInsert: true // apply defaults if creating
        }
      );
      

      try {
        

        const response = await axios.post(`${transportStorageServiceUrl}/sms/sendOTP`, {
          to: `${user.countryCode}${user.mobileNumber}`,
          otp
        });

        if (!response.data.success) {
          return res.status(500).json({
            success: false,
            message: 'Failed to send OTP',
            error: response.data.message || 'OTP service error'
          });
        }

        // Generate temporary token for verification
        const tempToken = jwt.sign(
          { id: user._id, purpose: 'login_verification' },
          process.env.JWT_SECRET,
          { expiresIn: '15m' }
        );

        return res.status(200).json({
          success: true,
          message: 'OTP sent to registered mobile number',
          data: {
            verificationToken: tempToken,
            mobileNumber: user.mobileNumber,
            userId: user._id,
            countryCode: user.countryCode,
            profilePhoto: user.profilePhoto
          }
        });

      } catch (apiError) {
        console.error('OTP sending error:', apiError);
        return res.status(500).json({
          success: false,
          message: 'Failed to send OTP',
          error: apiError.message || 'OTP service unavailable'
        });
      }
    }

    // Email verification case
    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Currently we are not supporting email login with OTP'
      });
    }

    // If no authentication method is available
    return res.status(400).json({
      success: false,
      message: 'No valid authentication method available'
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during login',
      error: error.message
    });
  }
};

// @desc    Register patient (initial step)
// @route   POST /api/v1/auth/register
// @access  Public
exports.registerPatient = async (req, res) => {
  try {
    const { fullName, mobileNumber, email, countryCode, password, role, promoConsent } = req.body;

    // Basic validation
    if (!fullName || !mobileNumber || !countryCode || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, mobile number, country code and password'
      });
    }

    // Check if mobile number already exists
    const existingUser = await User.findOne({ $or: [{email: email}, {$and: [{ mobileNumber }, { countryCode }]}] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number or email already registered'
      });
    }

    // Create user with minimal data
    const user = await User.create({
      fullName,
      mobileNumber,
      countryCode,
      password,
      email,
      ...(role ? { role } : {}),
      ...(promoConsent ? { promoConsent } : {}),
      isMobileVerified: false
    });

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    await Otp.findOneAndUpdate(
      { user_id: user._id },
      {
        otp_code: otp,
        expires_at: otpExpiry
      },
      {
        upsert: true, // create if not exists
        new: true,    // return the updated document
        setDefaultsOnInsert: true // apply defaults if creating
      }
    );
    
    // Send OTP via API request
    try {
      const response = await axios.post(`${transportStorageServiceUrl}/sms/sendOTP`, {
        to: `${countryCode}${mobileNumber}`,
        otp
      });

      // Check if API responded with success
      if (response.data.success !== true) {
        throw new Error(response.data.message || 'Failed to send OTP');
      }
    } catch (apiError) {
      console.error('Error sending OTP:', apiError.message || apiError.response?.data);

      // Rollback user creation if OTP sending fails
      await User.findByIdAndDelete(user._id);

      return res.status(500).json({
        success: false,
        message: 'Registration failed: Unable to send OTP',
        error: apiError.message || 'Unknown error while sending OTP'
      });
    }

    const emailVerifyToken = jwt.sign(
      { id: user._id, email, purpose: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Send email verification request with error handling
    try {
      const response = await axios.post(`${transportStorageServiceUrl}/mail/sendEmailVerification`, {
        fullName: user.fullName,
        email,
        token: emailVerifyToken,
        url: `${process.env.FRONTEND_URL}/users/verify-email`
      });

      // Check if the email service returned success
      if (response.status !== 200) {
        throw new Error(response.data.message || 'Failed to send email verification');
      }
    } catch (apiError) {
      console.error('Error sending email verification:', apiError.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send email verification. Please try again later.',
        error: apiError.message || 'Unknown error'
      });
    }

    

    // Generate temporary token for verification step
    const tempToken = jwt.sign(
      { id: user._id, purpose: 'mobile_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration initiated. OTP sent to mobile.',
      data: {
        verificationToken: tempToken,
        mobileNumber: user.mobileNumber,
        userId: user._id
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};


// @desc    Verify mobile OTP
// @route   POST /api/v1/auth/verify-mobile
// @access  Public
exports.verifyMobileOTP = async (req, res) => {
  try {
    // console.log(req.body);
    const { otp, verificationToken, mobileNumber } = req.body;

    // Validate input
    if (!otp || !verificationToken || !mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'OTP, verification token, and mobile number are required'
      });
    }

    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);

      // Check if token has valid purpose
      if (!['mobile_verification', 'login_verification', 'forgot_password_verification'].includes(decoded.purpose)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token purpose'
        });
      }
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification token',
        error: jwtError.message
      });
    }

    // Find user
    const user = await User.findOne({
      _id: decoded.id,
      mobileNumber
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    console.log(user);
    const otpDetails = await Otp.findOne({ user_id: user._id });

    // Check if OTP matches and is not expired
    if (!otpDetails.otp_code || otpDetails.otp_code !== otp || otpDetails.expires_at < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired OTP'
      });
    }

    // Handle different verification purposes
    if (decoded.purpose === 'mobile_verification') {
      // Mark mobile as verified
      user.isMobileVerified = true;
      await user.save();
      // Update login status
      await LoginStatus.create({
        user_id: user._id,
        last_login: new Date(),
        ip_address: req.ip,
        device: req.headers['user-agent'] || 'Unknown',
        account_status: 'active'
      });
    }
    else if (decoded.purpose === 'forgot_password_verification') {
      await LoginStatus.create({
        user_id: user._id,
        last_login: new Date(),
        ip_address: req.ip,
        device: req.headers['user-agent'] || 'Unknown',
        account_status: 'active'
      });
    }
    // For login_verification, we don't need to change isMobileVerified status

    // Clear OTP after successful verification
    await Otp.findOneAndDelete({ user_id: user._id });

    // Generate proper auth token 
    const authToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );




    // Prepare response data
    const responseData = {
      success: true,
      message: decoded.purpose === 'mobile_verification'
        ? 'Mobile number verified successfully'
        : 'Login verified successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        mobileNumber: user.mobileNumber,
        role: user.role,
        isMobileVerified: user.isMobileVerified,
        countryCode: user.countryCode,
        profilePhoto: user.profilePhoto
      },
      token: authToken
    };

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: error.message
    });
  }
};

exports.verifyEmail = async( req, res ) => {
  try {
    const {email, verificationToken} = req.query;
    if(!email || !verificationToken)
    {
      return res.status(400).send({
        success: false,
        message: 'email or token missing'
      });
    }  
    // Verify the JWT token
    let decoded;
    try {
      decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);

      // Check if token has valid purpose
      if (!["email_verification"].includes(decoded.purpose)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token purpose'
        });
      }
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification token',
        error: jwtError.message
      });
    }

    // Find user
    const user = await User.findOne({
      _id: decoded.id,
      email
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
     // Generate proper auth token 
     const authToken = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );




    // Prepare response data
    const responseData = {
      success: true,
      message: 'Email verified successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        mobileNumber: user.mobileNumber,
        countryCode: user.countryCode,
        isMobileVerified: user.isMobileVerified,
        email: email,
        isEmailVerified: user.isEmailVerified,
        profilePhoto: user.profilePhoto
      },
      token: authToken
    };

    return res.status(200).json(responseData);


  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: error.message
    });
  }
}


exports.resendOTP = async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a mobile number'
      });
    }

    const user = await User.findOne({  mobileNumber });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    // Update OTP
    await Otp.findOneAndUpdate({ user_id: user._id }, { 
      otp_code: otp,
      expires_at: otpExpiry
     });


    // Generate new temporary token
    const tempToken = jwt.sign(
      { id: user._id, purpose: 'mobile_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Send OTP via API request with proper error handling
    try {
      const response = await axios.post(`${transportStorageServiceUrl}/sms/sendOTP`, {
        to: `${user.countryCode}${mobileNumber}`,
        otp
      });

      // Check if the SMS service returned success
      if (response.data.success !== true) {
        throw new Error(response.data.message || 'Failed to resend OTP');
      }
    } catch (apiError) {
      console.error('Error resending OTP:', apiError.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to resend OTP. Please try again later.',
        error: apiError.message || 'Unknown error'
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        verificationToken: tempToken,
        mobileNumber: user.mobileNumber
      }
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP',
      error: error.message
    });
  }
};


exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password ');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error: error.message
    });
  }
};


exports.updateProfile = async (req, res) => {
  try {
    const {
      gender,
      dateOfBirth,
      bloodGroup,
      addressLine1,
      addressLine2,
      city,
      state,
      country,
      pinCode
    } = req.body;

    let profilePhoto = req.body.profilePhoto; 

    // Find user
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Validate Date of Birth
    if (dateOfBirth && new Date(dateOfBirth) >= new Date()) {
      return res.status(400).json({ success: false, message: 'Date of birth must be in the past' });
    }

    // ✅ **Check if files exist before processing**
    if (req.file && req.file.profilePicture ) {
      try {
        const formData = new FormData();

        // 🟢 **Check if profilePhoto is a single file**
        if (req.file.profilePicture) {
          const profileFile = Array.isArray(req.file.profilePicture)
            ? req.file.profilePicture[0]
            : req.file.profilePicture; // Ensure it's an object

          formData.append('file', profileFile.data, profileFile.name);
        }

        // 🟢 **Upload files to Storage Service**
        const uploadResponse = await axios.post(
          `${transportStorageServiceUrl}/storage/upload`,
          formData,
          { headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${req.token}` } }
        );

        if (uploadResponse.data.url) {
          profilePhoto = uploadResponse.data.url;
        }
      } catch (error) {
        console.error('File upload error:', error);
        return res.status(500).json({
          success: false,
          message: 'File upload failed',
          error: error.response ? error.response.data : error.message
        });
      }
    }

    // Prepare update object
    const updates = {};

    // Add fields to update
    if (gender && ['male', 'female', 'other', 'prefer not to say'].includes(gender)) {
      updates.gender = gender;
    }
    if (dateOfBirth) updates.dateOfBirth = new Date(dateOfBirth);
    if (bloodGroup && ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(bloodGroup)) {
      updates.bloodGroup = bloodGroup;
    }
    if (profilePhoto) updates.profilePhoto = profilePhoto;

    if (addressLine1) updates.addressLine1 = addressLine1;
    if (addressLine2) updates.addressLine2 = addressLine2;
    if (city) updates.city = city;
    if (state) updates.state = state;
    if (country) updates.country = country;
    if (pinCode) updates.pinCode = pinCode;

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password -otp');

    res.status(200).json({ success: true, message: 'Profile updated successfully', data: updatedUser });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Failed to update profile', error: error.message });
  }
};

exports.updateEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email'
      });
    }

    // Check if email already exists
    // const existingUser = await User.findOne({ email });
    // if (existingUser && existingUser._id.toString() !== req.user.id) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Email already in use'
    //   });
    // }

    // Update user with new email (unverified)
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        email: email.toLowerCase(),
        isEmailVerified: false
      },
      { new: true }
    ).select('-password -otp');

    // Send email verification request
    // Generate email verification token
    const emailVerifyToken = jwt.sign(
      { id: user._id, email, purpose: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Send email verification request with error handling
    try {
      const response = await axios.post(`${transportStorageServiceUrl}/mail/sendEmailVerification`, {
        fullName: user.fullName,
        email,
        token: emailVerifyToken,
        url: `${process.env.USER_MANAGEMENT_SERVICE_URL}/users/verify-email`
      });

      // Check if the email service returned success
      if (response.status !== 200) {
        throw new Error(response.data.message || 'Failed to send email verification');
      }
    } catch (apiError) {
      console.error('Error sending email verification:', apiError.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send email verification. Please try again later.',
        error: apiError.message || 'Unknown error'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Email verification sent successfully',
      data: { email, userId: user._id }
    });

  } catch (error) {
    console.error('Error sending email verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email verification',
      error: error.message
    });
  }
};


exports.sendEmailVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate email verification token
    const token = jwt.sign(
      { id: user._id, email, purpose: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Send email verification request with error handling
    try {
      const response = await axios.post(`${transportStorageServiceUrl}/mail/sendEmailVerification`, {
        fullName: user.fullName,
        email,
        token,
        url: `${process.env.USER_MANAGEMENT_SERVICE_URL}/users/verify-email`
      });

      // Check if the email service returned success
      if (response.data.success !== true) {
        throw new Error(response.data.message || 'Failed to send email verification');
      }
    } catch (apiError) {
      console.error('Error sending email verification:', apiError.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send email verification. Please try again later.',
        error: apiError.message || 'Unknown error'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Email verification sent successfully',
      data: { email, userId: user._id }
    });

  } catch (error) {
    console.error('Error sending email verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send email verification',
      error: error.message
    });
  }
};




// @desc    Verify email
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({ message: 'Invalid request' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.email !== email) {
      return res.status(401).json({ message: 'Token does not match email' });
    }

    // Update user status in the database
    await User.updateOne({ email }, { isEmailVerified: true });

    res.status(200).send('<h1>Email Verified Successfully!</h1>');
  } catch (error) {
    console.error('Verification error:', error);
    res.status(400).send('<h1>Invalid or Expired Token</h1>');
  }
};


exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Find user by ID
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if current password is correct
    if (!await bcrypt.compare(currentPassword, user.password)) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect current password'
      }); 
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update password',
      error: error.message
    });
  }
};



exports.forgotPassword = async (req, res) => {
  try {
    const { mobileNumber } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a mobile number'
      });
    }

    const user = await User.findOne({ mobileNumber });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    if(!user.isMobileVerified){
      return res.status(400).json({
        success: false,
        message: 'Mobile number is not verified'
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    // Update OTP
    await Otp.findOneAndUpdate({ user_id: user._id }, { 
      otp_code: otp,
      expires_at: otpExpiry
     }, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
     });

     const forgotPasswordVerifyToken = jwt.sign(
      { id: user._id, mobile: user.mobileNumber, purpose: 'forgot_password_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

     // Send OTP via API request with error handling
     try {
      const response = await axios.post(`${transportStorageServiceUrl}/sms/sendOTP`, {
        to: `${user.countryCode}${mobileNumber}`,
        otp
      });

      if (response.data.success !== true) {
        throw new Error(response.data.message || 'Failed to send OTP');
      }
    } catch (apiError) {
      console.error('Error sending OTP:', apiError.response?.data || apiError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP',
        error: apiError.message || 'Unknown error'
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent to mobile number',
      data: {
        mobileNumber: user.mobileNumber,
        userId: user._id,
        verificationToken: forgotPasswordVerifyToken
      }
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message
    });
  }
};


exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token purpose'
      });
    }
    
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    });
  }
};




    