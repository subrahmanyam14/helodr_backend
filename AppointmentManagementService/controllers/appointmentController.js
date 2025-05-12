const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Doctor = require('../models/Doctor'); // Added missing import
const mongoose = require('mongoose');
const User = require('../models/User');
const Statistics = require("../models/Statistics");
const UpcomingEarnings = require("../models/UpcomingEarnings");



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

function calculateEndTime(startTime, durationMinutes) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);

  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  return `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
}

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

exports.updateAppointmentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    let query = { _id: req.params.id };
    console.log("User details: ", req.user);
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
    console.log("Error in the updateAppointmentStatus, ", err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

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

function calculateEndTime(startTime, duration) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  const endDate = new Date(startDate.getTime() + duration * 60000);
  return `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
}

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

exports.getDoctorConfirmedAppointmentsForCurrentMonth = async (req, res) => {
  try {
    // Validate doctor ID
    if (!mongoose.Types.ObjectId.isValid(req.params.doctorId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid doctor ID"
      });
    }

    // Get current date and calculate start/end of month
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const appointments = await Appointment.find({
      doctor: req.params.doctorId,
      status: "confirmed",
      date: {
        $gte: firstDayOfMonth,
        $lte: lastDayOfMonth
      }
    })
    .populate({
      path: "patient",
      select: "fullName email countryCode mobileNumber gender dateOfBirth" // Include additional patient details
    })
    .populate({
      path: "doctor",
      select: "fullName specializations " // Include additional doctor details
    })
    .sort({ date: 1, "slot.startTime": 1 }); // Sort by date and time

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
      month: now.toLocaleString('default', { month: 'long' }),
      year: now.getFullYear()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: "Server Error"
    });
  }
};

exports.getDoctorWeeklyRating = async (req, res) => {
  const { doctorId } = req.params;

  try {
    // Validate doctorId
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID" });
    }

    // Get start and end of the current week (Sunday to Saturday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Aggregate ratings
    const ratings = await Appointment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          "review.rating": { $exists: true },
          "review.createdAt": {
            $gte: startOfWeek,
            $lte: endOfWeek
          }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$review.rating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (ratings.length === 0) {
      return res.status(200).json({
        success: true,
        averageRating: null,
        totalReviews: 0,
        message: "No reviews for this week"
      });
    }

    res.status(200).json({
      success: true,
      averageRating: ratings[0].averageRating.toFixed(2),
      totalReviews: ratings[0].totalReviews
    });
  } catch (error) {
    console.error("Error fetching weekly rating:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

exports.getTotalPatientsByDoctor = async (req, res) => {
  const { doctorId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(doctorId)) {
    return res.status(400).json({ success: false, message: "Invalid doctor ID" });
  }

  try {
    // Unique patient count overall
    const uniquePatients = await Appointment.distinct("patient", {
      doctor: doctorId
    });

    // Group by quarter and year
    const quarterStats = await Appointment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId)
        }
      },
      {
        $group: {
          _id: {
            patient: "$patient",
            year: { $year: "$date" },
            quarter: {
              $ceil: { $divide: [{ $month: "$date" }, 3] } // 1-3 = Q1, 4-6 = Q2, etc.
            }
          }
        }
      },
      {
        $group: {
          _id: {
            year: "$_id.year",
            quarter: "$_id.quarter"
          },
          uniquePatients: { $sum: 1 }
        }
      },
      {
        $sort: {
          "_id.year": 1,
          "_id.quarter": 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      totalUniquePatients: uniquePatients.length,
      quarterlyBreakdown: quarterStats.map(q => ({
        year: q._id.year,
        quarter: `Q${q._id.quarter}`,
        patients: q.uniquePatients
      }))
    });
  } catch (error) {
    console.error("Error fetching patient stats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

exports.getOnlineConsultsForCurrentMonth = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const onlineConsults = await Appointment.find({
      appointmentType: "video",
      date: {
        $gte: startOfMonth,
        $lte: endOfMonth
      },
      doctor: doctorId,
    }); 

    res.status(200).json({
      success: true,
      count: onlineConsults.length,
      data: onlineConsults
    });
  } catch (error) {
    console.error("Error fetching online consults:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

exports.rescheduleAppoinmentByDoctor = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { appointmentId, doctorId, newDate, newStartTime } = req.body;

    const existingAppointment = await Appointment.findById(appointmentId).session(session);
    if (!existingAppointment) {
      return res.status(404).send({ error: `Appointment not found with ID: ${appointmentId}` });
    }

    if (existingAppointment.doctor.toString() !== doctorId) {
      return res.status(403).send({ error: `You don't have permission to reschedule this appointment.` });
    }

    // Check doctor availability
    const availability = await Availability.findOne({ doctor: doctorId }).session(session);
    if (!availability) {
      throw new Error("Doctor availability not found");
    }

    const appointmentDate = new Date(newDate);
    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).send({ error: "Invalid date format" });
    }

    // Check slot availability
    const availableSlots = availability.getAvailableSlotsForDate(appointmentDate);
    const type = existingAppointment.appointmentType;
    if (!availableSlots[type] || !availableSlots[type].slots.includes(newStartTime)) {
      return res.status(400).send({ error: `Slot ${newStartTime} not available for ${type} consultation` });
    }

    // Create new appointment
    const newAppointment = new Appointment({
      patient: existingAppointment.patient,
      doctor: doctorId,
      appointmentType: type,
      date: appointmentDate,
      slot: {
        startTime: newStartTime,
        endTime: calculateEndTime(newStartTime, availability.slotDuration || 20),
      },
      reason: existingAppointment.reason || "",
      payment: existingAppointment.payment,
      rescheduledFrom: existingAppointment._id,
      videoConferenceLink: existingAppointment.videoConferenceLink,
      status: "confirmed"
    });

    // Save new appointment
    await newAppointment.save({ session });

    // Mark old appointment as rescheduled
    existingAppointment.status = "rescheduled";
    await existingAppointment.save({ session });

    // Update related data
    await availability.bookSlot(
      appointmentDate.toISOString().split('T')[0],
      newAppointment.slot,
      type,
      newAppointment._id
    );

    await Payment.findByIdAndUpdate(existingAppointment.payment, { appointment: newAppointment._id }).session(session);
    await UpcomingEarnings.findOneAndUpdate({ payment: existingAppointment.payment }, { appointment: newAppointment._id }).session(session);

    await availability.save({ session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: newAppointment,
      message: "Appointment rescheduled successfully"
    });

  } catch (error) {
    await session.abortTransaction();
    console.error("Error in rescheduleAppoinmentByDoctor:", error);
    res.status(500).send({ error: "Internal server error" });
  } finally {
    session.endSession();
  }
};


