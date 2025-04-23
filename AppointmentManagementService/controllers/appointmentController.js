const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Doctor = require('../models/Doctor'); // Added missing import
const mongoose = require('mongoose');
const User = require('../models/User');
const Statistics = require("../models/Statistics");

// @desc    Book an appointment
// @route   POST /api/appointments
// @access  Private (Patient)

exports.bookAppointment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { doctorId, date, slot, reason, appointmentType } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!doctorId || !date || !slot || !appointmentType) {
      throw new Error("Missing required fields");
    }

    // Check doctor availability
    const availability = await Availability.findOne({ doctor: doctorId }).session(session);
    if (!availability) {
      throw new Error("Doctor availability not found");
    }

    const appointmentDate = new Date(date);
    if (isNaN(appointmentDate.getTime())) {
      throw new Error("Invalid date format");
    }

    // Check if slot is available
    const availableSlots = availability.getAvailableSlotsForDate(appointmentDate);
    if (!availableSlots[appointmentType] || !availableSlots[appointmentType].slots.includes(slot)) {
      throw new Error(`The requested slot ${slot} is not available for ${appointmentType} consultation`);
    }

    // Create new appointment
    const appointment = new Appointment({
      patient: userId,
      doctor: doctorId,
      appointmentType,
      date: appointmentDate,
      slot: {
        startTime: slot,
        endTime: calculateEndTime(slot, availability.slotDuration || 20),
      },
      reason: reason || "",
      status: "pending",
    });

    // Save appointment and update availability
    await appointment.save({ session });
    await availability.bookSlot(appointmentDate.toISOString().split('T')[0], slot, appointmentType, appointment._id);
    await availability.save({ session });

    // Get doctor details for response
    const doctor = await Doctor.findById(doctorId)
      .select("user")
      .populate("user", "fullName")
      .session(session);

    if (!doctor) {
      throw new Error("Doctor not found");
    }

    await session.commitTransaction();
    const fee = await calculateAppointmentFee(doctorId, appointmentType);

    res.status(201).json({
      success: true,
      data: { ...appointment.toObject(), fee },
      message: "Appointment booked successfully"
    });

  } catch (err) {
    await session.abortTransaction();
    res.status(400).json({
      success: false,
      message: err.message || "Failed to book appointment"
    });
  } finally {
    session.endSession();
  }
};

// Helper function to calculate end time
function calculateEndTime(startTime, durationMinutes) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  return `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
}


// Helper function to calculate appointment fee
async function calculateAppointmentFee(doctorId, consultationType) {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new Error('Doctor not found');

  switch (consultationType) {
    case 'clinic':
      return doctor.clinicConsultationFee.consultationFee;
    case 'video':
      return doctor.onlineConsultation.consultationFee;
    default:
      return doctor.clinicConsultationFee.consultationFee || doctor.onlineConsultation.consultationFee || 0;
  }
}

// @desc    Get appointments
// @route   GET /api/appointments
// @access  Private
exports.getAppointments = async (req, res) => {
  try {
    let query = {};
    const { status, upcoming, past, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    // For patients
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    }
    // For doctors
    else if (req.user.role === 'doctor') {
      query.doctor = req.user.id;
    }

    if (status) {
      query.status = status;
    }

    if (upcoming === 'true') {
      query.date = { $gte: new Date() };
    } else if (past === 'true') {
      query.date = { $lt: new Date() };
    }

    const appointments = await Appointment.find(query)
      .populate('doctor', 'user')
      .populate({
        path: 'doctor',
        populate: {
          path: 'user',
          select: 'fullName profilePhoto'
        }
      })
      .populate('patient', 'fullName profilePhoto')
      .sort({ date: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Appointment.countDocuments(query);

    res.status(200).json({
      success: true,
      data: appointments,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Get single appointment
// @route   GET /api/appointments/:id
// @access  Private
exports.getAppointment = async (req, res) => {
  try {
    let query = { _id: req.params.id };

    // Patients can only see their own appointments
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    }
    // Doctors can only see their own appointments
    else if (req.user.role === 'doctor') {
      query.doctor = req.user.doctorId;
    }

    const appointment = await Appointment.findOne(query)
      .populate('doctor', 'user')
      .populate({
        path: 'doctor',
        populate: {
          path: 'user',
          select: 'fullName profilePhoto'
        }
      })
      .populate('patient', 'fullName profilePhoto')
      .populate('payment');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    res.status(200).json({ success: true, data: appointment });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update appointment status
// @route   PUT /api/appointments/:id/status
// @access  Private (Doctor/Patient)
exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    let query = { _id: req.params.id };

    // Patients can only cancel their own appointments
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
      if (status !== 'cancelled') {
        return res.status(403).json({
          success: false,
          message: 'Patients can only cancel appointments'
        });
      }
    }
    // Doctors can update status
    else if (req.user.role === 'doctor') {
      query.doctor = req.user.doctorId;
    }

    const appointment = await Appointment.findOneAndUpdate(
      query,
      { status },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // // Create notification
    await Notification.create({
      user: appointment.patient,
      type: 'appointment_status',
      message: `Appointment status updated to ${status}`,
      referenceId: appointment._id
    });

    res.status(200).json({ success: true, data: appointment });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Add prescription to appointment
// @route   PUT /api/appointments/:id/prescription
// @access  Private (Doctor)
exports.addPrescription = async (req, res) => {
  try {
    const { doctorId, diagnosis, medicines, tests, advice, followUpDate } = req.body;

    const appointment = await Appointment.findOneAndUpdate(
      {
        _id: req.params.id,
        // doctor: req.user.doctorId 
        doctor: doctorId
      },
      {
        prescription: { diagnosis, medicines, tests, advice, followUpDate },
        status: 'completed'
      },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    // Create notification
    await Notification.create({
      user: appointment.patient,
      type: 'prescription_added',
      message: 'Prescription added to your appointment',
      referenceId: appointment._id
    });

    res.status(200).json({ success: true, data: appointment });
  } catch (err) {
    console.log(err.message)
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Helper function to calculate end time
function calculateEndTime(startTime, duration) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  const endDate = new Date(startDate.getTime() + duration * 60000);
  return `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
}

// Helper function to calculate appointment fee
async function calculateAppointmentFee(doctorId, consultationType) {
  const doctor = await Doctor.findById(doctorId);
  if (!doctor) throw new Error('Doctor not found');

  switch (consultationType) {
    case 'clinic':
      return doctor.clinicConsultationFee;
    case 'video':
      return doctor.onlineConsultation.consultationFee;
    default:
      return doctor.consultationFee;
  }
}


//  Upcoming Video Appointments
exports.getUpcomingVideoAppointments = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const now = new Date();
    const appointments = await Appointment.find({
      doctor: doctorId,
      appointmentType: 'video',
      date: { $gte: now },
      status: { $in: ['pending', 'confirmed'] }
    }).populate('patient');
    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch video appointments' });
  }
};

//  Upcoming Clinic Appointments
exports.getUpcomingClinicAppointments = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const now = new Date();
    const appointments = await Appointment.find({
      doctor: doctorId,
      appointmentType: 'clinic',
      date: { $gte: now },
      status: { $in: ['pending', 'confirmed'] }
    }).populate('patient');
    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch clinic appointments' });
  }
};

//  Cancelled Appointments
exports.getCancelledAppointments = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const appointments = await Appointment.find({
      doctor: doctorId,
      status: 'cancelled'
    }).populate('patient');
    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cancelled appointments' });
  }
};

//getting the patients assigned to a doctor when doctor logged in
exports.getDoctorPatients = async (req, res) => {
  try {
    const doctorId = req.body;
    const { search = "", page = 1, limit = 10 } = req.query;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required"
      });
    }

    const query = {
      doctor: doctorId,
      status: { $in: ['booked', 'completed'] }
    };

    // Aggregate unique patient info from appointments
    const aggregatePipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'patient',
          foreignField: '_id',
          as: 'patientInfo'
        }
      },
      { $unwind: '$patientInfo' },
      {
        $group: {
          _id: '$patient',
          name: { $first: '$patientInfo.name' },
          email: { $first: '$patientInfo.email' },
          age: { $first: '$patientInfo.age' },
          gender: { $first: '$patientInfo.gender' },
          lastVisit: { $max: '$date' },
          condition: { $first: '$reason' }, // assuming 'reason' field represents condition
          assignedDoctor: { $first: '$doctor' }
        }
      },
      {
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }
      },
      {
        $sort: { lastVisit: -1 }
      },
      {
        $skip: (parseInt(page) - 1) * parseInt(limit)
      },
      {
        $limit: parseInt(limit)
      }
    ];

    const countPipeline = [
      { $match: query },
      {
        $group: {
          _id: '$patient'
        }
      },
      {
        $count: 'totalCount'
      }
    ];

    const [patients, totalCountResult] = await Promise.all([
      Appointment.aggregate(aggregatePipeline),
      Appointment.aggregate(countPipeline)
    ]);

    const totalCount = totalCountResult[0]?.totalCount || 0;

    res.json({
      patients: patients.map(p => ({
        id: p._id,
        name: p.name,
        email: p.email,
        age: p.age,
        gender: p.gender,
        lastVisit: p.lastVisit,
        condition: p.condition,
        assignedDoctor: p.assignedDoctor
      })),
      totalCount,
      page: parseInt(page)
    });

  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

exports.getDoctorPatientById = async (req, res) => {
  try {
    const doctorId = req.params.doctorId?.trim();
    const patientId = req.params.id?.trim();

    if (!doctorId) {
      return res.status(400).json({ success: false, message: "Doctor ID missing" });
    }

    // Check if this doctor has had appointments with the patient
    const hasAccess = await Appointment.exists({
      doctor: doctorId,
      patient: patientId,
      status: { $in: ['booked', 'completed'] }
    });

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have access to this patient's details"
      });
    }

    // Get patient profile
    const patient = await User.findById(patientId).select(
      'name email age gender address bloodGroup allergies medicalHistory emergencyContact'
    );

    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    // Get past appointments
    const pastAppointments = await Appointment.find({
      doctor: doctorId,
      patient: patientId,
      status: { $in: ['completed', 'booked'] }
    }).sort({ date: -1 }).select('date diagnosis prescription');

    res.json({
      patient: {
        id: patient._id,
        name: patient.name,
        email: patient.email,
        age: patient.age,
        gender: patient.gender,
        address: patient.address,
        bloodGroup: patient.bloodGroup,
        allergies: patient.allergies,
        medicalHistory: patient.medicalHistory,
        emergencyContact: patient.emergencyContact,
        pastAppointments
      }
    });

  } catch (error) {
    console.error("Error fetching patient details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

//doctor adding notes to patient throgh patient id
exports.addPatientNotes = async (req, res) => {
  try {
    const doctorId = req.user?.doctorId;
    const patientId = req.params.id;
    const { notes, diagnosis, prescription, followUpDate } = req.body;


    // Find latest appointment between doctor and patient
    const appointment = await Appointment.findOne({
      doctor: doctorId,
      patient: patientId,
      status: { $in: ['booked', 'completed'] }
    }).sort({ date: -1 });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "No recent appointment found for this patient"
      });
    }

    // Update the appointment with notes
    appointment.notes = notes || appointment.notes;
    appointment.diagnosis = diagnosis || appointment.diagnosis;
    appointment.prescription = prescription || appointment.prescription;
    if (followUpDate) {
      appointment.followUpDate = new Date(followUpDate);
    }

    await appointment.save();

    res.status(200).json({
      success: true,
      message: "Patient notes saved successfully"
    });
  } catch (error) {
    console.error("Error saving notes:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

exports.addReviewByPatient = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { rating, feedback, aspects, isAnonymous } = req.body;
    const patientId = req.user.id; // Assuming user ID is stored in req.user

    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid rating between 1 and 5"
      });
    }

    // Find the appointment
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: patientId,
      status: "completed"
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or not eligible for review"
      });
    }

    // Check if review already exists
    if (appointment.review) {
      return res.status(400).json({
        success: false,
        message: "Review already submitted for this appointment"
      });
    }

    // Add the review
    appointment.review = {
      rating,
      feedback,
      aspects,
      isAnonymous,
      createdAt: new Date()
    };

    await appointment.save();

    // Update doctor's statistics
    let stats = await Statistics.findOne({ doctor: appointment.doctor });

    if (!stats) {
      // If no stats exist yet, create new
      stats = new Statistics({
        doctor: appointment.doctor,
        average_rating: rating,
        total_ratings: 1,
        appointment_count: 1,
        total_earnings: 0 // You can calculate this based on appointments if needed
      });
    } else {
      const totalRatings = stats.total_ratings || 0;
      const currentTotal = (stats.average_rating || 0) * totalRatings;
      const newTotalRatings = totalRatings + 1;
      const newAverage = (currentTotal + rating) / newTotalRatings;

      stats.average_rating = newAverage;
      stats.total_ratings = newTotalRatings;
    }

    await stats.save();

    res.status(200).json({
      success: true,
      message: "Review submitted successfully",
      data: appointment.review
    });

  } catch (error) {
    console.error("Error in addReviewByPatient:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

