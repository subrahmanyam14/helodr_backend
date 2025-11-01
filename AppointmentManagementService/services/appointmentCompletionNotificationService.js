// services/appointmentCompletionNotificationService.js
const Queue = require('bull');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const WebNotification = require('../models/WebNotification');

// Create appointment completion notification queue
const appointmentCompletionQueue = new Queue('appointment completion notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Process appointment completion notification jobs
appointmentCompletionQueue.process(async (job) => {
  try {
    const { appointmentData, completionData } = job.data;
    
    // Fetch all required user IDs
    const userData = await fetchUserDataForAppointmentCompletion(
      appointmentData.patientId, 
      appointmentData.doctorId
    );
    
    // Generate and send appointment completion notifications
    await sendAppointmentCompletionNotifications(userData, appointmentData, completionData);
    
    return { 
      success: true, 
      appointmentId: appointmentData.appointmentId
    };
  } catch (error) {
    console.error('Error processing appointment completion notification queue:', error);
    throw error;
  }
});

// Fetch user data for appointment completion notifications
async function fetchUserDataForAppointmentCompletion(patientId, doctorId) {
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
    console.error('Error fetching user data for appointment completion:', error);
    throw error;
  }
}

// Send appointment completion notifications to all parties
async function sendAppointmentCompletionNotifications(userData, appointmentData, completionData) {
  const notifications = [];
  
  // Format appointment date for display
  const appointmentDate = new Date(appointmentData.date);
  const formattedDate = appointmentDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  // Patient appointment completion notification
  notifications.push(createNotificationPayload(
    userData.patient.userId,
    'Appointment Completed Successfully! ✅',
    `Your ${appointmentData.type} appointment with Dr. ${userData.doctor.name} has been successfully completed on ${formattedDate}. Thank you for choosing our service!`,
    'success'
  ));
  
  // Doctor appointment completion notification
  notifications.push(createNotificationPayload(
    userData.doctor.userId,
    'Appointment Completed',
    `Your ${appointmentData.type} appointment with ${userData.patient.name} has been marked as completed on ${formattedDate}. Payment processing has been initiated.`,
    'success'
  ));
  
  // Hospital admin appointment completion notification (if exists)
  if (userData.hospitalAdmin) {
    notifications.push(createNotificationPayload(
      userData.hospitalAdmin.userId,
      'Appointment Completed',
      `Appointment completed: ${userData.patient.name} with Dr. ${userData.doctor.name} on ${formattedDate}.`,
      'info'
    ));
  }
  
  // Platform admin appointment completion notification
  if (userData.platformAdmin) {
    notifications.push(createNotificationPayload(
      userData.platformAdmin.userId,
      'Appointment Completed',
      `Appointment completed: ${userData.patient.name} with Dr. ${userData.doctor.name}. Status: ${completionData.status}`,
      'info'
    ));
  }
  
  // Save all appointment completion notifications to database
  try {
    await WebNotification.insertMany(notifications);
    console.log(`Sent ${notifications.length} appointment completion notifications for appointment ${appointmentData.appointmentId}`);
  } catch (error) {
    console.error('Error saving appointment completion notifications:', error);
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

// Add appointment completion notification job to queue
async function queueAppointmentCompletionNotification(appointmentData, completionData = null) {
  return await appointmentCompletionQueue.add({
    appointmentData,
    completionData
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
async function sendAppointmentCompletionNotificationsDirectly(appointmentData, completionData = null) {
  try {
    const userData = await fetchUserDataForAppointmentCompletion(
      appointmentData.patientId, 
      appointmentData.doctorId
    );
    
    await sendAppointmentCompletionNotifications(userData, appointmentData, completionData);
    return { success: true, processedDirectly: true };
  } catch (error) {
    console.error('Error in direct appointment completion notification:', error);
    throw error;
  }
}

module.exports = {
  appointmentCompletionQueue,
  queueAppointmentCompletionNotification,
  sendAppointmentCompletionNotificationsDirectly,
  fetchUserDataForAppointmentCompletion,
  sendAppointmentCompletionNotifications
};