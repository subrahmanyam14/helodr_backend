// services/paymentNotificationService.js
const Queue = require('bull');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const WebNotification = require('../models/WebNotification');
const Transaction = require('../models/Transaction');

// Create payment notification queue
const paymentNotificationQueue = new Queue('payment notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Process payment notification jobs
paymentNotificationQueue.process(async (job) => {
  try {
    const { paymentData, transactionData, appointmentData } = job.data;
    
    // Fetch all required user IDs
    const userData = await fetchUserDataForPayment(
      paymentData.patientId, 
      paymentData.doctorId
    );
    
    // Generate and send payment notifications
    await sendPaymentNotifications(userData, paymentData, transactionData);
    
    // Generate and send appointment confirmation notifications
    await sendAppointmentConfirmationNotifications(userData, appointmentData, paymentData);
    
    return { 
      success: true, 
      paymentId: paymentData.paymentId,
      appointmentId: appointmentData.appointmentId
    };
  } catch (error) {
    console.error('Error processing payment notification queue:', error);
    throw error;
  }
});

// Fetch user data for payment notifications
async function fetchUserDataForPayment(patientId, doctorId) {
  try {
    // Fetch patient
    const patient = await User.findById(patientId);
    if (!patient) throw new Error('Patient not found');
    
    // Fetch doctor with user data
    const doctor = await Doctor.findById(doctorId).populate('user');
    if (!doctor) throw new Error('Doctor not found');
    
    // Fetch hospital admin (assuming first hospital affiliation)
    let hospitalAdmin = null;
    if (doctor.hospitalAffiliations && doctor.hospitalAffiliations.length > 0) {
      const hospital = await Hospital.findById(doctor.hospitalAffiliations[0].hospital);
      if (hospital && hospital.addedBy) {
        hospitalAdmin = await User.findById(hospital.addedBy);
      }
    }
    
    // Fetch platform admin (user with admin role)
    const platformAdmin = await User.findOne({ role: 'admin' });
    
    return {
      patient: {
        userId: patient._id.toString(),
        name: patient.fullName
      },
      doctor: {
        userId: doctor.user._id.toString(),
        name: doctor.fullName,
        doctorData: doctor
      },
      hospitalAdmin: hospitalAdmin ? {
        userId: hospitalAdmin._id.toString(),
        name: hospitalAdmin.fullName
      } : null,
      platformAdmin: platformAdmin ? {
        userId: platformAdmin._id.toString(),
        name: platformAdmin.fullName
      } : null
    };
  } catch (error) {
    console.error('Error fetching user data for payment:', error);
    throw error;
  }
}

// Send payment notifications to all parties
async function sendPaymentNotifications(userData, paymentData, transactionData) {
  const notifications = [];
  
  // Patient payment notification
  notifications.push(createNotificationPayload(
    userData.patient.userId,
    'Payment Completed',
    `Payment completed successfully. Transaction ID: ${transactionData.transactionId}, Amount: ₹${paymentData.totalAmount}`,
    'success'
  ));
  
  // Doctor payment notification
  notifications.push(createNotificationPayload(
    userData.doctor.userId,
    'Payment Credited',
    `Payment has been credited. Transaction ID: ${transactionData.transactionId}, Amount: ₹${paymentData.totalAmount}`,
    'success'
  ));
  
  // Hospital admin payment notification (if exists)
  if (userData.hospitalAdmin) {
    notifications.push(createNotificationPayload(
      userData.hospitalAdmin.userId,
      'Payment Credited',
      `Payment has been credited. Transaction ID: ${transactionData.transactionId}, Amount: ₹${paymentData.totalAmount}`,
      'info'
    ));
  }
  
  // Platform admin payment notification
  if (userData.platformAdmin) {
    notifications.push(createNotificationPayload(
      userData.platformAdmin.userId,
      'Payment Credited',
      `Payment has been credited. Transaction ID: ${transactionData.transactionId}, Amount: ₹${paymentData.totalAmount}`,
      'info'
    ));
  }
  
  // Save all payment notifications to database
  try {
    await WebNotification.insertMany(notifications);
    console.log(`Sent ${notifications.length} payment notifications for transaction ${transactionData.transactionId}`);
  } catch (error) {
    console.error('Error saving payment notifications:', error);
    throw error;
  }
}

// Send appointment confirmation notifications to all parties
async function sendAppointmentConfirmationNotifications(userData, appointmentData, paymentData) {
  const notifications = [];
  
  // Format appointment date for display
  const appointmentDate = new Date(appointmentData.date);
  const formattedDate = appointmentDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const formattedTime = appointmentData.slot ? `${appointmentData.slot.startTime} - ${appointmentData.slot.endTime}` : 'Scheduled time';
  
  // Patient appointment confirmation notification
  notifications.push(createNotificationPayload(
    userData.patient.userId,
    'Appointment Confirmed! 🎉',
    `Your ${appointmentData.type} appointment with Dr. ${userData.doctor.name} is confirmed for ${formattedDate} at ${formattedTime}.`,
    'success'
  ));
  
  // Doctor appointment confirmation notification
  notifications.push(createNotificationPayload(
    userData.doctor.userId,
    'New Appointment Booked',
    `You have a new ${appointmentData.type} appointment with ${userData.patient.name} on ${formattedDate} at ${formattedTime}.`,
    'info'
  ));
  
  // Hospital admin appointment notification (if exists)
  if (userData.hospitalAdmin) {
    notifications.push(createNotificationPayload(
      userData.hospitalAdmin.userId,
      'New Appointment Booking',
      `New ${appointmentData.type} appointment booked: ${userData.patient.name} with Dr. ${userData.doctor.name} on ${formattedDate}.`,
      'info'
    ));
  }
  
  // Platform admin appointment notification
  if (userData.platformAdmin) {
    notifications.push(createNotificationPayload(
      userData.platformAdmin.userId,
      'New Appointment Booking',
      `New appointment confirmed: ${userData.patient.name} with Dr. ${userData.doctor.name}. Payment: ₹${paymentData.totalAmount}`,
      'info'
    ));
  }
  
  // Save all appointment notifications to database
  try {
    await WebNotification.insertMany(notifications);
    console.log(`Sent ${notifications.length} appointment confirmation notifications for appointment ${appointmentData.appointmentId}`);
  } catch (error) {
    console.error('Error saving appointment notifications:', error);
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

// Add payment notification job to queue
async function queuePaymentNotification(paymentData, transactionData, appointmentData = null) {
  return await paymentNotificationQueue.add({
    paymentData,
    transactionData,
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

module.exports = {
  paymentNotificationQueue,
  queuePaymentNotification,
  fetchUserDataForPayment,
  sendPaymentNotifications,
  sendAppointmentConfirmationNotifications
};