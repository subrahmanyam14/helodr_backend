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
    default: 15
  },
  bufferTime: {
    type: Number,
    default: 0
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
        }
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

// Indexes
availabilitySchema.index({ doctor: 1, isActive: 1, 'schedule.day': 1 });
availabilitySchema.index({ doctor: 1, 'bookedSlots.date': 1, 'bookedSlots.status': 1 });

// Helper function to compare dates ignoring time
function isSameDay(date1, date2) {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1).toISOString().split('T')[0];
  const d2 = new Date(date2).toISOString().split('T')[0];
  return d1 === d2;
}

// Helper function to get day name from date
function getDayName(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(date).getDay()];
}

// Helper method to generate time slots
availabilitySchema.methods.generateTimeSlots = function(startTime, endTime) {
  const slots = [];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let current = new Date();
  current.setHours(startHour, startMinute, 0, 0);
  
  const end = new Date(current);
  end.setHours(endHour, endMinute, 0, 0);
  
  if (end <= current) {
    end.setDate(end.getDate() + 1);
  }
  
  while (current < end) {
    const slotEnd = new Date(current.getTime() + this.slotDuration * 60000);
    if (slotEnd > end) break;
    
    const hours = current.getHours().toString().padStart(2, '0');
    const minutes = current.getMinutes().toString().padStart(2, '0');
    slots.push(`${hours}:${minutes}`);
    current = new Date(slotEnd.getTime() + this.bufferTime * 60000);
  }
  
  return slots;
};

// Method to find an override for a specific date
availabilitySchema.methods.findOverrideForDate = function(date) {
  const targetDate = new Date(date);
  for (const override of this.overrides) {
    if (isSameDay(override.date, targetDate)) {
      return override;
    }
  }
  return null;
};

// Method to check slot availability
availabilitySchema.methods.isSlotAvailable = function(date, startTime, consultationType) {
  const targetDate = new Date(date);
  const dayOfWeek = getDayName(targetDate);
  
  // Check for booking conflicts
  const isAlreadyBooked = this.bookedSlots.some(slot => 
    isSameDay(slot.date, targetDate) && 
    slot.startTime === startTime && 
    slot.consultationType === consultationType &&
    slot.status === "booked"
  );
  
  if (isAlreadyBooked) return false;
  
  // Check override first
  const override = this.findOverrideForDate(targetDate);
  
  if (override) {
    if (!override.isAvailable) return false;
    
    return override.shifts.some(shift => {
      if (startTime < shift.startTime || startTime >= shift.endTime) {
        return false;
      }
      return shift.consultationTypes?.some(ct => ct.type === consultationType);
    });
  } else {
    // Check regular schedule
    const daySchedule = this.schedule.find(s => s.day === dayOfWeek);
    if (!daySchedule) return false;
    
    return daySchedule.shifts.some(shift => {
      if (!shift.isActive || startTime < shift.startTime || startTime >= shift.endTime) {
        return false;
      }
      return shift.consultationTypes?.some(ct => ct.type === consultationType);
    });
  }
};

// Method to get available slots for a date
availabilitySchema.methods.getAvailableSlotsForDate = function(date) {
  const targetDate = new Date(date);
  const dayOfWeek = getDayName(targetDate);
  
  const availableSlots = {
    clinic: { slots: [] },
    video: { slots: [] }
  };
  
  const override = this.findOverrideForDate(targetDate);
  
  if (override) {
    if (!override.isAvailable) return availableSlots;
    
    override.shifts.forEach(shift => {
      const timeSlots = this.generateTimeSlots(shift.startTime, shift.endTime);
      
      shift.consultationTypes?.forEach(consType => {
        const type = consType.type;
        
        timeSlots.forEach(slotTime => {
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
    });
  } else {
    const daySchedule = this.schedule.find(s => s.day === dayOfWeek);
    if (!daySchedule) return availableSlots;
    
    daySchedule.shifts.filter(s => s.isActive).forEach(shift => {
      const timeSlots = this.generateTimeSlots(shift.startTime, shift.endTime);
      
      shift.consultationTypes?.forEach(consType => {
        const type = consType.type;
        
        timeSlots.forEach(slotTime => {
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
    });
  }
  
  return availableSlots;
};

// Method to book a slot
availabilitySchema.methods.bookSlot = async function(date, startTime, consultationType, appointmentId) {
  if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
    throw new Error("Invalid appointment ID format");
  }
  
  if (!this.isSlotAvailable(date, startTime, consultationType)) {
    throw new Error(`Slot is not available for ${consultationType} consultation`);
  }
  
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