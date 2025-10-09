const express = require('express');
const appointmentRouter = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { authorize, protect } = require('../middleware/auth');

// Book an appointment
appointmentRouter.post('/book', protect, appointmentController.bookAppointment);

// Get all appointments (with filtering)
appointmentRouter.get('/', protect, appointmentController.getAppointments);

// Get single appointment by ID
appointmentRouter.get('/:id', protect, appointmentController.getAppointment);

// Update appointment status
appointmentRouter.put('/:id/status', protect, appointmentController.updateAppointmentStatus);

appointmentRouter.post('/:id/request-completion', protect, appointmentController.requestAppointmentCompletion);

appointmentRouter.post('/:id/verify-completion', protect, appointmentController.verifyAppointmentCompletion);

appointmentRouter.post('/:id/resend-completion-otp', protect, appointmentController.resendAppointmentCompletionOTP);

// Add prescription to appointment
appointmentRouter.put('/:id/prescription',
      protect,
      authorize("doctor"),
      appointmentController.addPrescription);

// Get appointmentStats by doctor ID
appointmentRouter.get('/doctor/:doctorId/stats', appointmentController.getConsultationStats);
appointmentRouter.get('/doctor/:doctorId/activity', appointmentController.getDoctorActivity);
appointmentRouter.get('/doctor/:doctorId/trends', appointmentController.getConsultationTrends);

// Get upcoming video appointments
appointmentRouter.get('/doctor/:doctorId/upcoming/video', appointmentController.getUpcomingVideoAppointments);

// Get upcoming clinic appointments
appointmentRouter.get('/doctor/:doctorId/upcoming/clinic', appointmentController.getUpcomingClinicAppointments);

// Get cancelled appointments
appointmentRouter.get('/doctor/:doctorId/cancelled', appointmentController.getCancelledAppointments);

appointmentRouter.get('/doctors/:doctorId/patients/analytics', appointmentController.getDoctorPatientsAnalytics);

// get patients assigned to a doctor
appointmentRouter.get('/doctors/:doctorId/patients', appointmentController.getDoctorPatients);

//doctor get particular patient's details by his id 
appointmentRouter.get('/doctors/patients/:id', appointmentController.getDoctorPatientById)

//post notes to patient by doctor to patient
appointmentRouter.post('/patients/:id/notes', appointmentController.addPatientNotes)

appointmentRouter.get('/presentmonth/confirmed', protect, authorize('doctor'), appointmentController.getDoctorConfirmedAppointmentsForCurrentMonth);

appointmentRouter.get('/patient/week/rating', protect, authorize('doctor'), appointmentController.getDoctorWeeklyRating);

appointmentRouter.get('/doctor/totalpatients', protect, authorize('doctor'), appointmentController.getTotalPatientsByDoctor);

appointmentRouter.get('/doctor/dashboard-statics', protect, authorize('doctor'), appointmentController.getDoctorDashboardStats);

appointmentRouter.get('/appointments/online-consults', protect, authorize('doctor'), appointmentController.getOnlineConsultsForCurrentMonth);

appointmentRouter.post('/reschedule/appointment', protect, appointmentController.rescheduleAppointment);

appointmentRouter.get('/statistics/appointments', protect, appointmentController.getDoctorAppointmentStatistics);

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

appointmentRouter.get('/appointment/health-records/:appointmentId', protect, authorize('doctor'), appointmentController.getHealthRecords);

appointmentRouter.post('/appointment/health-records', protect, authorize('doctor'), appointmentController.createHealthRecord);

appointmentRouter.put('/appointment/health-records/:recordId', protect, authorize('doctor'), appointmentController.updateHealthRecord);

appointmentRouter.delete('/appointment/health-records/:recordId', protect, authorize('doctor'), appointmentController.deleteHealthRecord);
module.exports = appointmentRouter;