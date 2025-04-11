const mongoose = require('mongoose');
const Availability = require('../models/Availability');
const Doctor = require("../models/Doctor");
const { validationResult } = require('express-validator');

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
    const availability = await Availability.findById(req.params.id)
      .populate('doctor', 'name specialization');
    
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
    
    const availabilityToUpdate = await Availability.findById(req.params.id);
    
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

// Add override
exports.addOverride = async (req, res) => {
  try {
    const { date, isAvailable, shifts, reason } = req.body;
    
    const availability = await Availability.findById(req.params.id);
    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }
    
    // Validate shifts if available
    if (isAvailable && shifts && shifts.length > 0) {
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
          if (sortedShifts[i].startTime < sortedShifts[i-1].endTime) {
            return res.status(400).json({
              success: false,
              message: 'Shifts cannot overlap'
            });
          }
        }
      }
    }
    
    const targetDate = new Date(date);
    const existingOverrideIndex = availability.overrides.findIndex(
      o => isSameDay(o.date, targetDate)
    );
    
    if (existingOverrideIndex !== -1) {
      availability.overrides[existingOverrideIndex] = {
        date,
        isAvailable,
        shifts: shifts || [],
        reason
      };
    } else {
      availability.overrides.push({
        date,
        isAvailable,
        shifts: shifts || [],
        reason
      });
    }
    
    await availability.save();
    
    res.status(200).json({
      success: true,
      message: 'Override added successfully',
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