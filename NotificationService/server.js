const express = require('express');
const app = express();
const connectDB = require('./config/db');
require("dotenv").config();
const { google } = require('googleapis');
const { startNotificationListener } = require("./controller/NotificationController");
const { initAppointmentNotificationService } = require("./services/appointmentNotificationService");
const { initNotificationMonitorService } = require("./services/notificationMonitorService");
const Notification = require("./models/Notification");
const meetingRoutes = require('./route/meetingRoutes');
const webNotificationRoutes = require('./route/webNotificationRoutes');
const schedulerService = require('./services/SchedulerService');

app.use(express.json());

// Set up Google OAuth client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Google Auth routes
app.get('/auth/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar'
    ],
    prompt: 'consent' // Always prompt for consent to ensure we get a refresh token
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('Access Token:', tokens.access_token);
    console.log('Refresh Token:', tokens.refresh_token);
    
    // Store these tokens securely
    oauth2Client.setCredentials(tokens);
    
    // You should store the refresh token with the doctor's profile
    // This is just placeholder code - implement your token storage logic
    res.send('Authentication successful! Your calendar is now connected. You can close this window.');
  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// API Routes
app.use('/api/meetings', meetingRoutes);

// Create notification endpoint
app.post("/notifications", async(req, res) => {
  try {
    const {user, message, referenceId, type} = req.body;
    const notification = await Notification.create({
      user, 
      message, 
      referenceId, 
      type,
      status: "pending" 
    });
    res.status(201).send({success: true, message: "Notification created.", notification});
  } catch (error) {
    console.log("Error in the create notification: ", error);
    res.status(500).send({success: false, message: "Internal server error."});
  }
});

app.use('/web-notifications', webNotificationRoutes);



// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send({
    status: 'ok',
    message: 'Server is running properly',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);
  
  // Connect to MongoDB
  await connectDB();
  
  // Start notification listeners and services
  startNotificationListener();
  initNotificationMonitorService(); // Initialize the new notification monitor service
  initAppointmentNotificationService();
  schedulerService.scheduleDailyCleanup(2, 0); // Schedule daily cleanup at 2 AM
  
  console.log(`✅ All services initialized successfully!`);
});