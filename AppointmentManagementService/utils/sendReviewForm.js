const Appointment = require("../models/Appointment.js");
const axios = require("axios");

async function updateAppointmentStatusAndSendMessages() {
  try {
    const currentTime = new Date();
    console.log(`Running appointment status update check at ${currentTime}`);

    const confirmedAppointments = await Appointment.find({
      status: "confirmed"
    });

    for (const appointment of confirmedAppointments) {
      const appointmentDate = new Date(appointment.date);
      const [startHours, startMinutes] = appointment.slot.startTime.split(":").map(Number);
      const [endHours, endMinutes] = appointment.slot.endTime.split(":").map(Number);

      const appointmentEndTime = new Date(appointmentDate);
      appointmentEndTime.setHours(endHours, endMinutes, 0, 0);

      if (currentTime > new Date(appointmentEndTime.getTime() + 60 * 60 * 1000)) {
        const updatedAppointment = await Appointment.findByIdAndUpdate(
          appointment._id,
          { status: "completed" },
          { new: true }
        )
        .populate("patient")
        .populate("doctor");

        // Calculate duration in minutes
        const startTime = new Date(appointmentDate);
        startTime.setHours(startHours, startMinutes, 0, 0);

        const endTime = new Date(appointmentDate);
        endTime.setHours(endHours, endMinutes, 0, 0);

        const duration = Math.round((endTime - startTime) / (60 * 1000)); // in minutes

        await axios.post(`${process.env.TRANSPORT_STORAGE_SERVICE_URL}/mail/sendFeedBackLink`, {
          patientName: updatedAppointment.patient.fullName,
          doctorName: updatedAppointment.doctor.fullName,
          specialization: updatedAppointment.doctor.specialization, // assuming it's in doctor
          appointmentDate: updatedAppointment.date,
          appointmentTime: updatedAppointment.slot.startTime,
          duration: duration
        });

        console.log(`Marked appointment ${appointment._id} as completed`);
      }
    }

  } catch (error) {
    console.error("Error updating appointment statuses:", error);
  }
}

module.exports = { updateAppointmentStatusAndSendMessages };
