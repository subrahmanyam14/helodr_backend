const mongoose = require('mongoose');
const Availability = require('../models/Availability');
const Appointment = require('../models/Appointment');
const Doctor = require("../models/Doctor");
const { validationResult } = require('express-validator');

// GET /api/availability/doctor/:doctorId/calendar?year=2025&month=5
exports.getDoctorCalendar = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { year, month } = req.query;

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, parseInt(month) + 1, 0);

    const availability = await Availability.findOne({
      doctor: doctorId,
      isActive: true,
      $or: [
        { effectiveTo: { $exists: false } },
        { effectiveTo: { $gte: startDate } }
      ],
      effectiveFrom: { $lte: endDate }
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'No availability found for this doctor'
      });
    }

    const calendarData = {};
    const daysInMonth = endDate.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month, day);
      const slots = availability.getAvailableSlotsForDate(currentDate);

      // Get booked appointments for this day
      const bookedAppointments = await Appointment.find({
        doctor: doctorId,
        date: {
          $gte: new Date(year, month, day, 0, 0, 0),
          $lt: new Date(year, month, day, 23, 59, 59)
        },
        status: { $in: ['pending', 'confirmed'] }
      }).select('slot appointmentType patient');

      const bookedVideoSlots = bookedAppointments
        .filter(apt => apt.appointmentType === 'video')
        .map(apt => ({
          time: apt.slot.startTime,
          id: `${day}-${apt.slot.startTime}-video`,
          type: 'video',
          appointmentId: apt._id,
          patientId: apt.patient
        }));

      const bookedClinicSlots = bookedAppointments
        .filter(apt => apt.appointmentType === 'clinic')
        .map(apt => ({
          time: apt.slot.startTime,
          id: `${day}-${apt.slot.startTime}-clinic`,
          type: 'clinic',
          appointmentId: apt._id,
          patientId: apt.patient
        }));

      const availableVideoSlots = slots.video.slots.map(time => ({
        time,
        id: `${day}-${time}-video`,
        type: 'video',
        fee: slots.video.fee
      }));

      const availableClinicSlots = slots.clinic.slots.map(time => ({
        time,
        id: `${day}-${time}-clinic`,
        type: 'clinic',
        fee: slots.clinic.fee
      }));

      const totalAvailable = availableVideoSlots.length + availableClinicSlots.length;
      const totalBooked = bookedVideoSlots.length + bookedClinicSlots.length;
      const total = totalAvailable + totalBooked;

      calendarData[day] = {
        total,
        occupied: totalBooked,
        available: totalAvailable,
        availableVideoSlots,
        availableClinicSlots,
        bookedVideoSlots,
        bookedClinicSlots,
        status: totalAvailable === 0 ? 'full' : totalAvailable <= 3 ? 'limited' : 'available'
      };
    }

    res.json({
      success: true,
      data: calendarData,
      message: 'Calendar data fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching calendar data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar data',
      error: error.message
    });
  }
};

// GET /api/availability/doctor/:doctorId/today
exports.getTodaySchedule = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const today = new Date();

    const todayAppointments = await Appointment.find({
      doctor: doctorId,
      date: {
        $gte: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0),
        $lt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
      },
      status: { $in: ['pending', 'confirmed'] }
    })
      .populate('patient', 'firstName lastName')
      .select('slot appointmentType patient status')
      .sort({ 'slot.startTime': 1 });

    const schedule = todayAppointments.map(apt => ({
      time: apt.slot.startTime,
      type: apt.appointmentType,
      patient: apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : 'Unknown',
      status: apt.status
    }));

    res.json({
      success: true,
      data: schedule,
      message: 'Today\'s schedule fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching today\'s schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today\'s schedule',
      error: error.message
    });
  }
};

// GET /api/availability/doctor/:doctorId/stats?year=2025&month=5
exports.getMonthlyStats = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { year, month } = req.query;

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, parseInt(month) + 1, 0);

    const appointments = await Appointment.find({
      doctor: doctorId,
      date: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'confirmed', 'completed'] }
    });

    const stats = {
      totalAppointments: appointments.length,
      videoConsultations: appointments.filter(apt => apt.appointmentType === 'video').length,
      clinicConsultations: appointments.filter(apt => apt.appointmentType === 'clinic').length,
      completedAppointments: appointments.filter(apt => apt.status === 'completed').length
    };

    res.json({
      success: true,
      data: stats,
      message: 'Monthly stats fetched successfully'
    });

  } catch (error) {
    console.error('Error fetching monthly stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monthly stats',
      error: error.message
    });
  }
};

// Helper function to get status color based on availability percentage
const getStatusColor = (availableSlots, totalSlots) => {
  if (totalSlots === 0) return 'red'; // No slots configured

  const percentage = (availableSlots / totalSlots) * 100;

  if (percentage >= 80) return 'green';
  if (percentage >= 60) return 'yellow';
  if (percentage >= 30) return 'orange';
  return 'red';
};

// Utility function to create date in local timezone
const createLocalDate = (dateString) => {
  if (!dateString) {
    // Get today's date in local timezone
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  // Parse YYYY-MM-DD format in local timezone
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day); // month is 0-indexed
};

// Utility function to format date as YYYY-MM-DD
const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Utility function to add days safely
const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// Utility function to get start of week (Sunday)
const getStartOfWeek = (date) => {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  result.setDate(result.getDate() - dayOfWeek);
  return result;
};

// Utility function to get start and end of month
const getMonthBounds = (date) => {
  const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { startDate, endDate };
};

// Helper function to get date range
const getDateRange = (view, dateString) => {
  const baseDate = createLocalDate(dateString);
  let startDate, endDate;

  switch (view) {
    case 'day':
      startDate = new Date(baseDate);
      endDate = new Date(baseDate);
      break;
    case 'week':
      startDate = getStartOfWeek(baseDate);
      endDate = addDays(startDate, 6);
      break;
    case 'month':
      ({ startDate, endDate } = getMonthBounds(baseDate));
      break;
    default:
      throw new Error('Invalid view type');
  }

  return { startDate, endDate };
};

// Helper function to get today's date string in local timezone
const getTodayString = () => {
  const today = new Date();
  return formatDate(today);
};

exports.getAvailabilityStatus = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { view = 'day', date = getTodayString() } = req.query;

    // Find active availability for the doctor
    const availability = await Availability.findOne({
      doctor: doctorId,
      isActive: true,
      $or: [
        { effectiveTo: { $exists: false } },
        { effectiveTo: { $gte: new Date() } }
      ]
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'No availability configuration found for this doctor'
      });
    }

    const { startDate, endDate } = getDateRange(view, date);
    const result = {
      view,
      currentDate: date,
      data: []
    };

    if (view === 'day') {
      // Day view - show hourly slots
      const targetDate = createLocalDate(date);
      const dayOfWeek = getDayName(targetDate);

      const dayAvailability = availability.getAvailableSlotsForDate(targetDate);

      // Get all possible time slots for the day
      const daySchedule = availability.schedule.find(s => s.day === dayOfWeek);
      let totalSlots = 0;
      let availableSlots = 0;

      if (daySchedule) {
        daySchedule.shifts.forEach(shift => {
          if (shift.isActive) {
            const slots = availability.generateTimeSlots(shift.startTime, shift.endTime);
            totalSlots += slots.length * shift.consultationTypes.length;
          }
        });
      }

      // Count available slots
      availableSlots = dayAvailability.clinic.slots.length + dayAvailability.video.slots.length;

      result.data = [{
        date: formatDate(targetDate),
        day: dayOfWeek,
        status: getStatusColor(availableSlots, totalSlots),
        availableSlots,
        totalSlots,
        slots: {
          clinic: dayAvailability.clinic,
          video: dayAvailability.video
        }
      }];

    } else if (view === 'week') {
      // Week view - show each day of the week
      for (let i = 0; i < 7; i++) {
        const currentDate = addDays(startDate, i);
        const dayOfWeek = getDayName(currentDate);
        const dayAvailability = availability.getAvailableSlotsForDate(currentDate);

        // Calculate total possible slots for this day
        const daySchedule = availability.schedule.find(s => s.day === dayOfWeek);
        let totalSlots = 0;

        if (daySchedule) {
          daySchedule.shifts.forEach(shift => {
            if (shift.isActive) {
              const slots = availability.generateTimeSlots(shift.startTime, shift.endTime);
              totalSlots += slots.length * shift.consultationTypes.length;
            }
          });
        }

        const availableSlots = dayAvailability.clinic.slots.length + dayAvailability.video.slots.length;

        result.data.push({
          date: formatDate(currentDate),
          day: dayOfWeek,
          status: getStatusColor(availableSlots, totalSlots),
          availableSlots,
          totalSlots,
          slots: {
            clinic: dayAvailability.clinic,
            video: dayAvailability.video
          }
        });
      }

    } else if (view === 'month') {
      // Month view - show each day of the month
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dayOfWeek = getDayName(currentDate);
        const dayAvailability = availability.getAvailableSlotsForDate(currentDate);

        // Calculate total possible slots for this day
        const daySchedule = availability.schedule.find(s => s.day === dayOfWeek);
        let totalSlots = 0;

        if (daySchedule) {
          daySchedule.shifts.forEach(shift => {
            if (shift.isActive) {
              const slots = availability.generateTimeSlots(shift.startTime, shift.endTime);
              totalSlots += slots.length * shift.consultationTypes.length;
            }
          });
        }

        const availableSlots = dayAvailability.clinic.slots.length + dayAvailability.video.slots.length;

        result.data.push({
          date: formatDate(currentDate),
          day: dayOfWeek,
          status: getStatusColor(availableSlots, totalSlots),
          availableSlots,
          totalSlots,
          summary: {
            hasClinic: dayAvailability.clinic.slots.length > 0,
            hasVideo: dayAvailability.video.slots.length > 0,
            clinicCount: dayAvailability.clinic.slots.length,
            videoCount: dayAvailability.video.slots.length
          }
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error fetching availability status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability status',
      error: error.message
    });
  }
};

// Get doctor's available slots
exports.getDoctorAvailableSlots = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { date, consultationType } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }

    const requestedDate = new Date(date);
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const availability = await Availability.findOne({
      doctor: doctorId,
      isActive: true,
      effectiveFrom: { $lte: requestedDate },
      $or: [
        { effectiveTo: { $gte: requestedDate } },
        { effectiveTo: null }
      ]
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'No availability found for this doctor on the specified date'
      });
    }

    //     const availableSlots = availability.getAvailableSlotsForDate(requestedDate);

    //     if (consultationType && ['clinic', 'video'].includes(consultationType)) {
    //       return res.status(200).json({
    //         success: true,
    //         data: {
    //           date: requestedDate,
    //           consultationType,
    //           slots: availableSlots[consultationType].slots,
    //           fee: availableSlots[consultationType].fee,
    //           slotDuration: availability.slotDuration
    //         }
    //       });
    //     } else {
    //       return res.status(200).json({
    //         success: true,
    //         data: {
    //           date: requestedDate,
    //           slotDuration: availability.slotDuration,
    //           clinic: {
    //             slots: availableSlots.clinic.slots,
    //             fee: availableSlots.clinic.fee
    //           },
    //           video: {
    //             slots: availableSlots.video.slots,
    //             fee: availableSlots.video.fee
    //           }
    //         }
    //       });
    //     }
    //   } catch (err) {
    //     console.error('Error in getDoctorAvailableSlots:', err);
    //     res.status(500).json({ success: false, message: 'Server Error', error: err.message });
    //   }
    // };
    const doctor = await Doctor.findById(doctorId); // ✅
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    const availableSlots = availability.getAvailableSlotsForDate(requestedDate);

    // 🔄 Get consultation fees from doctor document
    const clinicFee = doctor.clinicConsultationFee; // ✅
    const videoFee = doctor.onlineConsultation?.consultationFee || 0; // ✅

    if (consultationType && ['clinic', 'video'].includes(consultationType)) {
      return res.status(200).json({
        success: true,
        data: {
          date: requestedDate,
          consultationType,
          slots: availableSlots[consultationType].slots,
          fee: consultationType === 'clinic' ? clinicFee : videoFee, // ✅
          slotDuration: availability.slotDuration
        }
      });
    } else {
      return res.status(200).json({
        success: true,
        data: {
          date: requestedDate,
          slotDuration: availability.slotDuration,
          clinic: {
            slots: availableSlots.clinic.slots,
            fee: clinicFee // ✅
          },
          video: {
            slots: availableSlots.video.slots,
            fee: videoFee // ✅
          }
        }
      });
    }
  } catch (err) {
    console.error('Error in getDoctorAvailableSlots:', err);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
};
// Get availability by ID
exports.getAvailabilityById = async (req, res) => {
  try {
    const availability = await Availability.findOne({ doctor: req.user.doctorId })
      .populate('doctor', 'fullName specialization');

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    res.status(200).json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid availability ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Create availability
exports.createAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const existingAvailability = await Availability.findOne({
      doctor: req.body.doctor,
      isActive: true,
      effectiveFrom: { $lte: new Date() },
      $or: [
        { effectiveTo: { $gte: new Date() } },
        { effectiveTo: null }
      ]
    });

    if (existingAvailability && !req.body.effectiveTo) {
      return res.status(400).json({
        success: false,
        message: 'Doctor already has an active availability schedule. Please update the existing one or set an end date for this new schedule.'
      });
    }

    let hasValidConsultationTypes = false;
    if (req.body.schedule && Array.isArray(req.body.schedule)) {
      for (const daySchedule of req.body.schedule) {
        if (daySchedule.shifts && Array.isArray(daySchedule.shifts)) {
          for (const shift of daySchedule.shifts) {
            if (shift.consultationTypes && shift.consultationTypes.length > 0) {
              hasValidConsultationTypes = true;
              break;
            }
          }
        }
        if (hasValidConsultationTypes) break;
      }
    }

    if (!hasValidConsultationTypes) {
      return res.status(400).json({
        success: false,
        message: 'At least one shift must have consultation types defined'
      });
    }

    const newAvailability = new Availability(req.body);
    await newAvailability.save();

    res.status(201).json({
      success: true,
      data: newAvailability
    });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update availability
exports.updateAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const availabilityToUpdate = await Availability.findOne({ doctor: req.user.doctorId });

    if (!availabilityToUpdate) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    Object.keys(req.body).forEach(key => {
      availabilityToUpdate[key] = req.body[key];
    });

    await availabilityToUpdate.save();

    res.status(200).json({
      success: true,
      data: availabilityToUpdate
    });
  } catch (error) {
    console.error(error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid availability ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete availability
exports.deleteAvailability = async (req, res) => {
  try {
    const availability = await Availability.findById(req.params.id);

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    const hasUpcomingAppointments = availability.bookedSlots.some(slot =>
      new Date(slot.date) > new Date() && slot.status === 'booked'
    );

    if (hasUpcomingAppointments) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete availability with upcoming appointments'
      });
    }

    await availability.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Availability deleted successfully'
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid availability ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};


function getDayName(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(date).getDay()];
}

// Helper function to compare dates ignoring time
function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1).toISOString().split('T')[0];
  const d2 = new Date(date2).toISOString().split('T')[0];
  return d1 === d2;
}
// Add override
// Add or modify override
exports.addOverride = async (req, res) => {
  try {
    const {
      date,
      isAvailable,
      startTime,
      endTime,
      consultationTypes,
      reason
    } = req.body;

    console.log("-------------", req.body);

    const availability = await Availability.findOne({ doctor: req.user.doctorId });
    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    // Parse the target date
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    // Find if there's an existing override for this date
    const existingOverrideIndex = availability.overrides.findIndex(
      o => isSameDay(o.date, targetDate)
    );

    let updatedOverride;

    // If marking as unavailable with specific time range
    if (!isAvailable && startTime && endTime) {
      // Fetch the day's original schedule to create a modified version
      const dayOfWeek = getDayName(targetDate);
      const daySchedule = availability.schedule.find(s => s.day === dayOfWeek);

      if (!daySchedule) {
        return res.status(400).json({
          success: false,
          message: 'No schedule found for this day of week'
        });
      }

      // If there's an existing override for this date
      if (existingOverrideIndex !== -1) {
        const currentOverride = availability.overrides[existingOverrideIndex];

        // If the override already marks the day as unavailable, return error
        if (!currentOverride.isAvailable) {
          return res.status(400).json({
            success: false,
            message: 'This date is already marked as unavailable'
          });
        }

        // Modify the shifts in the existing override to exclude the unavailable time range
        const updatedShifts = [];

        for (const shift of currentOverride.shifts) {
          // If shift ends before unavailable time starts or starts after unavailable time ends
          if (shift.endTime <= startTime || shift.startTime >= endTime) {
            updatedShifts.push(shift);
            continue;
          }

          // If unavailable time is in the middle of the shift, split it
          if (shift.startTime < startTime && shift.endTime > endTime) {
            // First part of split
            updatedShifts.push({
              startTime: shift.startTime,
              endTime: startTime,
              consultationTypes: shift.consultationTypes
            });

            // Second part of split
            updatedShifts.push({
              startTime: endTime,
              endTime: shift.endTime,
              consultationTypes: shift.consultationTypes
            });
            continue;
          }

          // If unavailable time overlaps with start of shift
          if (shift.startTime < endTime && endTime < shift.endTime) {
            updatedShifts.push({
              startTime: endTime,
              endTime: shift.endTime,
              consultationTypes: shift.consultationTypes
            });
            continue;
          }

          // If unavailable time overlaps with end of shift
          if (shift.startTime < startTime && startTime < shift.endTime) {
            updatedShifts.push({
              startTime: shift.startTime,
              endTime: startTime,
              consultationTypes: shift.consultationTypes
            });
            continue;
          }
        }

        // Update the override
        updatedOverride = {
          date: targetDate,
          isAvailable: true, // Still available, but with updated shifts
          shifts: updatedShifts,
          reason: reason || currentOverride.reason
        };
      } else {
        // Create a new override based on the day's schedule
        const newShifts = [];

        for (const shift of daySchedule.shifts) {
          if (!shift.isActive) continue;

          // If shift ends before unavailable time starts or starts after unavailable time ends
          if (shift.endTime <= startTime || shift.startTime >= endTime) {
            newShifts.push({
              startTime: shift.startTime,
              endTime: shift.endTime,
              consultationTypes: shift.consultationTypes
            });
            continue;
          }

          // If unavailable time is in the middle of the shift, split it
          if (shift.startTime < startTime && shift.endTime > endTime) {
            // First part of split
            newShifts.push({
              startTime: shift.startTime,
              endTime: startTime,
              consultationTypes: shift.consultationTypes
            });

            // Second part of split
            newShifts.push({
              startTime: endTime,
              endTime: shift.endTime,
              consultationTypes: shift.consultationTypes
            });
            continue;
          }

          // If unavailable time overlaps with start of shift
          if (shift.startTime < endTime && endTime < shift.endTime) {
            newShifts.push({
              startTime: endTime,
              endTime: shift.endTime,
              consultationTypes: shift.consultationTypes
            });
            continue;
          }

          // If unavailable time overlaps with end of shift
          if (shift.startTime < startTime && startTime < shift.endTime) {
            newShifts.push({
              startTime: shift.startTime,
              endTime: startTime,
              consultationTypes: shift.consultationTypes
            });
            continue;
          }
        }

        updatedOverride = {
          date: targetDate,
          isAvailable: true, // Available with modified shifts
          shifts: newShifts,
          reason: reason || 'Partial unavailability'
        };
      }
    }
    // Creating or modifying an available slot
    else if (isAvailable && startTime && endTime) {
      // Validate consultation types
      if (!consultationTypes || consultationTypes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'At least one consultation type must be provided for available slots'
        });
      }

      // Validate each consultation type
      for (const ct of consultationTypes) {
        if (!ct.type || !['clinic', 'video'].includes(ct.type)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid consultation type. Must be "clinic" or "video"'
          });
        }

        // if (typeof ct.fee !== 'number' || ct.fee < 0) {
        //   return res.status(400).json({
        //     success: false,
        //     message: 'Each consultation type must have a valid fee'
        //   });
        // }

        // if (ct.maxPatients !== undefined && (typeof ct.maxPatients !== 'number' || ct.maxPatients < 1)) {
        //   return res.status(400).json({
        //     success: false,
        //     message: 'maxPatients must be a positive number'
        //   });
        // }
      }

      const newShift = {
        startTime,
        endTime,
        consultationTypes
      };

      if (existingOverrideIndex !== -1) {
        const currentOverride = availability.overrides[existingOverrideIndex];

        // If day is already marked unavailable, change it to available
        if (!currentOverride.isAvailable) {
          updatedOverride = {
            date: targetDate,
            isAvailable: true,
            shifts: [newShift],
            reason: reason || 'Modified to add availability'
          };
        } else {
          // Check for overlapping shifts in existing override
          const shifts = [...currentOverride.shifts];

          // Add the new shift
          shifts.push(newShift);

          // Sort shifts by start time
          const sortedShifts = shifts.sort((a, b) =>
            a.startTime.localeCompare(b.startTime)
          );

          // Check for overlaps
          for (let i = 1; i < sortedShifts.length; i++) {
            if (sortedShifts[i].startTime < sortedShifts[i - 1].endTime) {
              return res.status(400).json({
                success: false,
                message: 'New shift overlaps with existing shifts'
              });
            }
          }

          updatedOverride = {
            date: targetDate,
            isAvailable: true,
            shifts: sortedShifts,
            reason: reason || currentOverride.reason
          };
        }
      } else {
        // Create a new override with the specified shift
        updatedOverride = {
          date: targetDate,
          isAvailable: true,
          shifts: [newShift],
          reason: reason || 'Added availability'
        };
      }
    }
    // Full day overrides (classic behavior)
    else {
      // Validate shifts if available and provided
      const shifts = req.body.shifts || [];
      if (isAvailable && shifts.length > 0) {
        for (const shift of shifts) {
          if (!shift.consultationTypes || shift.consultationTypes.length === 0) {
            return res.status(400).json({
              success: false,
              message: 'Each available shift must have at least one consultation type defined'
            });
          }
        }

        // Check for overlapping shifts
        if (shifts.length > 1) {
          const sortedShifts = [...shifts].sort((a, b) =>
            a.startTime.localeCompare(b.startTime)
          );

          for (let i = 1; i < sortedShifts.length; i++) {
            if (sortedShifts[i].startTime < sortedShifts[i - 1].endTime) {
              return res.status(400).json({
                success: false,
                message: 'Shifts cannot overlap'
              });
            }
          }
        }
      }

      updatedOverride = {
        date: targetDate,
        isAvailable,
        shifts: isAvailable ? shifts : [],
        reason
      };
    }

    // Update or add the override to the availability
    if (existingOverrideIndex !== -1) {
      availability.overrides[existingOverrideIndex] = updatedOverride;
    } else {
      availability.overrides.push(updatedOverride);
    }

    await availability.save();

    res.status(200).json({
      success: true,
      message: 'Availability modified successfully',
      data: availability
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Remove override
exports.removeOverride = async (req, res) => {
  try {
    const { date } = req.params;
    const targetDate = new Date(date);

    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    const availability = await Availability.findById(req.params.id);
    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    const overrideIndex = availability.overrides.findIndex(
      o => isSameDay(o.date, targetDate)
    );

    if (overrideIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Override not found for the specified date'
      });
    }

    availability.overrides.splice(overrideIndex, 1);
    await availability.save();

    res.status(200).json({
      success: true,
      message: 'Override removed successfully',
      data: availability
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid availability ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update booked slot status
exports.updateBookedSlotStatus = async (req, res) => {
  try {
    const { id, slotId } = req.params;
    const { status } = req.body;

    const availability = await Availability.findById(id);
    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    const bookedSlot = availability.bookedSlots.id(slotId);
    if (!bookedSlot) {
      return res.status(404).json({
        success: false,
        message: 'Booked slot not found'
      });
    }

    const validTransitions = {
      'booked': ['completed', 'cancelled', 'no_show'],
      'completed': [],
      'cancelled': [],
      'no_show': []
    };

    if (!validTransitions[bookedSlot.status].includes(status) && bookedSlot.status !== status) {
      return res.status(400).json({
        success: false,
        message: `Cannot transition from ${bookedSlot.status} to ${status}`
      });
    }

    bookedSlot.status = status;
    await availability.save();

    res.status(200).json({
      success: true,
      message: 'Slot status updated successfully',
      data: bookedSlot
    });
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Book a slot
exports.bookSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, startTime, consultationType, appointmentId } = req.body;

    const availability = await Availability.findById(id);
    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }

    const doctor = await Doctor.findById(availability.doctor);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment ID format'
      });
    }

    if (!availability.isSlotAvailable(date, startTime, consultationType)) {
      return res.status(400).json({
        success: false,
        message: 'Slot is not available'
      });
    }

    try {
      const result = await availability.bookSlot(date, startTime, consultationType, appointmentId);

      res.status(200).json({
        success: true,
        message: 'Slot booked successfully',
        data: {
          date,
          startTime: result.startTime,
          endTime: result.endTime,
          consultationType,
          appointmentId
        }
      });
    } catch (bookingError) {
      console.error(bookingError);
      return res.status(400).json({
        success: false,
        message: bookingError.message
      });
    }
  } catch (error) {
    console.error(error);
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Helper function for date comparison
function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1).toISOString().split('T')[0];
  const d2 = new Date(date2).toISOString().split('T')[0];
  return d1 === d2;
}

// Updated GET Available Slots - Fix slot allocation fetching
exports.getDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID format'
      });
    }

    const availability = await Availability.findOne({
      doctor: doctorId,
      isActive: true,
      $or: [
        { effectiveTo: { $exists: false } },
        { effectiveTo: { $gte: new Date() } }
      ]
    }).populate('doctor', 'name email');

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'No availability found for this doctor',
        data: null
      });
    }

    // Helper function to generate time slots (same as frontend)
    const generateTimeSlots = (startTime, endTime, slotDuration, bufferTime) => {
      const slots = [];
      const currentYear = new Date().getFullYear() + 1;
      const start = new Date(`${currentYear}-01-01T${startTime}:00`);
      const end = new Date(`${currentYear}-01-01T${endTime}:00`);
      const slotDurationMs = slotDuration * 60 * 1000;
      const bufferTimeMs = bufferTime * 60 * 1000;

      let current = new Date(start);

      while (current < end) {
        const slotEnd = new Date(current.getTime() + slotDurationMs);
        if (slotEnd <= end) {
          slots.push({
            startTime: current.toTimeString().slice(0, 5),
            endTime: slotEnd.toTimeString().slice(0, 5)
          });
        }
        current = new Date(current.getTime() + slotDurationMs + bufferTimeMs);
      }

      return slots;
    };

    // Transform data to match frontend format with proper slot allocation
    const transformedSchedule = availability.schedule.map(daySchedule => {
      const shift = daySchedule.shifts[0]; // Get first shift

      // Generate all possible slots for this day
      const allSlots = generateTimeSlots(
        shift.startTime,
        shift.endTime,
        availability.slotDuration,
        availability.bufferTime
      );

      // Create allocated slots based on consultation types
      const allocatedSlots = [];

      // For each consultation type, allocate ALL available slots
      shift.consultationTypes.forEach(ct => {
        allSlots.forEach((slot, index) => {
          allocatedSlots.push({
            id: `${daySchedule._id}-${ct.type}-${index}`,
            allocationType: ct.type === 'clinic' ? 'in-clinic' : 'video',
            startTime: slot.startTime,
            endTime: slot.endTime,
            originalIndex: index,
            fee: ct.fee,
            maxPatients: ct.maxPatients
          });
        });
      });

      return {
        id: daySchedule._id,
        day: daySchedule.day,
        startTime: shift.startTime,
        endTime: shift.endTime,
        inClinicFee: shift.consultationTypes.find(ct => ct.type === 'clinic')?.fee || 500,
        videoFee: shift.consultationTypes.find(ct => ct.type === 'video')?.fee || 400,
        maxPatientsPerSlot: shift.consultationTypes[0]?.maxPatients || 1,
        allocatedSlots: allocatedSlots,
        totalSlots: allSlots.length,
        availableSlots: [] // All slots are allocated in this design
      };
    });

    const responseData = {
      id: availability._id,
      doctor: availability.doctor,
      isVirtual: availability.isVirtual,
      slotDuration: availability.slotDuration,
      bufferTime: availability.bufferTime,
      recurrence: availability.recurrence,
      schedule: transformedSchedule,
      overrides: availability.overrides,
      bookedSlots: availability.bookedSlots,
      effectiveFrom: availability.effectiveFrom,
      effectiveTo: availability.effectiveTo,
      isActive: availability.isActive
    };

    res.status(200).json({
      success: true,
      message: 'Availability retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch availability',
      error: error.message
    });
  }
};

// Updated CREATE - Better slot handling
exports.createDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const {
      slotDuration,
      bufferTime,
      effectiveFrom,
      isVirtual = false,
      recurrence = 'weekly',
      weeklySlots
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID format'
      });
    }

    if (!slotDuration || !weeklySlots || weeklySlots.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Slot duration and weekly schedule are required'
      });
    }

    // Deactivate existing availability
    const existingAvailability = await Availability.findOne({
      doctor: doctorId,
      isActive: true,
      $or: [
        { effectiveTo: { $exists: false } },
        { effectiveTo: { $gte: new Date() } }
      ]
    });

    if (existingAvailability) {
      existingAvailability.effectiveTo = new Date();
      existingAvailability.isActive = false;
      await existingAvailability.save();
    }

    // Transform frontend data to backend schema
    const schedule = weeklySlots.map(dayData => {
      const consultationTypes = [];

      // Group allocated slots by type
      const inClinicSlots = dayData.allocatedSlots?.filter(slot => slot.allocationType === 'in-clinic') || [];
      const videoSlots = dayData.allocatedSlots?.filter(slot => slot.allocationType === 'video') || [];

      // Add consultation types only if slots are allocated
      if (inClinicSlots.length > 0) {
        consultationTypes.push({
          type: 'clinic',
          fee: dayData.inClinicFee || 500,
          maxPatients: dayData.maxPatientsPerSlot || 1
        });
      }

      if (videoSlots.length > 0) {
        consultationTypes.push({
          type: 'video',
          fee: dayData.videoFee || 400,
          maxPatients: dayData.maxPatientsPerSlot || 1
        });
      }

      return {
        day: dayData.day,
        shifts: [{
          startTime: dayData.startTime,
          endTime: dayData.endTime,
          isActive: true,
          consultationTypes: consultationTypes
        }]
      };
    }).filter(daySchedule => daySchedule.shifts[0].consultationTypes.length > 0); // Only include days with allocated slots

    if (schedule.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one day must have allocated slots'
      });
    }

    const newAvailability = new Availability({
      doctor: doctorId,
      isVirtual,
      slotDuration: parseInt(slotDuration),
      bufferTime: parseInt(bufferTime) || 0,
      recurrence,
      schedule,
      effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
      isActive: true
    });

    const savedAvailability = await newAvailability.save();
    await savedAvailability.populate('doctor', 'name email');

    res.status(201).json({
      success: true,
      message: 'Availability created successfully',
      data: savedAvailability
    });

  } catch (error) {
    console.error('Error creating availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create availability',
      error: error.message
    });
  }
};


// 3. UPDATE Available Slots - Update existing availability
exports.updateDoctorAvailability = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const {
      slotDuration,
      bufferTime,
      effectiveFrom,
      isVirtual,
      recurrence,
      weeklySlots,
      overrides = []
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(doctorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid doctor ID format'
      });
    }

    // Find current active availability
    const availability = await Availability.findOne({
      doctor: doctorId,
      isActive: true,
      $or: [
        { effectiveTo: { $exists: false } },
        { effectiveTo: { $gte: new Date() } }
      ]
    });

    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'No active availability found for this doctor'
      });
    }

    // Helper function to check time overlap
    const checkTimeOverlap = (start1, end1, start2, end2) => {
      const parseTime = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes; // Convert to minutes
      };
      
      const s1 = parseTime(start1);
      const e1 = parseTime(end1);
      const s2 = parseTime(start2);
      const e2 = parseTime(end2);
      
      return (s1 < e2 && s2 < e1);
    };

    // Helper function to create shifts from allocated slots - SEPARATE SHIFTS FOR EACH TYPE
    const createShiftsFromSlots = (dayData) => {
      const shifts = [];

      // Helper function to parse time string to minutes
      const parseTimeToMinutes = (timeStr) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };

      // Helper function to merge contiguous time slots of the same type
      const mergeContiguousSlots = (slots, consultationType) => {
        if (slots.length === 0) return [];

        // Sort slots by start time
        const sortedSlots = slots.sort((a, b) => 
          parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
        );

        const mergedRanges = [];
        let currentRange = {
          startTime: sortedSlots[0].startTime,
          endTime: sortedSlots[0].endTime,
          fee: sortedSlots[0].fee,
          maxPatients: sortedSlots[0].maxPatients
        };

        for (let i = 1; i < sortedSlots.length; i++) {
          const currentSlot = sortedSlots[i];
          const currentEndMinutes = parseTimeToMinutes(currentRange.endTime);
          const nextStartMinutes = parseTimeToMinutes(currentSlot.startTime);

          // Check if current slot is contiguous with the current range
          if (nextStartMinutes <= currentEndMinutes) {
            // Extend the current range
            const nextEndMinutes = parseTimeToMinutes(currentSlot.endTime);
            const currentRangeEndMinutes = parseTimeToMinutes(currentRange.endTime);
            
            if (nextEndMinutes > currentRangeEndMinutes) {
              currentRange.endTime = currentSlot.endTime;
            }
            
            // Use the minimum fee and maximum maxPatients for merged ranges
            currentRange.fee = Math.min(currentRange.fee, currentSlot.fee);
            currentRange.maxPatients = Math.max(currentRange.maxPatients, currentSlot.maxPatients);
          } else {
            // No overlap, save current range and start new one
            mergedRanges.push({ ...currentRange });
            currentRange = {
              startTime: currentSlot.startTime,
              endTime: currentSlot.endTime,
              fee: currentSlot.fee,
              maxPatients: currentSlot.maxPatients
            };
          }
        }

        // Add the last range
        mergedRanges.push(currentRange);

        return mergedRanges.map(range => ({
          startTime: range.startTime,
          endTime: range.endTime,
          isActive: true,
          consultationTypes: [{
            type: consultationType,
            fee: range.fee,
            maxPatients: range.maxPatients
          }]
        }));
      };

      // Group slots by consultation type
      const slotsByType = {
        clinic: [],
        video: []
      };

      // Process allocated slots
      if (dayData.allocatedSlots && dayData.allocatedSlots.length > 0) {
        dayData.allocatedSlots.forEach(slot => {
          const consultationType = slot.allocationType === 'in-clinic' ? 'clinic' : 'video';
          
          // Get fee and maxPatients - prioritize slot-level, fallback to day-level
          let fee, maxPatients;
          
          if (consultationType === 'clinic') {
            fee = slot.fee !== undefined ? slot.fee : dayData.inClinicFee;
            maxPatients = slot.maxPatients !== undefined ? slot.maxPatients : dayData.maxPatientsPerSlot;
          } else {
            fee = slot.fee !== undefined ? slot.fee : dayData.videoFee;
            maxPatients = slot.maxPatients !== undefined ? slot.maxPatients : dayData.maxPatientsPerSlot;
          }
          
          slotsByType[consultationType].push({
            startTime: slot.startTime,
            endTime: slot.endTime,
            fee: fee,
            maxPatients: maxPatients
          });
        });
      } else {
        // If no allocated slots, create from day-level data
        if (dayData.inClinicFee && dayData.startTime && dayData.endTime) {
          slotsByType.clinic.push({
            startTime: dayData.startTime,
            endTime: dayData.endTime,
            fee: dayData.inClinicFee,
            maxPatients: dayData.maxPatientsPerSlot || 1
          });
        }
        
        if (dayData.videoFee && dayData.startTime && dayData.endTime) {
          slotsByType.video.push({
            startTime: dayData.startTime,
            endTime: dayData.endTime,
            fee: dayData.videoFee,
            maxPatients: dayData.maxPatientsPerSlot || 1
          });
        }
      }

      // Create separate shifts for each consultation type
      ['clinic', 'video'].forEach(consultationType => {
        const slotsForType = slotsByType[consultationType];
        if (slotsForType.length > 0) {
          const mergedShifts = mergeContiguousSlots(slotsForType, consultationType);
          shifts.push(...mergedShifts);
        }
      });

      // Sort all shifts by start time
      return shifts.sort((a, b) => 
        parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime)
      );
    };

    // Transform frontend data to match backend schema
    const updatedSchedule = [];
    const validationErrors = [];

    for (const dayData of weeklySlots) {
      try {
        const shifts = createShiftsFromSlots(dayData);
        
        if (shifts.length === 0) {
          validationErrors.push(`No valid shifts found for ${dayData.day}`);
          continue;
        }

        // Validate each shift
        for (const shift of shifts) {
          if (!shift.startTime || !shift.endTime) {
            validationErrors.push(`Invalid time range for ${dayData.day}`);
            continue;
          }

          // Validate time format
          const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(shift.startTime) || !timeRegex.test(shift.endTime)) {
            validationErrors.push(`Invalid time format for ${dayData.day}`);
            continue;
          }

          // Validate start time is before end time
          const parseTime = (timeStr) => {
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
          };

          if (parseTime(shift.startTime) >= parseTime(shift.endTime)) {
            validationErrors.push(`Start time must be before end time for ${dayData.day}`);
            continue;
          }

          // Validate consultation types
          if (!shift.consultationTypes || shift.consultationTypes.length === 0) {
            validationErrors.push(`No consultation types specified for ${dayData.day}`);
            continue;
          }

          for (const consType of shift.consultationTypes) {
            if (!['clinic', 'video'].includes(consType.type)) {
              validationErrors.push(`Invalid consultation type for ${dayData.day}: ${consType.type}`);
            }
            if (typeof consType.fee !== 'number' || consType.fee < 0) {
              validationErrors.push(`Invalid fee for ${dayData.day}: ${consType.fee}`);
            }
            if (typeof consType.maxPatients !== 'number' || consType.maxPatients < 1) {
              validationErrors.push(`Invalid maxPatients for ${dayData.day}: ${consType.maxPatients}`);
            }
          }
        }

        updatedSchedule.push({
          day: dayData.day,
          shifts: shifts
        });

      } catch (error) {
        validationErrors.push(`Error processing ${dayData.day}: ${error.message}`);
      }
    }

    // Return validation errors if any
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors found',
        errors: validationErrors
      });
    }

    // Validate overrides
    const validatedOverrides = [];
    for (const override of overrides) {
      if (!override.date) {
        validationErrors.push('Override date is required');
        continue;
      }

      const overrideDate = new Date(override.date);
      if (isNaN(overrideDate.getTime())) {
        validationErrors.push(`Invalid override date: ${override.date}`);
        continue;
      }

      // Validate override shifts if provided
      if (override.shifts && override.shifts.length > 0) {
        for (const shift of override.shifts) {
          if (shift.startTime && shift.endTime) {
            const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(shift.startTime) || !timeRegex.test(shift.endTime)) {
              validationErrors.push(`Invalid time format in override for ${override.date}`);
              continue;
            }
          }
        }
      }

      validatedOverrides.push({
        date: overrideDate,
        isAvailable: override.isAvailable !== undefined ? override.isAvailable : false,
        shifts: override.shifts || [],
        reason: override.reason || ''
      });
    }

    // Return validation errors if any
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors found',
        errors: validationErrors
      });
    }

    // Update availability
    availability.slotDuration = parseInt(slotDuration) || availability.slotDuration;
    availability.bufferTime = parseInt(bufferTime) || availability.bufferTime;
    availability.schedule = updatedSchedule;
    availability.overrides = validatedOverrides;
    
    if (isVirtual !== undefined) availability.isVirtual = isVirtual;
    if (recurrence) availability.recurrence = recurrence;
    if (effectiveFrom) availability.effectiveFrom = new Date(effectiveFrom);

    const updatedAvailability = await availability.save();
    await updatedAvailability.populate('doctor', 'name email');

    res.status(200).json({
      success: true,
      message: 'Availability updated successfully',
      data: updatedAvailability,
      summary: {
        totalDays: updatedSchedule.length,
        totalShifts: updatedSchedule.reduce((sum, day) => sum + day.shifts.length, 0),
        totalOverrides: validatedOverrides.length
      }
    });

  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update availability',
      error: error.message
    });
  }
};




