// services/walletCreditNotificationService.js
const Queue = require('bull');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const WebNotification = require('../models/WebNotification');

// Create wallet credit notification queue
const walletCreditNotificationQueue = new Queue('wallet credit notifications', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  }
});

// Process wallet credit notification jobs
walletCreditNotificationQueue.process(async (job) => {
  try {
    const { notificationType, walletData, earningData, upcomingEarningData } = job.data;
    
    switch (notificationType) {
      case 'wallet_credit':
        await sendWalletCreditNotifications(walletData, earningData);
        break;
      case 'upcoming_earning_created':
        await sendUpcomingEarningCreatedNotifications(upcomingEarningData);
        break;
      default:
        console.warn(`Unknown notification type: ${notificationType}`);
    }
    
    return { 
      success: true, 
      notificationType,
      doctorId: walletData?.doctorId || upcomingEarningData?.doctorId
    };
  } catch (error) {
    console.error('Error processing wallet credit notification queue:', error);
    throw error;
  }
});

// Send wallet credit notifications to doctor only
async function sendWalletCreditNotifications(walletData, earningData) {
  const notifications = [];
  
  // Doctor wallet credit notification
  notifications.push(createNotificationPayload(
    walletData.doctorUserId,
    'Payment Credited to Wallet 💰',
    `₹${earningData.amount} has been credited to your wallet for the completed appointment with ${earningData.patientName}. Your current wallet balance is ₹${walletData.currentBalance}.`,
    'success'
  ));
  
  // Save wallet credit notifications to database
  try {
    await WebNotification.insertMany(notifications);
    console.log(`Sent wallet credit notification to doctor ${walletData.doctorId} for amount ₹${earningData.amount}`);
  } catch (error) {
    console.error('Error saving wallet credit notifications:', error);
    throw error;
  }
}

// Send upcoming earning created notifications to doctor only
async function sendUpcomingEarningCreatedNotifications(upcomingEarningData) {
  const notifications = [];
  
  // Doctor upcoming earning notification
  notifications.push(createNotificationPayload(
    upcomingEarningData.doctorUserId,
    'Payment Processing ⏳',
    `₹${upcomingEarningData.amount} is being processed for your appointment with ${upcomingEarningData.patientName}. It will be credited to your wallet after appointment completion.`,
    'info'
  ));
  
  // Save upcoming earning notifications to database
  try {
    await WebNotification.insertMany(notifications);
    console.log(`Sent upcoming earning notification to doctor ${upcomingEarningData.doctorId} for amount ₹${upcomingEarningData.amount}`);
  } catch (error) {
    console.error('Error saving upcoming earning notifications:', error);
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

// Add wallet credit notification job to queue
async function queueWalletCreditNotification(walletData, earningData) {
  return await walletCreditNotificationQueue.add({
    notificationType: 'wallet_credit',
    walletData,
    earningData
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    timeout: 30000
  });
}

// Add upcoming earning created notification job to queue
async function queueUpcomingEarningCreatedNotification(upcomingEarningData) {
  return await walletCreditNotificationQueue.add({
    notificationType: 'upcoming_earning_created',
    upcomingEarningData
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    timeout: 30000
  });
}

// Direct notification functions (without queue)
async function sendWalletCreditNotificationDirectly(walletData, earningData) {
  try {
    await sendWalletCreditNotifications(walletData, earningData);
    return { success: true, processedDirectly: true };
  } catch (error) {
    console.error('Error in direct wallet credit notification:', error);
    throw error;
  }
}

async function sendUpcomingEarningCreatedNotificationDirectly(upcomingEarningData) {
  try {
    await sendUpcomingEarningCreatedNotifications(upcomingEarningData);
    return { success: true, processedDirectly: true };
  } catch (error) {
    console.error('Error in direct upcoming earning notification:', error);
    throw error;
  }
}

module.exports = {
  walletCreditNotificationQueue,
  queueWalletCreditNotification,
  queueUpcomingEarningCreatedNotification,
  sendWalletCreditNotificationDirectly,
  sendUpcomingEarningCreatedNotificationDirectly,
  sendWalletCreditNotifications,
  sendUpcomingEarningCreatedNotifications
};