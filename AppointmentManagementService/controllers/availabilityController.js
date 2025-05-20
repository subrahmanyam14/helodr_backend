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
    const availability = await Availability.findOne({doctor: req.user.doctorId})
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
    
    const availabilityToUpdate = await Availability.findOne({doctor: req.user.doctorId});
    
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
   
    const availability = await Availability.findOne({doctor: req.user.doctorId});
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
            if (sortedShifts[i].startTime < sortedShifts[i-1].endTime) {
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
            if (sortedShifts[i].startTime < sortedShifts[i-1].endTime) {
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