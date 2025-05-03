const Appointment = require("../models/Appointment.js");

async function updateAppointmentStatusAndSendMessages() {
    try {
      const currentTime = new Date();
      console.log(`Running appointment status update check at ${currentTime}`);
      
      // Update confirmed appointments to completed after they're done + 1 hour
      const confirmedAppointments = await Appointment.find({
        status: 'confirmed'
      });
      
      for (const appointment of confirmedAppointments) {
        const appointmentDate = new Date(appointment.date);
        const [endHours, endMinutes] = appointment.slot.endTime.split(':').map(Number);
        
        // Set the end time of the appointment
        const appointmentEndTime = new Date(appointmentDate);
        appointmentEndTime.setHours(endHours, endMinutes, 0, 0);
        
        let updatedAppointment = null;
        // If appointment end time + 1 hour has passed
        if (currentTime > new Date(appointmentEndTime.getTime() + 60 * 60 * 1000)) {
          updatedAppointment = await Appointment.findByIdAndUpdate(
            appointment._id,
            { status: 'completed' },
            { new: true }
          )
          .populate('patient')
          .populate('doctor');
          
          const res = await axios.post(`${env.process.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendFeedBackLink`,{
              patientName: updatedAppointment.user.fullName,
              doctorName: updatedAppointment
          })
          console.log(`Marked appointment ${appointment._id} as completed`);
        }
      }
      
      
    } catch (error) {
      console.error('Error updating appointment statuses:', error);
    }
  }
  