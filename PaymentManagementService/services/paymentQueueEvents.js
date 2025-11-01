// services/paymentQueueEvents.js
const { paymentNotificationQueue } = require('./paymentNotificationService');

// Listen for completed payment notification jobs
paymentNotificationQueue.on('completed', (job, result) => {
  console.log(`Payment notification job ${job.id} completed successfully`);
  console.log('Payment notifications sent for payment:', result.paymentId);
});

// Listen for failed payment notification jobs
paymentNotificationQueue.on('failed', (job, error) => {
  console.error(`Payment notification job ${job.id} failed:`, error);
});

// Listen for progress
paymentNotificationQueue.on('progress', (job, progress) => {
  console.log(`Payment notification job ${job.id} progress: ${progress}%`);
});

module.exports = paymentNotificationQueue;