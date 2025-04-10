// controllers/availabilityController.js
const mongoose = require('mongoose');
const Availability = require('../models/Availability');
const Doctor = require("../models/Doctor");
const { validationResult } = require('express-validator');

/**
 * Get doctor's available slots for a specific date
 * @route GET /api/availabilities/doctor/:doctorId/slots
 * @access Public
 */
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
    
    // Validate date format
    const requestedDate = new Date(date);
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }
    
    // Find active availability for the doctor
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
    
    console.log(`Found availability for doctor ${doctorId} on date ${requestedDate}`);
    
    // Check for overrides on this date
    const hasOverride = availability.overrides.some(override => {
      const overrideDate = new Date(override.date);
      return overrideDate.getFullYear() === requestedDate.getFullYear() &&
             overrideDate.getMonth() === requestedDate.getMonth() &&
             overrideDate.getDate() === requestedDate.getDate();
    });
    
    console.log(`Has override for date ${requestedDate}: ${hasOverride}`);
    
    // Get available slots for the date
    const availableSlots = availability.getAvailableSlotsForDate(requestedDate);
    
    // Filter by consultation type if requested
    if (consultationType && (consultationType === 'clinic' || consultationType === 'video')) {
      // Only return the specified consultation type
      return res.status(200).json({
        success: true,
        data: {
          date: requestedDate,
          consultationType,
          slots: availableSlots[consultationType].slots,
          fee: availableSlots[consultationType].fee,
          slotDuration: availability.slotDuration
        }
      });
    } else {
      // Return both consultation types
      return res.status(200).json({
        success: true,
        data: {
          date: requestedDate,
          slotDuration: availability.slotDuration,
          clinic: {
            slots: availableSlots.clinic.slots,
            fee: availableSlots.clinic.fee
          },
          video: {
            slots: availableSlots.video.slots,
            fee: availableSlots.video.fee
          }
        }
      });
    }
  } catch (err) {
    console.error('Error in getDoctorAvailableSlots:', err);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
};



/**
 * Get a single availability by ID
 * @route GET /api/availabilities/:id
 * @access Private
 */
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
    // Check if error is due to invalid ID format
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

/**
 * Get doctor's available slots for a specific date
 * @route GET /api/availabilities/doctor/:doctorId/slots
 * @access Public
 */
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
   
    // Check if the requested date is valid
    if (isNaN(requestedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }
    
    // Find availability for the doctor
    const availability = await Availability.findOne({
      doctor: doctorId,
      isActive: true,
      // Only consider schedules that are within the effective date range or have no end date
      effectiveFrom: { $lte: requestedDate },
      $or: [
        { effectiveTo: { $gte: requestedDate } },
        { effectiveTo: null }  // This handles cases where effectiveTo isn't specified
      ]
    });
    
    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'No availability found for this doctor on the specified date'
      });
    }
    
    // Get available slots for the date
    const availableSlots = availability.getAvailableSlotsForDate(requestedDate);
    
    // Filter by consultation type if requested
    if (consultationType && (consultationType === 'clinic' || consultationType === 'video')) {
      // Only return the specified consultation type
      return res.status(200).json({
        success: true,
        data: {
          date: requestedDate,
          consultationType,
          slots: availableSlots[consultationType].slots,
          fee: availableSlots[consultationType].fee,
          slotDuration: availability.slotDuration
        }
      });
    } else {
      // Return both consultation types
      return res.status(200).json({
        success: true,
        data: {
          date: requestedDate,
          slotDuration: availability.slotDuration,
          clinic: {
            slots: availableSlots.clinic.slots,
            fee: availableSlots.clinic.fee
          },
          video: {
            slots: availableSlots.video.slots,
            fee: availableSlots.video.fee
          }
        }
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

/**
 * Create a new availability record
 * @route POST /api/availabilities
 * @access Private
 */
exports.createAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    // Check if doctor already has an active availability
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
    
    // Validate that at least one shift has consultationTypes defined
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

/**
 * Update an existing availability
 * @route PUT /api/availabilities/:id
 * @access Private
 */
exports.updateAvailability = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    // Find the availability first
    const availabilityToUpdate = await Availability.findById(req.params.id);
    
    if (!availabilityToUpdate) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }
    
    // Update the document fields
    Object.keys(req.body).forEach(key => {
      availabilityToUpdate[key] = req.body[key];
    });
    
    // Save the updated document (this will run validators)
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

/**
 * Delete an availability
 * @route DELETE /api/availabilities/:id
 * @access Private
 */
exports.deleteAvailability = async (req, res) => {
  try {
    const availability = await Availability.findById(req.params.id);
    
    if (!availability) {
      return res.status(404).json({
        success: false,
        message: 'Availability not found'
      });
    }
    
    // Check if there are any upcoming appointments
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

/**
 * Add an override for a specific date
 * @route POST /api/availabilities/:id/override
 * @access Private
 */
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
    
    // Ensure shifts have consultationTypes if available
    if (isAvailable && shifts && shifts.length > 0) {
      for (const shift of shifts) {
        if (!shift.consultationTypes || shift.consultationTypes.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Each available shift must have at least one consultation type defined'
          });
        }
      }
    }
    
    // Check if there's already an override for this date
    const existingOverrideIndex = availability.overrides.findIndex(
      o => new Date(o.date).toDateString() === new Date(date).toDateString()
    );
    
    if (existingOverrideIndex !== -1) {
      // Update existing override
      availability.overrides[existingOverrideIndex] = {
        date,
        isAvailable,
        shifts: shifts || [],
        reason
      };
    } else {
      // Add new override
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

/**
 * Remove an override for a specific date
 * @route DELETE /api/availabilities/:id/override/:date
 * @access Private
 */
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
    
    // Find the index of the override to remove
    const overrideIndex = availability.overrides.findIndex(
      o => new Date(o.date).toDateString() === targetDate.toDateString()
    );
    
    if (overrideIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Override not found for the specified date'
      });
    }
    
    // Remove the override
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

/**
 * Update a booked slot status
 * @route PATCH /api/availabilities/:id/slots/:slotId
 * @access Private
 */
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
    
    // Find the booked slot
    const bookedSlot = availability.bookedSlots.id(slotId);
    if (!bookedSlot) {
      return res.status(404).json({
        success: false,
        message: 'Booked slot not found'
      });
    }
    
    // Validate status transitions
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
    
    // Update the slot status
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

/**
 * Book a slot
 * @route POST /api/availabilities/:id/book
 * @access Private
 */
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
    
    // Check if the doctor exists
    const doctor = await Doctor.findById(availability.doctor);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }
    
    // Validate appointment ID format
    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid appointment ID format'
      });
    }
    
    // Check if the slot is available
    if (!availability.isSlotAvailable(date, startTime, consultationType)) {
      return res.status(400).json({
        success: false,
        message: 'Slot is not available'
      });
    }
    
    try {
      // Book the slot
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