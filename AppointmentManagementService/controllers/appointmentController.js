const moment = require("moment");
const Appointment = require('../models/Appointment');
const Availability = require('../models/Availability');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const Doctor = require('../models/Doctor'); // Added missing import
const mongoose = require('mongoose');
const User = require('../models/User');
const Statistics = require("../models/Statistics");
const UpcomingEarnings = require("../models/UpcomingEarnings");
const Wallet = require("../models/Wallet");

exports.getDoctorActivity = async (req, res) => {
  try {
    const { doctorId } = req.params;

    // Fetch wallet data
    const wallet = await Wallet.findOne({ doctor: doctorId });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found"
      });
    }

    // Fetch recent appointments (last 10 appointments)
    const recentAppointments = await Appointment.find({ doctor: doctorId })
      .populate('patient', 'fullName email mobileNumber')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('patient appointmentType date slot status payment createdAt reason');

    // Prepare wallet overview
    const walletOverview = {
      current_balance: wallet.current_balance,
      total_earned: wallet.total_earned,
      total_withdrawn: wallet.total_withdrawn,
      total_spent: wallet.total_spent,
      commission_rate: wallet.commission_rate,
      last_payment_date: wallet.last_payment_date,
      last_withdrawal_date: wallet.last_withdrawal_date
    };

    // Format recent appointments for frontend
    const formattedRecentAppointments = recentAppointments.map(appointment => ({
      id: appointment._id,
      patientName: appointment.patient?.fullName || 'Unknown Patient',
      patientEmail: appointment.patient?.email,
      appointmentType: appointment.appointmentType,
      date: appointment.date,
      startTime: appointment.slot.startTime,
      endTime: appointment.slot.endTime,
      status: appointment.status,
      reason: appointment.reason,
      createdAt: appointment.createdAt,
      timeAgo: getTimeAgo(appointment.createdAt)
    }));

    res.status(200).json({
      success: true,
      data: {
        walletOverview,
        recentAppointments: formattedRecentAppointments
      }
    });

  } catch (error) {
    console.error('Error fetching doctor dashboard data:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard data",
      error: error.message
    });
  }
};

// Helper function to calculate time ago
const getTimeAgo = (date) => {
  const now = new Date();
  const diffTime = Math.abs(now - new Date(date));
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};

// Get consultation statistics for a doctor
exports.getConsultationStats = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { month, year } = req.query;

    // Validate doctorId
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID'
      });
    }

    // Build date filter for overview stats
    let dateFilter = {};
    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    if (month && year) {
      // Specific month filter for weekly view
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);
      dateFilter = {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };
    } else if (year) {
      // Yearly filter for monthly view
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      dateFilter = {
        date: {
          $gte: startDate,
          $lte: endDate
        }
      };
    }

    // Get overall stats (filtered by year or year+month)
    const overallStats = await Appointment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          pending: {
            $sum: {
              $cond: [{ $in: ['$status', ['pending', 'confirmed']] }, 1, 0]
            }
          },
          inClinic: {
            $sum: {
              $cond: [{ $eq: ['$appointmentType', 'clinic'] }, 1, 0]
            }
          },
          video: {
            $sum: {
              $cond: [{ $eq: ['$appointmentType', 'video'] }, 1, 0]
            }
          },
          inClinicCompleted: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$appointmentType', 'clinic'] },
                    { $eq: ['$status', 'completed'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          videoCompleted: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$appointmentType', 'video'] },
                    { $eq: ['$status', 'completed'] }
                  ]
                },
                1,
                0
              ]
            }
          },
          inClinicPending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$appointmentType', 'clinic'] },
                    { $in: ['$status', ['pending', 'confirmed']] }
                  ]
                },
                1,
                0
              ]
            }
          },
          videoPending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$appointmentType', 'video'] },
                    { $in: ['$status', ['pending', 'confirmed']] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Get monthly stats for the specified year
    const monthlyStats = await Appointment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          date: {
            $gte: new Date(currentYear, 0, 1),
            $lte: new Date(currentYear, 11, 31, 23, 59, 59)
          }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: '$date' },
            appointmentType: '$appointmentType'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.month',
          inClinic: {
            $sum: {
              $cond: [{ $eq: ['$_id.appointmentType', 'clinic'] }, '$count', 0]
            }
          },
          video: {
            $sum: {
              $cond: [{ $eq: ['$_id.appointmentType', 'video'] }, '$count', 0]
            }
          },
          total: { $sum: '$count' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Fill missing months with zero values
    const completeMonthlyStats = [];
    for (let i = 1; i <= 12; i++) {
      const monthData = monthlyStats.find(stat => stat._id === i);
      completeMonthlyStats.push({
        month: i,
        inClinic: monthData ? monthData.inClinic : 0,
        video: monthData ? monthData.video : 0,
        total: monthData ? monthData.total : 0
      });
    }

    // Get weekly stats for specified month
    let weeklyStats = [];
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const rawWeeklyStats = await Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            date: {
              $gte: startDate,
              $lte: endDate
            }
          }
        },
        {
          $addFields: {
            week: {
              $ceil: {
                $divide: [{ $dayOfMonth: '$date' }, 7]
              }
            }
          }
        },
        {
          $group: {
            _id: {
              week: '$week',
              appointmentType: '$appointmentType'
            },
            count: { $sum: 1 }
          }
        },
        {
          $group: {
            _id: '$_id.week',
            inClinic: {
              $sum: {
                $cond: [{ $eq: ['$_id.appointmentType', 'clinic'] }, '$count', 0]
              }
            },
            video: {
              $sum: {
                $cond: [{ $eq: ['$_id.appointmentType', 'video'] }, '$count', 0]
              }
            },
            total: { $sum: '$count' }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Fill missing weeks with zero values (assuming max 5 weeks)
      for (let i = 1; i <= 5; i++) {
        const weekData = rawWeeklyStats.find(stat => stat._id === i);
        weeklyStats.push({
          week: i,
          inClinic: weekData ? weekData.inClinic : 0,
          video: weekData ? weekData.video : 0,
          total: weekData ? weekData.total : 0
        });
      }
    }

    // Format response
    const stats = overallStats[0] || {
      total: 0,
      completed: 0,
      pending: 0,
      inClinic: 0,
      video: 0,
      inClinicCompleted: 0,
      videoCompleted: 0,
      inClinicPending: 0,
      videoPending: 0
    };

    res.status(200).json({
      success: true,
      data: {
        overview: {
          total: stats.total,
          completed: stats.completed,
          pending: stats.pending,
          inClinic: {
            total: stats.inClinic,
            completed: stats.inClinicCompleted,
            pending: stats.inClinicPending
          },
          video: {
            total: stats.video,
            completed: stats.videoCompleted,
            pending: stats.videoPending
          }
        },
        monthlyStats: completeMonthlyStats,
        weeklyStats: weeklyStats,
        year: currentYear,
        month: month ? parseInt(month) : null
      }
    });

  } catch (error) {
    console.error('Error fetching consultation stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consultation statistics',
      error: error.message
    });
  }
};
// Get consultation trends (last 6 months)
exports.getConsultationTrends = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID'
      });
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const trends = await Appointment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          date: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' },
            appointmentType: '$appointmentType'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month'
          },
          inClinic: {
            $sum: {
              $cond: [{ $eq: ['$_id.appointmentType', 'clinic'] }, '$count', 0]
            }
          },
          video: {
            $sum: {
              $cond: [{ $eq: ['$_id.appointmentType', 'video'] }, '$count', 0]
            }
          },
          total: { $sum: '$count' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: trends.map(trend => ({
        year: trend._id.year,
        month: trend._id.month,
        inClinic: trend.inClinic,
        video: trend.video,
        total: trend.total
      }))
    });

  } catch (error) {
    console.error('Error fetching consultation trends:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch consultation trends',
      error: error.message
    });
  }
};

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
    const { status, sortDirection, limit = 10, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    // For patients
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    }
    // For doctors
    else if (req.user.role === 'doctor') {
      const doctor = await Doctor.findOne({ user: req.user.id });
      if (doctor) {
        query.doctor = doctor._id;
      } else {
        return res.status(404).json({ success: false, message: 'Doctor profile not found' });
      }
    }


    if (status) {
      query.status = status;
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
      .sort({ createdAt: -1 })
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
    console.log("Error in the getAppoinments, ", err);
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

exports.getDoctorPatientsAnalytics = async (req, res) => {
  try {
    const { doctorId } = req.params;

    // Validate doctor ID
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID'
      });
    }

    // Get all appointments for this doctor
    const appointments = await Appointment.find({ doctor: doctorId });

    if (appointments.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalPatients: 0,
          averageRating: 0,
          totalReviews: 0,
          todayAppointments: 0,
          clinicAppointments: {
            total: 0,
            completed: 0,
            pending: 0,
            confirmed: 0,
            cancelled: 0,
            noShow: 0,
            rescheduled: 0
          },
          videoAppointments: {
            total: 0,
            completed: 0,
            pending: 0,
            confirmed: 0,
            cancelled: 0,
            noShow: 0,
            rescheduled: 0
          }
        }
      });
    }

    // Get unique patient IDs
    const uniquePatientIds = [...new Set(appointments.map(apt => apt.patient.toString()))];
    const totalPatients = uniquePatientIds.length;

    // Clinic Appointments analytics
    const clinicVisitAppointments = appointments.filter(apt => apt.appointmentType === 'clinic');
    const clinicAppointments = {
      total: clinicVisitAppointments.length,
      completed: clinicVisitAppointments.filter(apt => apt.status === 'completed').length,
      pending: clinicVisitAppointments.filter(apt => apt.status === 'pending').length,
      confirmed: clinicVisitAppointments.filter(apt => apt.status === 'confirmed').length,
      cancelled: clinicVisitAppointments.filter(apt => apt.status === 'cancelled').length,
      noShow: clinicVisitAppointments.filter(apt => apt.status === 'no_show').length,
      rescheduled: clinicVisitAppointments.filter(apt => apt.status === 'rescheduled').length
    };

    // Video Appointments analytics
    const videoCallAppointments = appointments.filter(apt => apt.appointmentType === 'video');
    const videoAppointments = {
      total: videoCallAppointments.length,
      completed: videoCallAppointments.filter(apt => apt.status === 'completed').length,
      pending: videoCallAppointments.filter(apt => apt.status === 'pending').length,
      confirmed: videoCallAppointments.filter(apt => apt.status === 'confirmed').length,
      cancelled: videoCallAppointments.filter(apt => apt.status === 'cancelled').length,
      noShow: videoCallAppointments.filter(apt => apt.status === 'no_show').length,
      rescheduled: videoCallAppointments.filter(apt => apt.status === 'rescheduled').length
    };

    // Rating analytics
    const reviewedAppointments = appointments.filter(apt => apt.review && apt.review.rating);
    const totalReviews = reviewedAppointments.length;
    const averageRating = totalReviews > 0
      ? (reviewedAppointments.reduce((sum, apt) => sum + apt.review.rating, 0) / totalReviews).toFixed(1)
      : 0;

    // Time-based analytics - only today
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayAppointments = appointments.filter(apt =>
      new Date(apt.date) >= startOfToday && new Date(apt.date) < new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)
    ).length;

    res.status(200).json({
      success: true,
      data: {
        totalPatients,
        averageRating: parseFloat(averageRating),
        totalReviews,
        todayAppointments,
        clinicAppointments,
        videoAppointments
      }
    });

  } catch (error) {
    console.error('Error in getDoctorPatientsAnalytics:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 2. Get Doctor's Patients with Pagination
exports.getDoctorPatients = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { page = 1, limit = 10, search = '', sortBy = 'date', sortOrder = 'desc' } = req.query;

    // Validate doctor ID
    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID'
      });
    }

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build search query for appointments
    let matchQuery = { doctor: new mongoose.Types.ObjectId(doctorId) };

    // Aggregation pipeline to get appointments with patient details
    const pipeline = [
      { $match: matchQuery },

      // Lookup patient details
      {
        $lookup: {
          from: 'users',
          localField: 'patient',
          foreignField: '_id',
          as: 'patientDetails'
        }
      },

      // Unwind patient details
      { $unwind: '$patientDetails' },

      // Add search functionality if provided
      ...(search ? [{
        $match: {
          $or: [
            { 'patientDetails.fullName': { $regex: search, $options: 'i' } },
            { 'patientDetails.email': { $regex: search, $options: 'i' } },
            { 'patientDetails.mobileNumber': { $regex: search, $options: 'i' } },
            { reason: { $regex: search, $options: 'i' } }
          ]
        }
      }] : []),

      // Project only necessary appointment and patient fields
      {
        $project: {
          _id: 1,
          patient: {
            _id: '$patientDetails._id',
            fullName: '$patientDetails.fullName',
            email: '$patientDetails.email',
            mobileNumber: '$patientDetails.mobileNumber',
            profilePhoto: '$patientDetails.profilePhoto'
          },
          appointmentType: 1,
          date: 1,
          slot: {
            startTime: 1,
            endTime: 1
          },
          reason: 1,
          status: 1,
          videoConferenceLink: 1,
          prescription: {
            diagnosis: 1,
            medicines: 1,
            tests: 1,
            advice: 1,
            followUpDate: 1
          },
          review: {
            rating: 1,
            feedback: 1,
            aspects: 1
          },
          followUp: {
            isRequired: 1,
            date: 1
          },
          cancellation: {
            initiatedBy: 1,
            reason: 1,
            cancelledAt: 1
          },
          rescheduledFrom: 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    ];

    // Add sorting
    const sortStage = {};
    if (sortBy === 'date') {
      sortStage.date = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'status') {
      sortStage.status = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'patientName') {
      sortStage['patient.fullName'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'appointmentType') {
      sortStage.appointmentType = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortStage.date = -1; // default sort by date descending
    }

    pipeline.push({ $sort: sortStage });

    // Get total count for pagination
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: 'total' });
    const countResult = await Appointment.aggregate(countPipeline);
    const totalAppointments = countResult.length > 0 ? countResult[0].total : 0;

    // Add pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limitNum });

    // Execute aggregation
    const appointments = await Appointment.aggregate(pipeline);

    const totalPages = Math.ceil(totalAppointments / limitNum);

    res.status(200).json({
      success: true,
      data: {
        appointments,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalAppointments,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        }
      }
    });

  } catch (error) {
    console.error('Error in getDoctorPatients:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// 3. Get Specific Patient Details for Doctor
exports.getDoctorPatientById = async (req, res) => {
  try {
    const { id: patientId } = req.params;

    // Validate if patientId is provided
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Patient ID is required"
      });
    }

    // Find patient by ID and role, populate doctor and medical records
    const [patient, appointments] = await Promise.all([
      User.findOne({
        _id: patientId,
        role: "patient"
      })
        .populate({
          path: 'doctorId',
          select: 'fullName email specialization' // Adjust fields based on your Doctor model
        })
        .populate({
          path: 'medicalRecords.doctorId',
          select: 'fullName specialization'
        })
        .select('-password'), // Exclude password from response

      // Fetch patient's appointments
      Appointment.find({ patient: patientId })
        .populate({
          path: 'doctor',
          select: 'fullName specialization email'
        })
        .populate({
          path: 'payment',
          select: 'amount status paymentMethod'
        })
        .sort({ date: -1, 'slot.startTime': -1 })
        .limit(50) // Limit to recent 50 appointments
    ]);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    res.status(200).json({
      success: true,
      data: {
        patient: {
          id: patient._id,
          fullName: patient.fullName,
          email: patient.email,
          countryCode: patient.countryCode,
          mobileNumber: patient.mobileNumber,
          gender: patient.gender,
          dateOfBirth: patient.dateOfBirth,
          age: patient.age, // Virtual field
          bloodGroup: patient.bloodGroup,
          profilePhoto: patient.profilePhoto,
          address: {
            addressLine1: patient.addressLine1,
            addressLine2: patient.addressLine2,
            city: patient.city,
            state: patient.state,
            pinCode: patient.pinCode,
            country: patient.country
          },
          assignedDoctor: patient.doctorId,
          medicalRecords: patient.medicalRecords,
          appointments: appointments,
          createdAt: patient.createdAt,
          updatedAt: patient.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Error fetching patient details:', error);

    // Handle specific MongoDB errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format"
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // console.log("DoctorId: ",req.user.doctorId);
    // Validate doctor ID
    if (!mongoose.Types.ObjectId.isValid(req.user.doctorId)) {
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
      doctor: req.user.doctorId,
      status: "confirmed",
      date: {
        $gte: firstDayOfMonth,
        $lte: lastDayOfMonth
      }
    })
      .populate({
        path: "patient",
        select: "fullName email countryCode mobileNumber gender dateOfBirth profilePhoto" // Include additional patient details
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
  const { doctorId } = req.user;

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
  const { doctorId } = req.user;

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
    const { doctorId } = req.user;
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
    }).select("-reminders");

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

exports.getDoctorDashboardStats = async (req, res) => {
  const { doctorId } = req.user;
  if (!mongoose.Types.ObjectId.isValid(doctorId)) {
    return res.status(400).json({ success: false, message: "Invalid doctor ID" });
  }
  try {
    const now = new Date();
    // Month Start & End
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    // Week Start & End (Sunday - Saturday)
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // ---------- PARALLEL PROMISES ----------
    const [
      confirmedAppointments,
      weeklyRatings,
      uniquePatients,
      walletData
    ] = await Promise.all([
      // Confirmed Appointments (Current Month)
      Appointment.countDocuments({
        doctor: doctorId,
        status: "confirmed",
        date: { $gte: firstDayOfMonth, $lte: lastDayOfMonth }
      }),
      // Weekly Ratings
      Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            "review.rating": { $exists: true },
            "review.createdAt": { $gte: startOfWeek, $lte: endOfWeek }
          }
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$review.rating" },
            totalReviews: { $sum: 1 }
          }
        }
      ]),
      // Total Unique Patients (Lifetime)
      Appointment.distinct("patient", { doctor: doctorId }),
      Wallet.findOne({ doctor: doctorId }).select('current_balance')
    ]);

    // Extract rating data
    const ratingData = weeklyRatings[0] || { averageRating: null, totalReviews: 0 };
    const currentBalance = walletData ? walletData.current_balance : 0;
    const commissionRate = walletData ? walletData.commission_rate : 20;

    res.status(200).json({
      success: true,
      data: {
        confirmedAppointmentsThisMonth: confirmedAppointments,
        averageWeeklyRating: ratingData.averageRating ? ratingData.averageRating.toFixed(2) : null,
        totalReviewsThisWeek: ratingData.totalReviews,
        totalUniquePatients: uniquePatients.length,
        currentBalance: currentBalance,
        commissionRate: commissionRate
      },
      currentMonth: now.toLocaleString('default', { month: 'long' }),
      currentYear: now.getFullYear()
    });
  } catch (error) {
    console.error("Error fetching doctor dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

exports.rescheduleAppoinment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { appointmentId, newDate, newStartTime } = req.body;
    const userId = req.user.id;
    const doctorId = req.user.doctorId;
    const isDoctor = doctorId ? true : false;

    // Validate input
    if (!appointmentId || !newDate || !newStartTime) {
      return res.status(400).send({ error: "appointmentId, newDate, and newStartTime are required" });
    }

    const existingAppointment = await Appointment.findById(appointmentId).session(session);
    if (!existingAppointment) {
      return res.status(404).send({ error: `Appointment not found with ID: ${appointmentId}` });
    }

    // Check if the user has permission to reschedule
    if (isDoctor) {
      if (existingAppointment.doctor.toString() !== doctorId) {
        return res.status(403).send({ error: `You don't have permission to reschedule this appointment.` });
      }
    } else {
      if (existingAppointment.patient.toString() !== userId.toString()) {
        return res.status(403).send({ error: `You don't have permission to reschedule this appointment.` });
      }
    }

    // Check if the appointment can be rescheduled based on time constraints
    const now = new Date();
    const appointmentDateTime = new Date(existingAppointment.date);
    appointmentDateTime.setHours(parseInt(existingAppointment.slot.startTime.split(':')[0]));
    appointmentDateTime.setMinutes(parseInt(existingAppointment.slot.startTime.split(':')[1]));

    const timeDifference = (appointmentDateTime - now) / (1000 * 60 * 60); // in hours

    if (isDoctor) {
      if (timeDifference < 1) {
        return res.status(400).send({ error: "Doctors can only reschedule appointments at least 1 hour before the appointment time." });
      }
    } else {
      if (timeDifference < 20) {
        return res.status(400).send({ error: "Patients can only reschedule appointments at least 20 hours before the appointment time." });
      }
    }

    // Check doctor availability
    const availability = await Availability.findOne({ doctor: existingAppointment.doctor }).session(session);
    if (!availability) {
      throw new Error("Doctor availability not found");
    }

    const appointmentDate = new Date(newDate);
    if (isNaN(appointmentDate.getTime())) {
      return res.status(400).send({ error: "Invalid date format" });
    }

    // Check slot availability
    const availableSlots = availability.getAvailableSlotsForDate(appointmentDate);
    console.log(availableSlots);
    const type = existingAppointment.appointmentType;
    if (!availableSlots[type] || !availableSlots[type].slots.includes(newStartTime)) {
      return res.status(400).send({ error: `Slot ${newStartTime} not available for ${type} consultation` });
    }

    // Update the appointment
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      {
        $set: {
          date: appointmentDate,
          'slot.startTime': newStartTime,
          'slot.endTime': calculateEndTime(newStartTime, availability.slotDuration || 20),
          status: 'rescheduled'
        },
        $push: {
          rescheduledFrom: {
            startTime: existingAppointment.slot.startTime,
            endTime: existingAppointment.slot.endTime,
            previousDate: existingAppointment.date,
            rescheduleBy: isDoctor ? "doctor" : "patient"
          }
        }
      },
      { new: true, session }
    );

    // Send notification to the other party (patient if doctor rescheduled, or doctor if patient rescheduled)
    // Implementation depends on your notification system

    await session.commitTransaction();
    session.endSession();

    res.status(200).send({
      message: "Appointment rescheduled successfully",
      appointment: updatedAppointment
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.log("Error in rescheduleAppointment: ", error);
    res.status(500).send({ error: "Internal server error..." });
  }
};


// Helper function to get start and end of day
const getTodayRange = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { start: today, end: tomorrow };
};

exports.getDoctorAppointmentStatistics = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;

    console.log("doctorId: ", doctorId);

    const currentDate = new Date();
    const { start: todayStart, end: todayEnd } = getTodayRange();

    // Get today's appointments
    const todaysAppointments = await Appointment.countDocuments({
      doctor: doctorId,
      date: {
        $gte: todayStart,
        $lt: todayEnd
      }
    });

    // Get today's completed appointments
    const todaysCompleted = await Appointment.countDocuments({
      doctor: doctorId,
      status: 'completed',
      date: {
        $gte: todayStart,
        $lt: todayEnd
      }
    });

    // Get clinic appointments count
    const clinicAppointments = await Appointment.countDocuments({
      doctor: doctorId,
      appointmentType: 'clinic',
      status: { $in: ['confirmed', 'completed'] },
      date: { $gte: currentDate }
    });

    // Get online appointments count
    const onlineAppointments = await Appointment.countDocuments({
      doctor: doctorId,
      appointmentType: 'video',
      status: { $in: ['confirmed', 'completed'] },
      date: { $gte: currentDate }
    });

    // Get total confirmed upcoming appointments
    const confirmedUpcoming = await Appointment.countDocuments({
      doctor: doctorId,
      status: 'confirmed',
      date: { $gte: currentDate }
    });

    res.json({
      success: true,
      data: {
        todaysAppointments,
        todaysCompleted,
        clinicAppointments,
        onlineAppointments,
        confirmedUpcoming
      }
    });

  } catch (error) {
    console.log("Error in the getDoctorAppointmentStatistics, ", error);
    res.status(500).send({ error: "Internal server error..." });
  }
};

const getDateRanges = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed (0-11)

  // Today's range
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // Current year range
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear + 1, 0, 1);

  return { todayStart, todayEnd, yearStart, yearEnd, currentMonth, currentYear };
};

exports.getDoctorAppointmentsStaticsForGraph = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;

    const { todayStart, todayEnd, yearStart, yearEnd, currentMonth, currentYear } = getDateRanges();
    const currentDate = new Date();

    // Generate monthly ranges only up to current month
    const monthlyRanges = [];
    for (let month = 0; month <= currentMonth; month++) {
      const start = new Date(currentYear, month, 1);
      const end = new Date(currentYear, month + 1, 1);
      monthlyRanges.push({
        name: start.toLocaleString('default', { month: 'short' }),
        start,
        end
      });
    }

    // Get all statistics in parallel
    const [
      todaysAppointments,
      todaysCompleted,
      yearlyCompleted,
      clinicAppointments,
      onlineAppointments,
      confirmedUpcoming,
      monthlyStats,
      yearlyReviewStats
    ] = await Promise.all([
      // Today's appointments
      Appointment.countDocuments({
        doctor: doctorId,
        date: { $gte: todayStart, $lt: todayEnd }
      }),

      // Today's completed appointments
      Appointment.countDocuments({
        doctor: doctorId,
        status: 'completed',
        date: { $gte: todayStart, $lt: todayEnd }
      }),

      // Yearly completed consultations
      Appointment.countDocuments({
        doctor: doctorId,
        status: 'completed',
        date: { $gte: yearStart, $lt: yearEnd }
      }),

      // Upcoming clinic appointments
      Appointment.countDocuments({
        doctor: doctorId,
        appointmentType: 'clinic',
        status: { $in: ['confirmed', 'completed'] },
        date: { $gte: currentDate }
      }),

      // Upcoming online appointments
      Appointment.countDocuments({
        doctor: doctorId,
        appointmentType: 'video',
        status: { $in: ['confirmed', 'completed'] },
        date: { $gte: currentDate }
      }),

      // All confirmed upcoming
      Appointment.countDocuments({
        doctor: doctorId,
        status: 'confirmed',
        date: { $gte: currentDate }
      }),

      // Monthly completed statistics for current year (up to current month)
      Promise.all(
        monthlyRanges.map(month =>
          Appointment.aggregate([
            {
              $match: {
                doctor: new mongoose.Types.ObjectId(doctorId), // Fixed: added 'new'
                status: 'completed',
                date: { $gte: month.start, $lt: month.end }
              }
            },
            {
              $facet: {
                appointmentTypes: [
                  {
                    $group: {
                      _id: '$appointmentType',
                      count: { $sum: 1 }
                    }
                  },
                  {
                    $project: {
                      _id: 0,
                      type: '$_id',
                      count: 1
                    }
                  }
                ],
                reviews: [
                  {
                    $match: {
                      'review.rating': { $exists: true }
                    }
                  },
                  {
                    $group: {
                      _id: null,
                      averageRating: { $avg: '$review.rating' },
                      totalReviews: { $sum: 1 },
                      waitingTimeAvg: { $avg: '$review.aspects.waitingTime' },
                      knowledgeAvg: { $avg: '$review.aspects.doctorKnowledge' }
                    }
                  }
                ]
              }
            }
          ]).then(results => {
            const appointmentData = results[0]?.appointmentTypes || [];
            const reviewData = results[0]?.reviews?.[0] || {};

            const clinic = appointmentData.find(r => r.type === 'clinic')?.count || 0;
            const video = appointmentData.find(r => r.type === 'video')?.count || 0;

            return {
              month: month.name,
              appointments: {
                completedClinic: clinic,
                completedVideo: video,
                completedTotal: clinic + video
              },
              reviews: {
                averageRating: reviewData.averageRating ? parseFloat(reviewData.averageRating.toFixed(1)) : 0,
                totalReviews: reviewData.totalReviews || 0,
                waitingTimeAvg: reviewData.waitingTimeAvg ? parseFloat(reviewData.waitingTimeAvg.toFixed(1)) : 0,
                knowledgeAvg: reviewData.knowledgeAvg ? parseFloat(reviewData.knowledgeAvg.toFixed(1)) : 0
              }
            };
          })
        )
      ),

      // Yearly review statistics
      Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId), // Fixed: added 'new'
            status: 'completed',
            'review.rating': { $exists: true },
            date: { $gte: yearStart, $lt: yearEnd }
          }
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$review.rating' },
            totalReviews: { $sum: 1 },
            waitingTimeAvg: { $avg: '$review.aspects.waitingTime' },
            knowledgeAvg: { $avg: '$review.aspects.doctorKnowledge' }
          }
        }
      ])
    ]);

    const yearlyReviewData = yearlyReviewStats[0] || {};

    res.json({
      success: true,
      data: {
        todaysStats: {
          total: todaysAppointments,
          completed: todaysCompleted
        },
        yearlyStats: {
          completedConsultations: yearlyCompleted,
          reviews: {
            averageRating: yearlyReviewData.averageRating ? parseFloat(yearlyReviewData.averageRating.toFixed(1)) : 0,
            totalReviews: yearlyReviewData.totalReviews || 0,
            waitingTimeAvg: yearlyReviewData.waitingTimeAvg ? parseFloat(yearlyReviewData.waitingTimeAvg.toFixed(1)) : 0,
            knowledgeAvg: yearlyReviewData.knowledgeAvg ? parseFloat(yearlyReviewData.knowledgeAvg.toFixed(1)) : 0
          }
        },
        upcomingStats: {
          clinic: clinicAppointments,
          video: onlineAppointments,
          confirmed: confirmedUpcoming
        },
        monthlyStats: monthlyStats
      }
    });

  } catch (error) {
    console.log("Error in getDoctorAppointmentsStaticsForGraph: ", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
};

exports.getCombinedAppointments = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const currentDate = new Date();

    // Today's date range
    const todayStart = new Date(currentDate);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Common population options
    const patientPopulate = {
      path: 'patient',
      select: 'name email phone gender dateOfBirth profilePicture'
    };

    // Fetch all data in parallel
    const [
      todaysAppointments,
      todaysCompleted,
      upcomingAppointments,
      previousAppointments
    ] = await Promise.all([
      // Today's appointments
      Appointment.find({
        doctor: doctorId,
        date: { $gte: todayStart, $lt: todayEnd }
      })
        .select("-reminders")
        .populate(patientPopulate)
        .sort({ date: 1, 'slot.startTime': 1 }),

      // Today's completed appointments
      Appointment.find({
        doctor: doctorId,
        status: 'completed',
        date: { $gte: todayStart, $lt: todayEnd }
      })
        .select("-reminders")
        .populate(patientPopulate)
        .populate('prescription')
        .sort({ date: 1, 'slot.startTime': 1 }),

      // Upcoming appointments
      Appointment.find({
        doctor: doctorId,
        status: 'confirmed',
        date: { $gte: currentDate }
      })
        .select("-reminders")
        .populate(patientPopulate)
        .sort({ date: 1, 'slot.startTime': 1 }),

      // Previous appointments
      Appointment.find({
        doctor: doctorId,
        status: 'completed',
        date: { $lt: currentDate }
      })
        .select("-reminders")
        .populate(patientPopulate)
        .populate('prescription')
        .populate('medicalRecords')
        .sort({ date: -1, 'slot.startTime': -1 })
        .limit(100)
    ]);

    res.json({
      success: true,
      data: {
        today: {
          count: todaysAppointments.length,
          appointments: todaysAppointments
        },
        todayCompleted: {
          count: todaysCompleted.length,
          appointments: todaysCompleted
        },
        upcoming: {
          count: upcomingAppointments.length,
          appointments: upcomingAppointments
        },
        previous: {
          count: previousAppointments.length,
          appointments: previousAppointments
        },
        stats: {
          todaysTotal: todaysAppointments.length,
          todaysCompleted: todaysCompleted.length,
          upcoming: upcomingAppointments.length,
          previous: previousAppointments.length
        }
      }
    });

  } catch (error) {
    console.error("Error fetching combined appointments:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
};


// @desc    Get comprehensive doctor statistics with monthly breakdowns
// @route   GET /doctor/statistics-detailed
// @access  Private/Doctor
exports.getDoctorStatisticsDetailed = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    // Generate monthly ranges for current year (up to current month)
    const monthlyRanges = Array.from({ length: currentMonth + 1 }, (_, i) => {
      const start = new Date(currentYear, i, 1);
      const end = new Date(currentYear, i + 1, 1);
      return {
        name: start.toLocaleString('default', { month: 'short' }),
        monthNumber: i + 1,
        start,
        end
      };
    });

    // Main aggregation pipelines
    const [
      consultationStats,
      patientStats,
      genderStats
    ] = await Promise.all([
      // Consultation statistics (yearly and monthly)
      Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            status: 'completed',
            date: { $gte: new Date(currentYear, 0, 1) }
          }
        },
        {
          $facet: {
            yearly: [
              {
                $group: {
                  _id: '$appointmentType',
                  count: { $sum: 1 }
                }
              }
            ],
            monthly: [
              {
                $addFields: {
                  month: { $month: '$date' }
                }
              },
              {
                $group: {
                  _id: {
                    month: '$month',
                    type: '$appointmentType'
                  },
                  count: { $sum: 1 }
                }
              },
              {
                $group: {
                  _id: '$_id.month',
                  types: {
                    $push: {
                      type: '$_id.type',
                      count: '$count'
                    }
                  },
                  total: { $sum: '$count' }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ]),

      // Patient statistics (new vs return)
      Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            status: 'completed'
          }
        },
        {
          $group: {
            _id: '$patient',
            firstVisit: { $min: '$date' },
            visitCount: { $sum: 1 },
            monthsVisited: { $addToSet: { $month: '$date' } }
          }
        },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalPatients: { $sum: 1 },
                  newPatients: {
                    $sum: { $cond: [{ $eq: ['$visitCount', 1] }, 1, 0] }
                  },
                  returnPatients: {
                    $sum: { $cond: [{ $gt: ['$visitCount', 1] }, 1, 0] }
                  }
                }
              }
            ],
            monthly: [
              {
                $unwind: '$monthsVisited'
              },
              {
                $group: {
                  _id: '$monthsVisited',
                  newPatients: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: [{ $month: '$firstVisit' }, '$monthsVisited'] },
                            { $eq: ['$visitCount', 1] }
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  },
                  returnPatients: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: [{ $month: '$firstVisit' }, '$monthsVisited'] },
                            { $gt: ['$visitCount', 1] }
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ]),

      // Gender statistics
      Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            status: 'completed'
          }
        },
        {
          $lookup: {
            from: 'patients',
            localField: 'patient',
            foreignField: '_id',
            as: 'patientData'
          }
        },
        {
          $unwind: '$patientData'
        },
        {
          $addFields: {
            month: { $month: '$date' }
          }
        },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: '$patientData.gender',
                  count: { $sum: 1 }
                }
              }
            ],
            monthly: [
              {
                $group: {
                  _id: {
                    month: '$month',
                    gender: '$patientData.gender'
                  },
                  count: { $sum: 1 }
                }
              },
              {
                $group: {
                  _id: '$_id.month',
                  genders: {
                    $push: {
                      gender: '$_id.gender',
                      count: '$count'
                    }
                  }
                }
              },
              { $sort: { _id: 1 } }
            ]
          }
        }
      ])
    ]);

    // Process consultation data
    const yearlyConsultations = {
      online: consultationStats[0].yearly.find(x => x._id === 'video')?.count || 0,
      offline: consultationStats[0].yearly.find(x => x._id === 'clinic')?.count || 0,
      total: consultationStats[0].yearly.reduce((sum, x) => sum + x.count, 0)
    };

    const monthlyConsultations = monthlyRanges.map(month => {
      const monthData = consultationStats[0].monthly.find(m => m._id === month.monthNumber) || { types: [], total: 0 };
      return {
        month: month.name,
        online: monthData.types.find(t => t.type === 'video')?.count || 0,
        offline: monthData.types.find(t => t.type === 'clinic')?.count || 0,
        total: monthData.total
      };
    });

    // Process patient data
    const patientTotals = patientStats[0].totals[0] || {
      totalPatients: 0,
      newPatients: 0,
      returnPatients: 0
    };

    const monthlyPatients = monthlyRanges.map(month => {
      const monthData = patientStats[0].monthly.find(m => m._id === month.monthNumber) || {
        newPatients: 0,
        returnPatients: 0
      };
      return {
        month: month.name,
        newPatients: monthData.newPatients,
        returnPatients: monthData.returnPatients,
        total: monthData.newPatients + monthData.returnPatients
      };
    });

    // Process gender data
    const genderTotals = {
      male: genderStats[0].totals.find(g => g._id === 'male')?.count || 0,
      female: genderStats[0].totals.find(g => g._id === 'female')?.count || 0,
      total: genderStats[0].totals.reduce((sum, g) => sum + g.count, 0)
    };

    const monthlyGender = monthlyRanges.map(month => {
      const monthData = genderStats[0].monthly.find(m => m._id === month.monthNumber) || { genders: [] };
      return {
        month: month.name,
        male: monthData.genders.find(g => g.gender === 'male')?.count || 0,
        female: monthData.genders.find(g => g.gender === 'female')?.count || 0,
        total: monthData.genders.reduce((sum, g) => sum + g.count, 0)
      };
    });

    res.json({
      success: true,
      data: {
        consultations: {
          yearly: yearlyConsultations,
          monthly: monthlyConsultations
        },
        patients: {
          totals: {
            new: patientTotals.newPatients,
            return: patientTotals.returnPatients,
            total: patientTotals.totalPatients
          },
          monthly: monthlyPatients
        },
        gender: {
          totals: genderTotals,
          monthly: monthlyGender
        }
      }
    });

  } catch (error) {
    console.error("Error fetching detailed statistics:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
};

exports.getPatientFeedbackMetrics = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;

    const [genderMetrics, feedbackStats] = await Promise.all([
      // Gender-based metrics (wait time, treatment quality, staff friendliness)
      Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            status: 'completed',
            'review.aspects': { $exists: true }
          }
        },
        {
          $lookup: {
            from: 'patients', // Assuming your patient collection is named 'patients'
            localField: 'patient',
            foreignField: '_id',
            as: 'patient'
          }
        },
        {
          $unwind: '$patient'
        },
        {
          $group: {
            _id: '$patient.gender',
            count: { $sum: 1 },
            avgWaitTime: { $avg: '$review.aspects.waitingTime' },
            avgTreatmentQuality: { $avg: '$review.aspects.treatmentExplanation' },
            avgStaffFriendliness: { $avg: '$review.aspects.staffCourteousness' }
          }
        },
        {
          $project: {
            _id: 0,
            gender: '$_id',
            count: 1,
            avgWaitTime: { $round: ['$avgWaitTime', 1] },
            avgTreatmentQuality: { $round: ['$avgTreatmentQuality', 1] },
            avgStaffFriendliness: { $round: ['$avgStaffFriendliness', 1] }
          }
        }
      ]),

      // General feedback statistics
      Appointment.aggregate([
        {
          $match: {
            doctor: new mongoose.Types.ObjectId(doctorId),
            status: 'completed',
            'review.rating': { $exists: true }
          }
        },
        {
          $facet: {
            ratingDistribution: [
              {
                $group: {
                  _id: '$review.rating',
                  count: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ],
            feedbackCount: [
              { $count: 'total' }
            ],
            feedbackWithComments: [
              {
                $match: {
                  'review.feedback': { $exists: true, $ne: '' }
                }
              },
              { $count: 'count' }
            ],
            averageRating: [
              {
                $group: {
                  _id: null,
                  average: { $avg: '$review.rating' }
                }
              }
            ]
          }
        },
        {
          $project: {
            ratingDistribution: {
              $arrayToObject: {
                $map: {
                  input: '$ratingDistribution',
                  as: 'r',
                  in: {
                    k: { $toString: '$$r._id' },
                    v: '$$r.count'
                  }
                }
              }
            },
            totalFeedback: { $arrayElemAt: ['$feedbackCount.total', 0] },
            feedbackWithComments: { $arrayElemAt: ['$feedbackWithComments.count', 0] },
            averageRating: { $round: [{ $arrayElemAt: ['$averageRating.average', 0] }, 1] }
          }
        }
      ])
    ]);

    // Process gender metrics
    const genderResults = {
      male: genderMetrics.find(g => g.gender === 'male') || {
        gender: 'male',
        count: 0,
        avgWaitTime: 0,
        avgTreatmentQuality: 0,
        avgStaffFriendliness: 0
      },
      female: genderMetrics.find(g => g.gender === 'female') || {
        gender: 'female',
        count: 0,
        avgWaitTime: 0,
        avgTreatmentQuality: 0,
        avgStaffFriendliness: 0
      },
      other: genderMetrics.find(g => !['male', 'female'].includes(g.gender)) || {
        gender: 'other',
        count: 0,
        avgWaitTime: 0,
        avgTreatmentQuality: 0,
        avgStaffFriendliness: 0
      }
    };

    // Process feedback stats
    const feedbackResults = feedbackStats[0] || {
      ratingDistribution: {},
      totalFeedback: 0,
      feedbackWithComments: 0,
      averageRating: 0
    };

    res.json({
      success: true,
      data: {
        genderMetrics: genderResults,
        feedbackStats: feedbackResults
      }
    });

  } catch (error) {
    console.error("Error in the submitAppointmentReview:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
};

// @desc    Submit a review for a completed appointment
// @route   POST /appointments/:id/review
// @access  Private/Patient
exports.submitAppointmentReview = async (req, res, next) => {
  try {
    const appointmentId = req.params.id;
    const patientId = req.user._id;
    const {
      rating,
      feedback,
      aspects = {},
      isAnonymous = false
    } = req.body;

    // Validate input
    if (!rating || rating < 1 || rating > 5) {
      return res.status(404).send({
        success: false,
        message: 'Please provide a valid rating between 1 and 5'
      });
    }

    // Check if appointment exists and belongs to the patient
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: patientId,
      status: 'completed'
    });

    if (!appointment) {
      return res.status(404).send({
        success: false,
        message: 'Completed appointment not found or you are not authorized to review this appointment'
      });
    }

    // Check if review already exists
    // if (appointment.review) {
    //   return res.status(400).send({
    //     success: false,
    //     message: 'You have already submitted a review for this appointment'
    //   });
    // }

    // Validate aspects if provided
    const validAspects = {};
    const aspectFields = [
      'waitingTime',
      'staffCourteousness',
      'doctorKnowledge',
      'doctorFriendliness',
      'treatmentExplanation'
    ];

    aspectFields.forEach(field => {
      if (aspects[field] && aspects[field] >= 1 && aspects[field] <= 5) {
        validAspects[field] = aspects[field];
      }
    });

    // Create review object
    const review = {
      rating,
      feedback: feedback || undefined,
      aspects: validAspects,
      isAnonymous,
      createdAt: new Date()
    };

    // Update appointment with review
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      { review },
      { new: true, runValidators: true }
    ).populate('doctor', 'fullname specialty');

    // The post-save middleware will automatically update the doctor's average rating

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback!',
      data: {
        appointment: {
          id: updatedAppointment._id,
          date: updatedAppointment.date,
          doctor: updatedAppointment.doctor
        },
        review: {
          rating: updatedAppointment.review.rating,
          isAnonymous: updatedAppointment.review.isAnonymous,
          createdAt: updatedAppointment.review.createdAt
        }
      }
    });

  } catch (error) {
    console.error("Error fetching patient feedback metrics:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
};

// @desc    Get a patient's review for an appointment
// @route   GET /appointments/:id/review
// @access  Private/Patient
exports.getAppointmentReview = async (req, res, next) => {
  try {
    const appointmentId = req.params.id;
    const patientId = req.user._id;

    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: patientId,
      status: 'completed'
    }).select('review date doctor');

    if (!appointment) {
      throw new ErrorHandler(404, 'Appointment not found');
    }

    if (!appointment.review) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No review submitted for this appointment'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        review: appointment.review,
        appointmentDate: appointment.date
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Update a patient's review
// @route   PUT /appointments/:id/review
// @access  Private/Patient
exports.updateAppointmentReview = async (req, res, next) => {
  try {
    const appointmentId = req.params.id;
    const patientId = req.user._id;
    const updateData = req.body;

    // Check if appointment exists and has a review
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: patientId,
      status: 'completed',
      review: { $exists: true }
    });

    if (!appointment) {
      return res.status(404).send({ error: 'Review not found or you are not authorized to update this review' });
    }

    // Validate update data
    const allowedUpdates = [
      'rating',
      'feedback',
      'aspects.waitingTime',
      'aspects.staffCourteousness',
      'aspects.doctorKnowledge',
      'aspects.doctorFriendliness',
      'aspects.treatmentExplanation'
    ];

    const updates = {};
    for (const field in updateData) {
      if (allowedUpdates.includes(field)) {
        updates[`review.${field}`] = updateData[field];
      } else if (field === 'aspects') {
        for (const aspect in updateData.aspects) {
          if (allowedUpdates.includes(`aspects.${aspect}`)) {
            updates[`review.aspects.${aspect}`] = updateData.aspects[aspect];
          }
        }
      }
    }

    // Add updatedAt timestamp
    updates['review.updatedAt'] = new Date();

    if (Object.keys(updates).length === 0) {
      throw new ErrorHandler(400, 'No valid fields to update');
    }

    // Update the review
    const updatedAppointment = await Appointment.findByIdAndUpdate(
      appointmentId,
      updates,
      { new: true, runValidators: true }
    );

    // Update doctor's average rating
    if (updates['review.rating']) {
      const doctor = await Doctor.findById(updatedAppointment.doctor);
      if (doctor) {
        const reviews = await Appointment.find({
          doctor: doctor._id,
          'review.rating': { $exists: true }
        });

        const totalRatings = reviews.length;
        const averageRating = reviews.reduce((sum, appt) => sum + appt.review.rating, 0) / totalRatings;

        await Doctor.findByIdAndUpdate(doctor._id, {
          averageRating,
          totalRatings
        });
      }
    }

    res.status(200).json({
      success: true,
      message: 'Review updated successfully',
      data: {
        review: updatedAppointment.review
      }
    });

  } catch (error) {
    next(error);
  }
};


exports.getDoctorRecentActivities = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;

    if (!doctorId) {
      return res.status(400).json({ success: false, message: "Doctor ID is required" });
    }

    // Fetch latest updated appointments for this doctor
    const recentAppointments = await Appointment.find({ doctor: doctorId })
      .sort({ updatedAt: -1 }) // latest updated first
      .limit(20) // adjust limit as needed
      .populate("patient", "fullName");

    const activities = [];

    recentAppointments.forEach((appointment) => {
      let latestActivity = null;

      // Prioritize what you consider "last updated" activity
      if (appointment.status === "confirmed") {
        latestActivity = "Appointment confirmed";
      }

      if (appointment.prescription && appointment.prescription.medicines.length > 0) {
        latestActivity = "Prescription updated";
      }

      if (appointment.medicalRecords && appointment.medicalRecords.length > 0) {
        latestActivity = "Medical records updated";
      }

      if (appointment.rescheduledFrom !== null) {
        latestActivity = "appointment is rescheduled";
      }

      if (latestActivity) {
        activities.push({
          _id: appointment._id,
          patientId: appointment.patient?._id || null,
          patientName: appointment.patient?.fullName || null,
          description: latestActivity,
          timestamp: appointment.updatedAt
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: activities
    });

  } catch (error) {
    console.error("Error fetching doctor recent activities:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch recent activities"
    });
  }
};


const calculateAgeGroups = (patients) => {
  const ageGroups = {
    '0-18': 0,
    '19-35': 0,
    '36-50': 0,
    '51-65': 0,
    '65+': 0
  };

  patients.forEach(patient => {
    const age = patient.age || 30; // Default to 30 if age not available
    if (age <= 18) ageGroups['0-18']++;
    else if (age <= 35) ageGroups['19-35']++;
    else if (age <= 50) ageGroups['36-50']++;
    else if (age <= 65) ageGroups['51-65']++;
    else ageGroups['65+']++;
  });

  // Convert to percentage
  const total = patients.length || 1;
  return Object.keys(ageGroups).map(group => ({
    group,
    value: Math.round((ageGroups[group] / total) * 100)
  }));
};

// Helper function to calculate top conditions
const calculateTopConditions = (appointments) => {
  const conditions = {};

  appointments.forEach(appt => {
    if (appt.reason) {
      const condition = appt.reason.split(',')[0].trim(); // Take primary reason
      conditions[condition] = (conditions[condition] || 0) + 1;
    }
  });

  return Object.entries(conditions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([condition, count]) => ({ condition, count }));
};

// Main dashboard endpoint
exports.dashboard = async (req, res) => {
  try {
    const { doctorId } = req.user;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({ error: 'Invalid doctor ID' });
    }

    // Get all appointments for this doctor
    const appointments = await Appointment.find({ doctor: doctorId })
      .populate('patient', 'name age gender')
      .populate('review');

    if (!appointments || appointments.length === 0) {
      return res.status(404).json({ error: 'No appointments found for this doctor' });
    }

    // Filter out patients with populated data
    const patients = appointments
      .map(appt => appt.patient)
      .filter(patient => patient && typeof patient === 'object');

    // Calculate monthly data (last 6 months)
    const monthlyData = [];
    const now = new Date();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();

      const monthAppts = appointments.filter(appt => {
        const apptDate = new Date(appt.date);
        return apptDate.getMonth() === date.getMonth() &&
          apptDate.getFullYear() === year;
      });

      const online = monthAppts.filter(a => a.appointmentType === 'video').length;
      const offline = monthAppts.filter(a => a.appointmentType === 'clinic').length;

      // Calculate satisfaction from reviews
      const monthReviews = monthAppts.filter(a => a.review).map(a => a.review);
      const validMonthReviews = monthReviews.filter(r => typeof r.rating === 'number' && r.rating !== null);

      const satisfaction = validMonthReviews.length > 0
        ? Math.round(
          validMonthReviews.reduce((sum, r) => sum + r.rating, 0) /
          validMonthReviews.length * 20
        )
        : 90; // Default if no valid reviews

      // Calculate growth (simplified - compare to previous month)
      let growth = 0;
      if (i < 5 && monthlyData.length > 0) {
        const prevTotal = monthlyData[monthlyData.length - 1].online + monthlyData[monthlyData.length - 1].offline;
        const currTotal = online + offline;
        growth = prevTotal > 0 ? Math.round(((currTotal - prevTotal) / prevTotal) * 100) : 100;
      }

      monthlyData.push({
        month,
        online,
        offline,
        growth,
        satisfaction,
        duration: 30 // Default duration
      });
    }

    // Calculate quarterly data
    const quarterlyData = [];
    for (let q = 1; q <= 4; q++) {
      let startMonth, endMonth;
      if (q === 1) { startMonth = 0; endMonth = 2; }
      else if (q === 2) { startMonth = 3; endMonth = 5; }
      else if (q === 3) { startMonth = 6; endMonth = 8; }
      else { startMonth = 9; endMonth = 11; }

      const quarterAppts = appointments.filter(appt => {
        const apptDate = new Date(appt.date);
        const apptMonth = apptDate.getMonth();
        return apptMonth >= startMonth && apptMonth <= endMonth &&
          apptDate.getFullYear() === now.getFullYear();
      });

      const online = quarterAppts.filter(a => a.appointmentType === 'video').length;
      const offline = quarterAppts.filter(a => a.appointmentType === 'clinic').length;

      // Calculate satisfaction
      const quarterReviews = quarterAppts.filter(a => a.review).map(a => a.review);
      const validQuarterReviews = quarterReviews.filter(r => typeof r.rating === 'number');

      const satisfaction = validQuarterReviews.length > 0
        ? Math.round(
          validQuarterReviews.reduce((sum, r) => sum + r.rating, 0) /
          validQuarterReviews.length * 20
        )
        : 90;

      // Calculate growth (compare to previous quarter)
      let growth = 0;
      if (q > 1 && quarterlyData.length > 0) {
        const prevTotal = quarterlyData[quarterlyData.length - 1].online + quarterlyData[quarterlyData.length - 1].offline;
        const currTotal = online + offline;
        growth = prevTotal > 0 ? Math.round(((currTotal - prevTotal) / prevTotal) * 100) : 100;
      }

      quarterlyData.push({
        quarter: `Q${q}`,
        online,
        offline,
        growth,
        satisfaction
      });
    }

    // Calculate totals
    const totalOnline = appointments.filter(a => a.appointmentType === 'video').length;
    const totalOffline = appointments.filter(a => a.appointmentType === 'clinic').length;

    // Calculate overall satisfaction from all reviews
    const allReviews = appointments.filter(a => a.review).map(a => a.review);
    console.log(allReviews);

    const avgSatisfaction = allReviews.length > 0
      ? Math.round(
        allReviews
          .filter(r => r.rating !== undefined && r.rating !== null) // Filter out null/undefined ratings
          .reduce((sum, r) => sum + r.rating, 0) /
        allReviews.filter(r => r.rating !== undefined && r.rating !== null).length * 20
      )
      : 90;

    // Calculate average growth (last 3 months vs previous 3 months)
    let avgGrowth = 0;
    if (monthlyData.length >= 6) {
      const recent = monthlyData.slice(-3).reduce((sum, m) => sum + m.online + m.offline, 0);
      const previous = monthlyData.slice(-6, -3).reduce((sum, m) => sum + m.online + m.offline, 0);
      avgGrowth = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : 100;
    }

    // Prepare response
    const response = {
      monthly: monthlyData.slice(-6), // Last 6 months
      quarterly: quarterlyData,
      patient: {
        age: calculateAgeGroups(patients),
        topConditions: calculateTopConditions(appointments)
      },
      totals: {
        online: totalOnline,
        offline: totalOffline,
        growth: avgGrowth,
        satisfaction: avgSatisfaction
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
}


// Get all appointments with pagination and filtering
exports.getAppointmentsByPagination = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const { page = 1, limit = 10, status, type, dateRange, sortBy = 'date', sortOrder = 'asc' } = req.query;

    // Base query
    let query = { doctor: new mongoose.Types.ObjectId(doctorId) };

    // Status filter
    if (status) {
      query.status = { $in: status.split(',') };
    }

    // Type filter
    if (type) {
      query.appointmentType = { $in: type.split(',') };
    }

    // Date range filter
    if (dateRange) {
      const [startDate, endDate] = dateRange.split(',');
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const appointments = await Appointment.find(query)
      .populate('patient', 'fullName profilePhoto')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const total = await Appointment.countDocuments(query);

    // Transform data for frontend
    const transformed = appointments.map(appt => ({
      id: appt._id,
      patient: appt.patient?.fullName || 'Patient',
      time: moment(appt.date).format('hh:mm A'),
      date: moment(appt.date).format('MMM D'),
      type: appt.appointmentType === 'video' ? 'Online' : 'In-Person',
      status: appt.status,
      avatar: appt.patient?.profilePhoto || 'https://randomuser.me/api/portraits/lego/1.jpg',
      notes: appt.reason || 'No notes available',
      urgency: appt.urgency || 'Medium',
      appointmentDate: appt.date,
      slot: appt.slot
    }));

    // Get all counts in parallel for better performance
    const [
      totalAppointments,
      todayAppointments,
      completedToday,
      upcomingToday,
      upcomingAppointments,
      pastAppointments,
      satisfactionRate
    ] = await Promise.all([
      // Total appointments
      Appointment.countDocuments({ doctor: new mongoose.Types.ObjectId(doctorId) }),

      // Today's appointments
      Appointment.countDocuments({
        doctor: new mongoose.Types.ObjectId(doctorId),
        date: {
          $gte: moment().startOf('day').toDate(),
          $lte: moment().endOf('day').toDate()
        }
      }),

      // Completed today
      Appointment.countDocuments({
        doctor: new mongoose.Types.ObjectId(doctorId),
        status: 'completed',
        date: {
          $gte: moment().startOf('day').toDate(),
          $lte: moment().endOf('day').toDate()
        }
      }),

      // Upcoming today
      Appointment.countDocuments({
        doctor: new mongoose.Types.ObjectId(doctorId),
        status: { $in: ['pending', 'confirmed'] },
        date: {
          $gte: moment().startOf('day').toDate(),
          $lte: moment().endOf('day').toDate()
        }
      }),

      // All upcoming appointments (future dates)
      Appointment.countDocuments({
        doctor: new mongoose.Types.ObjectId(doctorId),
        status: { $in: ['pending', 'confirmed'] },
        date: { $gt: moment().endOf('day').toDate() }
      }),

      // Past appointments (completed or cancelled)
      Appointment.countDocuments({
        doctor: new mongoose.Types.ObjectId(doctorId),
        status: { $in: ['completed', 'cancelled', 'no_show'] },
        date: { $lt: moment().startOf('day').toDate() }
      }),

      // Satisfaction rate
      calculateSatisfactionRate(doctorId)
    ]);

    res.json({
      success: true,
      data: {
        appointments: transformed,
        stats: {
          totalAppointments,
          todayAppointments,
          completedToday,
          upcomingToday,
          upcomingAppointments,
          pastAppointments,
          satisfactionRate
        },
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch appointments'
    });
  }
};

// Helper function to calculate satisfaction rate (unchanged)
async function calculateSatisfactionRate(doctorId) {
  try {
    const result = await Appointment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          'review.rating': { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$review.rating' },
          count: { $sum: 1 }
        }
      }
    ]);

    if (result.length > 0 && result[0].averageRating) {
      return Math.round((result[0].averageRating / 5) * 100);
    }
    return 95; // Default value if no reviews
  } catch (error) {
    console.error('Error calculating satisfaction rate:', error);
    return 95; // Return default value on error
  }
}



exports.getLastSixWeeksAppointmentsTrend = async (req, res) => {
  try {
    const { doctorId } = req.user;

    if (!doctorId) {
      return res.status(400).json({ message: "Doctor ID is required" });
    }

    // Get current date ranges
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    currentMonthEnd.setHours(23, 59, 59, 999);

    // Get previous month date ranges
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    prevMonthEnd.setHours(23, 59, 59, 999);

    // 1. Get total appointment count
    const totalAppointments = await Appointment.countDocuments({ doctor: doctorId });

    // 2. Get current and previous month appointment counts
    const [monthAppointments, prevMonthAppointments] = await Promise.all([
      Appointment.countDocuments({
        doctor: doctorId,
        date: { $gte: currentMonthStart, $lte: currentMonthEnd }
      }),
      Appointment.countDocuments({
        doctor: doctorId,
        date: { $gte: prevMonthStart, $lte: prevMonthEnd }
      })
    ]);

    // 3. Calculate monthly growth rate
    let monthlyGrowthRate = "0%";
    if (prevMonthAppointments > 0) {
      const growth = ((monthAppointments - prevMonthAppointments) / prevMonthAppointments) * 100;
      monthlyGrowthRate = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
    } else if (monthAppointments > 0) {
      monthlyGrowthRate = "+100%"; // Handle case where previous month had 0 appointments
    }

    // 4. Get weekly breakdown for the last 6 weeks
    const sixWeeksAgo = new Date(now);
    sixWeeksAgo.setDate(now.getDate() - 42); // 6 weeks * 7 days

    const weeklyAppointments = await Appointment.aggregate([
      {
        $match: {
          doctor: doctorId,
          date: { $gte: sixWeeksAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" },
            week: { $week: "$date" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.week": 1 }
      },
      {
        $limit: 6 // Get last 6 weeks
      }
    ]);

    // Format weekly data
    const appointmentsData = weeklyAppointments.map((week, index) => ({
      week: `Week ${index + 1}`,
      count: week.count
    }));

    // 5. Get additional stats
    const [statusCounts, appointmentTypes] = await Promise.all([
      Appointment.aggregate([
        { $match: { doctor: doctorId } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Appointment.aggregate([
        { $match: { doctor: doctorId } },
        { $group: { _id: "$appointmentType", count: { $sum: 1 } } }
      ])
    ]);

    // Format response
    const response = {
      totalAppointments,
      currentMonthAppointments: monthAppointments,
      monthlyGrowthRate, // Added growth rate
      appointmentsData,
      statusDistribution: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      typeDistribution: appointmentTypes.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {})
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching appointment statistics:", error);
    res.status(500).json({ message: "Error fetching appointment statistics" });
  }
};






