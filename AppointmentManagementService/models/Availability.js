const mongoose = require("mongoose");

const availabilitySchema = new mongoose.Schema({
  doctor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Doctor",
    required: true
  },
  isVirtual: {
    type: Boolean,
    default: false
  },
  slotDuration: {
    type: Number,
    required: true,
    min: 5,
    default: 15 // 15 minutes by default
  },
  bufferTime: {
    type: Number,
    default: 0 // Buffer time between appointments in minutes
  },
  recurrence: {
    type: String,
    enum: ["daily", "weekly", "custom", null],
    default: "weekly"
  },
  schedule: [{
    day: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      required: true
    },
    shifts: [{
      startTime: {
        type: String,
        required: true
      },
      endTime: {
        type: String,
        required: true
      },
      isActive: {
        type: Boolean,
        default: true
      },
      consultationTypes: [{
        type: {
          type: String,
          enum: ["clinic", "video"],
          required: true
        },
        fee: {
          type: Number,
          required: true,
          min: 0
        },
        maxPatients: {
          type: Number,
          min: 1,
          default: 1
        }
      }]
    }]
  }],
  overrides: [{
    date: {
      type: Date,
      required: true
    },
    isAvailable: {
      type: Boolean,
      default: false
    },
    shifts: [{
      startTime: String,
      endTime: String,
      consultationTypes: [{
        type: {
          type: String,
          enum: ["clinic", "video"]
        },
        fee: {
          type: Number,
          min: 0
        },
        maxPatients: Number
      }]
    }],
    reason: String
  }],
  bookedSlots: [{
    date: {
      type: Date,
      required: true
    },
    startTime: {
      type: String,
      required: true
    },
    endTime: {
      type: String,
      required: true
    },
    consultationType: {
      type: String,
      enum: ["clinic", "video"],
      required: true
    },
    appointmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Appointment"
    },
    status: {
      type: String,
      enum: ["booked", "completed", "cancelled", "no_show"],
      default: "booked"
    }
  }],
  effectiveFrom: {
    type: Date,
    default: Date.now
  },
  effectiveTo: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create compound index for efficient slot lookups
availabilitySchema.index({ doctor: 1, isActive: 1, 'schedule.day': 1 });
availabilitySchema.index({ doctor: 1, 'bookedSlots.date': 1, 'bookedSlots.status': 1 });

// Helper function to compare dates ignoring time
function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

// Helper function to get day name from date
function getDayName(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(date).getDay()];
}

// Helper function to find an override for a specific date
availabilitySchema.methods.findOverrideForDate = function(date) {
  // Convert input date to a Date object if it's not already
  const targetDate = new Date(date);
  
  // Direct loop comparison to avoid timezone issues
  for (const override of this.overrides) {
    if (isSameDay(override.date, targetDate)) {
      return override;
    }
  }
  return null;
};

// Method to check if a specific slot is available for a given consultation type
availabilitySchema.methods.isSlotAvailable = function(date, startTime, consultationType) {
  const targetDate = new Date(date);
  const dayOfWeek = getDayName(targetDate);
  
  // First check for booking conflicts
  const isAlreadyBooked = this.bookedSlots.some(slot => 
    isSameDay(slot.date, targetDate) && 
    slot.startTime === startTime && 
    slot.consultationType === consultationType &&
    slot.status === "booked"
  );
  
  if (isAlreadyBooked) {
    return false;
  }
  
  // Look for an override
  const override = this.findOverrideForDate(targetDate);
  
  if (override) {
    // If not available at all on this date, return false
    if (!override.isAvailable) {
      return false;
    }
    
    // Check if startTime falls within any shift in the override
    return override.shifts.some(shift => {
      // Check if time is within shift
      if (startTime < shift.startTime || startTime >= shift.endTime) {
        return false;
      }
      
      // Check if consultation type is available in this shift
      return shift.consultationTypes && 
             shift.consultationTypes.some(ct => ct.type === consultationType);
    });
  } else {
    // No override - check regular schedule
    const daySchedule = this.schedule.find(s => s.day === dayOfWeek);
    if (!daySchedule) {
      return false;
    }
    
    // Check if startTime falls within any active shift
    return daySchedule.shifts.some(shift => {
      if (!shift.isActive || startTime < shift.startTime || startTime >= shift.endTime) {
        return false;
      }
      
      // Check if consultation type is available in this shift
      return shift.consultationTypes && 
             shift.consultationTypes.some(ct => ct.type === consultationType);
    });
  }
};

// Method to get all available slots for a given date, organized by consultation type
availabilitySchema.methods.getAvailableSlotsForDate = function(date) {
  const targetDate = new Date(date);
  const dayOfWeek = getDayName(targetDate);
  
  // Results structure
  const availableSlots = {
    clinic: {
      slots: [],
      fee: null
    },
    video: {
      slots: [],
      fee: null
    }
  };
  
  // First check if there's an override for this date
  const override = this.findOverrideForDate(targetDate);
  
  if (override) {
    // If override says not available, return empty results
    if (!override.isAvailable) {
      return availableSlots;
    }
    
    // Process shifts in the override
    override.shifts.forEach(shift => {
      // Generate all possible time slots
      const timeSlots = this.generateTimeSlots(shift.startTime, shift.endTime);
      
      // Process each consultation type in the shift
      if (shift.consultationTypes && shift.consultationTypes.length > 0) {
        shift.consultationTypes.forEach(consType => {
          const type = consType.type;
          const fee = consType.fee;
          
          // Update fee if needed
          if (!availableSlots[type].fee || fee < availableSlots[type].fee) {
            availableSlots[type].fee = fee;
          }
          
          // Filter each time slot for availability
          timeSlots.forEach(slotTime => {
            // Check if slot is not already booked
            const isBooked = this.bookedSlots.some(slot => 
              isSameDay(slot.date, targetDate) && 
              slot.startTime === slotTime && 
              slot.consultationType === type &&
              slot.status === "booked"
            );
            
            if (!isBooked) {
              availableSlots[type].slots.push(slotTime);
            }
          });
        });
      }
    });
  } else {
    // No override - process regular schedule
    const daySchedule = this.schedule.find(s => s.day === dayOfWeek);
    if (!daySchedule) {
      return availableSlots;
    }
    
    // Process active shifts in day schedule
    daySchedule.shifts.filter(s => s.isActive).forEach(shift => {
      // Generate all possible time slots
      const timeSlots = this.generateTimeSlots(shift.startTime, shift.endTime);
      
      // Process each consultation type in the shift
      if (shift.consultationTypes && shift.consultationTypes.length > 0) {
        shift.consultationTypes.forEach(consType => {
          const type = consType.type;
          const fee = consType.fee;
          
          // Update fee if needed
          if (!availableSlots[type].fee || fee < availableSlots[type].fee) {
            availableSlots[type].fee = fee;
          }
          
          // Filter each time slot for availability
          timeSlots.forEach(slotTime => {
            // Check if slot is not already booked
            const isBooked = this.bookedSlots.some(slot => 
              isSameDay(slot.date, targetDate) && 
              slot.startTime === slotTime && 
              slot.consultationType === type &&
              slot.status === "booked"
            );
            
            if (!isBooked) {
              availableSlots[type].slots.push(slotTime);
            }
          });
        });
      }
    });
  }
  
  return availableSlots;
};

// Helper method to generate time slots based on start/end times and slot duration
availabilitySchema.methods.generateTimeSlots = function(startTime, endTime) {
  const slots = [];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let startDate = new Date();
  startDate.setHours(startHour, startMinute, 0);
  
  let endDate = new Date();
  endDate.setHours(endHour, endMinute, 0);
  
  // Handle case where end time is before start time (next day)
  if (endDate < startDate) {
    endDate.setDate(endDate.getDate() + 1);
  }
  
  // Total minutes between start and end
  const totalMinutes = (endDate - startDate) / (60 * 1000);
  
  // Number of slots possible
  const totalSlots = Math.floor(totalMinutes / (this.slotDuration + this.bufferTime));
  
  for (let i = 0; i < totalSlots; i++) {
    const slotTime = new Date(startDate.getTime() + i * (this.slotDuration + this.bufferTime) * 60 * 1000);
    const hours = slotTime.getHours().toString().padStart(2, '0');
    const minutes = slotTime.getMinutes().toString().padStart(2, '0');
    slots.push(`${hours}:${minutes}`);
  }
  
  return slots;
};

// Method to book a slot
availabilitySchema.methods.bookSlot = async function(date, startTime, consultationType, appointmentId) {
  if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
    throw new Error("Invalid appointment ID format");
  }
  
  if (!this.isSlotAvailable(date, startTime, consultationType)) {
    throw new Error(`Slot is not available for ${consultationType} consultation`);
  }
  
  // Calculate end time based on slot duration
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date(date);
  startDate.setHours(hours, minutes, 0);
  
  const endDate = new Date(startDate.getTime() + this.slotDuration * 60 * 1000);
  const endHours = endDate.getHours().toString().padStart(2, '0');
  const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
  const endTime = `${endHours}:${endMinutes}`;
  
  this.bookedSlots.push({
    date: date,
    startTime: startTime,
    endTime: endTime,
    consultationType: consultationType,
    appointmentId: appointmentId,
    status: 'booked'
  });
  
  await this.save();
  return { startTime, endTime, consultationType };
};

const Availability = mongoose.model("Availability", availabilitySchema);

module.exports = Availability;