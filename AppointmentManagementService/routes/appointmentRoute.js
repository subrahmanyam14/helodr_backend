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

appointmentRouter.get('/presentmonth/confirmed', protect, authorize('doctor'), appointmentController.getDoctorConfirmedAppointmentsForCurrentMonth);

appointmentRouter.get('/patient/week/rating', protect, authorize('doctor'), appointmentController.getDoctorWeeklyRating);

appointmentRouter.get('/doctor/totalpatients', protect, authorize('doctor'), appointmentController.getTotalPatientsByDoctor);

appointmentRouter.get('/doctor/dashboard-statics', protect, authorize('doctor'), appointmentController.getDoctorDashboardStats);

appointmentRouter.get('/appoinments/online-consults',  protect, authorize('doctor'),  appointmentController.getOnlineConsultsForCurrentMonth);

appointmentRouter.post('/reschedule/appoinment', protect, appointmentController.rescheduleAppoinment);

appointmentRouter.get('/statistics/appoinments', protect, appointmentController.getDoctorAppointmentStatistics);

appointmentRouter.get('/statistics/graph', protect, appointmentController.getDoctorAppointmentsStaticsForGraph);

appointmentRouter.get('/today/upcomming/completed', protect, appointmentController.getCombinedAppointments);

appointmentRouter.get('/statistics/detailed', protect, appointmentController.getDoctorStatisticsDetailed);

appointmentRouter.get('/patient/feedback', protect, appointmentController.getPatientFeedbackMetrics);

appointmentRouter.post('/:id/review', protect, authorize('patient'), appointmentController.submitAppointmentReview);

appointmentRouter.get('/:id/review', protect, authorize('patient'), appointmentController.getAppointmentReview);

appointmentRouter.put('/:id/review', protect, authorize('patient'), appointmentController.updateAppointmentReview);

appointmentRouter.get('/patient/activities', protect, authorize('doctor'), appointmentController.getDoctorRecentActivities);

appointmentRouter.get('/doctor/dashboard', protect, authorize('doctor'), appointmentController.dashboard);

appointmentRouter.get('/doctor/appoinments', protect, authorize('doctor'), appointmentController.getAppointmentsByPagination);

appointmentRouter.get('/doctor/getLastSixWeeksAppoinmentsTrend', protect, authorize('doctor'), appointmentController.getLastSixWeeksAppointmentsTrend);
module.exports = appointmentRouter;