// services/queueService.js
const Queue = require('bull');
const Appointment = require('../models/Appointment');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const WebNotification = require('../models/WebNotification');
const Cluster = require('../models/Cluster');

// Create queue
const appointmentQueue = new Queue('appointment notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Process queue jobs
appointmentQueue.process(async (job) => {
  try {
    const { patientId, doctorId, appointmentData, paymentData } = job.data;
    
    // Fetch all required user IDs
    const userData = await fetchUserData(patientId, doctorId);
    
    // Create appointment in database
    const appointment = await createAppointment(patientId, doctorId, appointmentData, paymentData);
    
    // Generate and send notifications
    await sendNotifications(userData, appointment);
    
    return { success: true, appointmentId: appointment._id };
  } catch (error) {
    console.error('Error processing appointment queue:', error);
    throw error;
  }
});

// Fetch user data for all parties
async function fetchUserData(patientId, doctorId) {
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
        name: doctor.fullName
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
    console.error('Error fetching user data:', error);
    throw error;
  }
}

// Create appointment in database
async function createAppointment(patientId, doctorId, appointmentData, paymentData) {
  try {
    const appointment = new Appointment({
      patient: patientId,
      doctor: doctorId,
      ...appointmentData,
      payment: paymentData.paymentId,
      status: 'confirmed'
    });
    
    return await appointment.save();
  } catch (error) {
    console.error('Error creating appointment:', error);
    throw error;
  }
}

// Send notifications to all parties
async function sendNotifications(userData, appointment) {
  const notifications = [];
  
  // Patient notification
  notifications.push(createNotificationPayload(
    userData.patient.userId,
    'Appointment Confirmed',
    `Your appointment with Dr. ${userData.doctor.name} has been confirmed for ${new Date(appointment.date).toLocaleDateString()} at ${appointment.slot.startTime}.`,
    'success'
  ));
  
  // Doctor notification
  notifications.push(createNotificationPayload(
    userData.doctor.userId,
    'New Appointment Booking',
    `You have a new appointment with ${userData.patient.name} on ${new Date(appointment.date).toLocaleDateString()} at ${appointment.slot.startTime}.`,
    'info'
  ));
  
  // Hospital admin notification (if exists)
  if (userData.hospitalAdmin) {
    notifications.push(createNotificationPayload(
      userData.hospitalAdmin.userId,
      'New Appointment Booked',
      `New appointment booked with Dr. ${userData.doctor.name} for ${userData.patient.name}.`,
      'info'
    ));
  }
  
  // Platform admin notification
  if (userData.platformAdmin) {
    notifications.push(createNotificationPayload(
      userData.platformAdmin.userId,
      'Appointment Booking Completed',
      `Appointment booked: ${userData.patient.name} with Dr. ${userData.doctor.name}. Payment completed successfully.`,
      'info'
    ));
  }
  
  // Save all notifications to database
  try {
    await WebNotification.insertMany(notifications);
    console.log(`Sent ${notifications.length} notifications for appointment ${appointment._id}`);
  } catch (error) {
    console.error('Error saving notifications:', error);
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

// Add job to queue
async function queueAppointmentNotification(patientId, doctorId, appointmentData, paymentData) {
  return await appointmentQueue.add({
    patientId,
    doctorId,
    appointmentData,
    paymentData
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
  appointmentQueue,
  queueAppointmentNotification,
  fetchUserData,
  createAppointment,
  sendNotifications
};