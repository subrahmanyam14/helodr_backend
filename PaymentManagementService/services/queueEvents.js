// services/queueEvents.js
const { appointmentQueue } = require('./queueService');

// Listen for completed jobs
appointmentQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed successfully`);
  console.log('Appointment created:', result.appointmentId);
});

// Listen for failed jobs
appointmentQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed:`, error);
});

// Listen for progress
appointmentQueue.on('progress', (job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});

module.exports = appointmentQueue;