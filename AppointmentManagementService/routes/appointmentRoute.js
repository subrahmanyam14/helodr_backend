const express = require('express');
const appointmentRouter = express.Router();
const appointmentController = require('../controllers/appointmentController');
const {authorize, protect} = require('../middleware/auth');

// Book an appointment
appointmentRouter.post('/book', protect, appointmentController.bookAppointment);

// Get all appointments (with filtering)
appointmentRouter.get('/', protect, appointmentController.getAppointments);

// Get single appointment by ID
appointmentRouter.get('/:id', protect, appointmentController.getAppointment);

// Update appointment status
appointmentRouter.put('/:id/status', protect, appointmentController.updateAppointmentStatus);

// Add prescription to appointment
appointmentRouter.put('/:id/prescription',
     protect, 
     authorize("doctor"),
      appointmentController.addPrescription);

// Get upcoming video appointments
appointmentRouter.get('/doctor/:doctorId/upcoming/video', appointmentController.getUpcomingVideoAppointments);

// Get upcoming clinic appointments
appointmentRouter.get('/doctor/:doctorId/upcoming/clinic', appointmentController.getUpcomingClinicAppointments);

// Get cancelled appointments
appointmentRouter.get('/doctor/:doctorId/cancelled', appointmentController.getCancelledAppointments);


// get patients assigned to a doctor
appointmentRouter.get('/doctors/patients',appointmentController.getDoctorPatients)

//doctor get particular patient's details by his id 
appointmentRouter.get( '/doctors/:doctorId/patients/:id',appointmentController.getDoctorPatientById)

//post notes to patient by doctor to patient
appointmentRouter.post('/patients/:id/notes',appointmentController.addPatientNotes)

appointmentRouter.get('/presentmonth/confirmed/:doctorId', appointmentController.getDoctorConfirmedAppointmentsForCurrentMonth);

appointmentRouter.get('/patient/week/rating/:doctorId', appointmentController.getDoctorWeeklyRating);

appointmentRouter.get('/doctor/totalpateints/:doctorId', appointmentController.getTotalPatientsByDoctor);

appointmentRouter.get('/appoinments/online-consults/:doctorId', appointmentController.getOnlineConsultsForCurrentMonth);

appointmentRouter.post('/reschedule/appoinment', appointmentController.rescheduleAppoinmentByDoctor);

module.exports = appointmentRouter;