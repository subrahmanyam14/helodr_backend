// services/prescriptionQueueEvents.js
const { prescriptionNotificationQueue } = require('./prescriptionNotificationService');

// Listen for completed prescription notification jobs
prescriptionNotificationQueue.on('completed', (job, result) => {
  console.log(`Prescription notification job ${job.id} completed successfully`);
  console.log('Prescription notification sent for appointment:', result.appointmentId);
});

// Listen for failed prescription notification jobs
prescriptionNotificationQueue.on('failed', (job, error) => {
  console.error(`Prescription notification job ${job.id} failed:`, error);
});

// Listen for progress
prescriptionNotificationQueue.on('progress', (job, progress) => {
  console.log(`Prescription notification job ${job.id} progress: ${progress}%`);
});

module.exports = prescriptionNotificationQueue;