// services/appointmentCompletionQueueEvents.js
const { appointmentCompletionQueue } = require('./appointmentCompletionNotificationService');

// Listen for completed appointment completion notification jobs
appointmentCompletionQueue.on('completed', (job, result) => {
  console.log(`Appointment completion notification job ${job.id} completed successfully`);
  console.log('Appointment completion notifications sent for appointment:', result.appointmentId);
});

// Listen for failed appointment completion notification jobs
appointmentCompletionQueue.on('failed', (job, error) => {
  console.error(`Appointment completion notification job ${job.id} failed:`, error);
});

// Listen for progress
appointmentCompletionQueue.on('progress', (job, progress) => {
  console.log(`Appointment completion notification job ${job.id} progress: ${progress}%`);
});

module.exports = appointmentCompletionQueue;