// In a separate file like 'appointmentCleanup.js'
const cron = require('node-cron');
const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');

// Schedule to run every minute
cron.schedule('* * * * *', async () => {
  try {
    console.log('Running appointment cleanup job');
    
    // Calculate the cutoff time (10 minutes ago)
    const cutoffTime = new Date(Date.now() - 10 * 60 * 1000);
    
    // Find all pending appointments older than the cutoff time
    const pendingAppointments = await Appointment.find({
      status: 'pending',
      createdAt: { $lt: cutoffTime }
    });
    
    console.log(`Found ${pendingAppointments.length} expired pending appointments`);
    
    // Process each expired appointment
    for (const appointment of pendingAppointments) {
      try {
        // Delete the appointment
        await Appointment.findByIdAndDelete(appointment._id);
        
        // Find and update the availability
        const availability = await Availability.findOne({ doctor: appointment.doctor });
        if (availability) {
          // Remove the booked slot
          availability.bookedSlots = availability.bookedSlots.filter(slot => 
            !slot.appointmentId.equals(appointment._id)
          );
          
          await availability.save();
          console.log(`Cleaned up expired appointment ${appointment._id}`);
        }
      } catch (error) {
        console.error(`Error processing appointment ${appointment._id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in appointment cleanup job:', error);
  }
});


module.exports = {
  startCleanupJob: () => {
    console.log('Appointment cleanup job scheduled');
  }
};
