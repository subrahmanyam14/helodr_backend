// services/SchedulerService.js
// ============================================
const cron = require('node-cron');
const webNotificationService = require('./webNotificationService');

class SchedulerService {
  constructor() {
    this.jobs = [];
  }

  // Schedule daily cleanup at midnight (00:00)
  scheduleDailyCleanup() {
    // Run at 00:00 every day
    const job = cron.schedule('0 0 * * *', async () => {
      console.log('Running daily cleanup of read notifications...');
      try {
        const deletedCount = await webNotificationService.deleteAllReadNotifications();
        console.log(`Daily cleanup completed. Deleted ${deletedCount} read notifications.`);
      } catch (error) {
        console.error('Daily cleanup failed:', error);
      }
    });

    this.jobs.push(job);
    console.log('Daily cleanup scheduler started (runs at midnight)');
  }

  // Alternative: Schedule cleanup at specific time (e.g., 2 AM)
  scheduleCustomTimeCleanup(hour = 2, minute = 0) {
    const job = cron.schedule(`${minute} ${hour} * * *`, async () => {
      console.log(`Running scheduled cleanup at ${hour}:${minute}...`);
      try {
        const deletedCount = await webNotificationService.deleteAllReadNotifications();
        console.log(`Cleanup completed. Deleted ${deletedCount} read notifications.`);
      } catch (error) {
        console.error('Scheduled cleanup failed:', error);
      }
    });

    this.jobs.push(job);
    console.log(`Scheduled cleanup set for ${hour}:${minute} daily`);
  }

  // Stop all scheduled jobs
  stopAll() {
    this.jobs.forEach(job => job.stop());
    console.log('All scheduled jobs stopped');
  }

  // Start all scheduled jobs
  startAll() {
    this.jobs.forEach(job => job.start());
    console.log('All scheduled jobs started');
  }
}

const schedulerService = new SchedulerService();
module.exports = schedulerService;
