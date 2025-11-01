// services/walletCreditQueueEvents.js
const { walletCreditNotificationQueue } = require('./walletCreditNotificationService');

// Listen for completed wallet credit notification jobs
walletCreditNotificationQueue.on('completed', (job, result) => {
  console.log(`Wallet credit notification job ${job.id} completed successfully`);
  console.log(`Wallet credit notification sent to doctor ${result.doctorId} for ₹${result.amount}`);
});

// Listen for failed wallet credit notification jobs
walletCreditNotificationQueue.on('failed', (job, error) => {
  console.error(`Wallet credit notification job ${job.id} failed:`, error);
});

// Listen for progress
walletCreditNotificationQueue.on('progress', (job, progress) => {
  console.log(`Wallet credit notification job ${job.id} progress: ${progress}%`);
});

module.exports = walletCreditQueueEvents;