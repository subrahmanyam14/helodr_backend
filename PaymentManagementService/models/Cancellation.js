const cancellationSchema = new mongoose.Schema({
  appointment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment",
    required: true,
    unique: true
  },
  initiatedBy: {
    type: String,
    enum: ["patient", "doctor", "hospital", "system", "admin"],
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  penaltyAmount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Pre-save to calculate refund/penalty
cancellationSchema.pre('save', async function(next) {
  if (this.isNew) {
    const Appointment = mongoose.model('Appointment');
    const appointment = await Appointment.findById(this.appointment)
      .populate('payment');
    
    if (appointment) {
      // Calculate time before appointment
      const appointmentDateTime = new Date(appointment.date);
      const [hours, minutes] = appointment.slot.startTime.split(':');
      appointmentDateTime.setHours(parseInt(hours), parseInt(minutes));
      
      const hoursBefore = (appointmentDateTime - new Date()) / (1000 * 60 * 60);
      
      // Apply cancellation policy
      if (this.initiatedBy === 'doctor') {
        this.refundAmount = appointment.payment.amount; // Full refund
        this.penaltyAmount = hoursBefore < 24 ? appointment.payment.amount * 0.2 : 0;
      } else {
        // Patient cancellation
        if (hoursBefore >= 24) {
          this.refundAmount = appointment.payment.amount;
        } else if (hoursBefore >= 6) {
          this.refundAmount = appointment.payment.amount * 0.5;
        }
      }
    }
  }
  next();
});

const Cancellation = mongoose.model("Cancellation", cancellationSchema);