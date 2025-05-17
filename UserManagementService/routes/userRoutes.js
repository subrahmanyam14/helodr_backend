const { protect } = require('../middleware/authMiddleware');
const express = require('express');
const userRouter = express.Router();
const userController = require('../controllers/userController');
const healthAndLoginStatusController = require('../controllers/healthAndLoginStatusController');
const configureFileUpload = require('../middleware/fileUploadMiddleware');
// Public routes
userRouter.post('/login', userController.login);
userRouter.post('/register', userController.registerPatient);
userRouter.post('/verify-mobile', userController.verifyMobileOTP);
userRouter.post('/resend-otp', userController.resendOTP);
userRouter.get('/verify-email', userController.verifyEmail);
userRouter.post('/forgot-password', userController.forgotPassword);
userRouter.post('/resend-verification-email',userController.sendEmailVerification);

// Protected routes (require authentication)
userRouter.use(protect); // All routes below this will use the protect middleware
userRouter.get('/me', userController.getMe);
userRouter.put('/me', configureFileUpload('profilePicture'), userController.updateProfile);
// userRouter.post('/sendEmailVerification', userController.updateEmail);

userRouter.post('/reset-password', userController.resetPassword);
userRouter.get('/get-health-records', healthAndLoginStatusController.getHealthRecords);
userRouter.post('/upload-health-record', healthAndLoginStatusController.uploadHealthRecord);
userRouter.delete('/delete-health-record/:record_id', healthAndLoginStatusController.deleteHealthRecord);
userRouter.put('/update-health-record/:record_id', healthAndLoginStatusController.updateHealthRecord);
userRouter.get('/get-login-status', healthAndLoginStatusController.getLoginStatus);

module.exports = userRouter;