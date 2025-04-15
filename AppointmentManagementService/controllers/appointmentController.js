const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Doctor = require('../models/Doctor'); // Added missing import
const mongoose = require('mongoose');

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

    res.status(201).json({
      success: true,
      data: appointment,
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
      user: appointment.patient ,
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
    const { diagnosis, medicines, tests, advice, followUpDate } = req.body;

    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, doctor: req.user.doctorId },
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