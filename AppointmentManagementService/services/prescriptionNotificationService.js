// services/prescriptionNotificationService.js
const Queue = require('bull');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const WebNotification = require('../models/WebNotification');

// Create prescription notification queue
const prescriptionNotificationQueue = new Queue('prescription notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Process prescription notification jobs
prescriptionNotificationQueue.process(async (job) => {
  try {
    const { prescriptionData, appointmentData } = job.data;
    
    // Generate and send prescription notifications
    await sendPrescriptionNotifications(prescriptionData, appointmentData);
    
    return { 
      success: true, 
      appointmentId: appointmentData.appointmentId,
      patientId: appointmentData.patientId
    };
  } catch (error) {
    console.error('Error processing prescription notification queue:', error);
    throw error;
  }
});

// Send prescription notifications to patient only
async function sendPrescriptionNotifications(prescriptionData, appointmentData) {
  const notifications = [];
  
  // Format follow-up date if exists
  let followUpInfo = '';
  if (prescriptionData.followUpDate) {
    const followUpDate = new Date(prescriptionData.followUpDate);
    const formattedFollowUpDate = followUpDate.toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    followUpInfo = ` Follow-up scheduled for ${formattedFollowUpDate}.`;
  }
  
  // Count medicines and tests
  const medicinesCount = prescriptionData.medicines ? prescriptionData.medicines.length : 0;
  const testsCount = prescriptionData.tests ? prescriptionData.tests.length : 0;
  
  // Patient prescription notification
  notifications.push(createNotificationPayload(
    appointmentData.patientId,
    'Prescription Added 📝',
    `Your prescription has been added by Dr. ${appointmentData.doctorName}. ${medicinesCount} medicine(s) prescribed.${testsCount > 0 ? ` ${testsCount} test(s) recommended.` : ''}${followUpInfo}`,
    'info'
  ));
  
  // Save prescription notifications to database
  try {
    await WebNotification.insertMany(notifications);
    console.log(`Sent prescription notification to patient for appointment ${appointmentData.appointmentId}`);
  } catch (error) {
    console.error('Error saving prescription notifications:', error);
    throw error;
  }
}

// Create notification payload
function createNotificationPayload(userId, title, message, type = 'info') {
  return {
    userId,
    title,
    message,
    type
  };
}

// Add prescription notification job to queue
async function queuePrescriptionNotification(prescriptionData, appointmentData) {
  return await prescriptionNotificationQueue.add({
    prescriptionData,
    appointmentData
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    timeout: 30000
  });
}

// Direct notification function (without queue)
async function sendPrescriptionNotificationDirectly(prescriptionData, appointmentData) {
  try {
    await sendPrescriptionNotifications(prescriptionData, appointmentData);
    return { success: true, processedDirectly: true };
  } catch (error) {
    console.error('Error in direct prescription notification:', error);
    throw error;
  }
}

module.exports = {
  prescriptionNotificationQueue,
  queuePrescriptionNotification,
  sendPrescriptionNotificationDirectly,
  sendPrescriptionNotifications
};