// services/refundService.js
const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');

class RefundService {
  // Refund policy: Array of [hours before appointment, refund percentage]
  static REFUND_POLICY = [
    [72, 100],  // More than 72 hours: 100% refund
    [48, 75],   // Between 48-72 hours: 75% refund
    [24, 50],   // Between 24-48 hours: 50% refund
    [12, 25],   // Between 12-24 hours: 25% refund
    [0, 0]      // Less than 12 hours: 0% refund
  ];

  /**
   * Process automatic refund for cancelled appointment with time-based refund calculation
   * @param {String} appointmentId - The appointment ID
   * @param {String} cancelledBy - Who cancelled the appointment ('patient', 'doctor', 'hospital', 'system')
   * @param {String} reason - Reason for cancellation
   */
  static async processAppointmentCancellation(appointmentId, cancelledBy = 'patient', reason = 'Appointment cancelled') {
    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
      // Find appointment and payment
      const appointment = await Appointment.findById(appointmentId).session(session);
      
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const payment = await Payment.findOne({ appointment: appointmentId }).session(session);
      
      if (!payment) {
        throw new Error('No payment found for this appointment');
      }

      if (payment.status !== 'captured') {
        throw new Error('Payment must be in captured state to process refund');
      }

      // Calculate hours remaining until appointment
      const now = new Date();
      const appointmentTime = new Date(appointment.date);
      const hoursRemaining = (appointmentTime - now) / (1000 * 60 * 60);
      
      console.log(`Hours remaining until appointment: ${hoursRemaining}`);

      // Determine refund percentage based on policy
      let refundPercentage = 0;
      for (const [hourThreshold, percentage] of this.REFUND_POLICY) {
        if (hoursRemaining >= hourThreshold) {
          refundPercentage = percentage;
          break;
        }
      }
      
      console.log(`Refund percentage: ${refundPercentage}%`);

      // Calculate refund amount
      const refundAmount = payment.totalamount * (refundPercentage / 100);
      
      // Cancel appointment first
      appointment.status = 'cancelled';
      appointment.cancellation = {
        initiatedBy: cancelledBy,
        reason: reason,
        refundAmount: refundAmount,
        cancelledAt: new Date()
      };
      
      await appointment.save({ session });
      console.log('Appointment cancelled successfully');

      // If no refund is due, just end the transaction
      if (refundPercentage === 0) {
        await session.commitTransaction();
        session.endSession();
        return { 
          success: true, 
          message: 'Appointment cancelled with no refund due to cancellation policy',
          refundPercentage: 0,
          refundAmount: 0
        };
      }

      // Process the refund
      const refundResult = await payment.processRefund(
        refundAmount, 
        `${reason} (${refundPercentage}% refund based on ${hoursRemaining.toFixed(2)} hours notice)`, 
        cancelledBy
      );

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        message: `Appointment cancelled and ${refundPercentage}% refund processed`,
        refundPercentage,
        refundAmount,
        payment: refundResult.payment,
        razorpayRefund: refundResult.razorpayRefund
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('RefundService error:', error);
      throw error;
    }
  }
  
  /**
   * Process automatic refund for rejected appointment
   * Doctor rejections typically qualify for full refunds
   */
  static async processAppointmentRejection(appointmentId) {
    return this.processAppointmentCancellation(
      appointmentId, 
      'doctor', 
      'Appointment rejected by doctor'
    );
  }
  
  /**
   * Process hospital-initiated cancellation
   * Hospital/admin cancellations typically qualify for full refunds
   */
  static async processHospitalCancellation(appointmentId, reason = 'Cancelled by hospital') {
    // Override the refund policy for hospital cancellations - always 100%
    const session = await require('mongoose').startSession();
    session.startTransaction();

    try {
      const appointment = await Appointment.findById(appointmentId).session(session);
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const payment = await Payment.findOne({ appointment: appointmentId }).session(session);
      if (!payment) {
        throw new Error('No payment found for this appointment');
      }

      // Cancel appointment first
      appointment.status = 'cancelled';
      appointment.cancellation = {
        initiatedBy: 'hospital',
        reason: reason,
        refundAmount: payment.totalamount, // Full refund
        cancelledAt: new Date()
      };
      
      await appointment.save({ session });

      // Process full refund
      const refundResult = await payment.processRefund(
        payment.totalamount,
        `${reason} (Full refund - hospital cancellation)`,
        'hospital'
      );

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        message: 'Appointment cancelled by hospital with full refund',
        refundPercentage: 100,
        refundAmount: payment.totalamount,
        payment: refundResult.payment,
        razorpayRefund: refundResult.razorpayRefund
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('RefundService error:', error);
      throw error;
    }
  }
  
  /**
   * Process partial refund with custom amount if needed
   */
  static async processCustomRefund(paymentId, refundAmount, reason, initiatedBy = 'admin') {
    try {
      const payment = await Payment.findById(paymentId);
      
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      if (refundAmount <= 0 || refundAmount > payment.totalamount) {
        throw new Error('Invalid refund amount');
      }
      
      return payment.processRefund(refundAmount, reason, initiatedBy);
    } catch (error) {
      console.error('RefundService error:', error);
      throw error;
    }
  }

  /**
   * Get refund amount that would be applied based on current time
   * Use this method to show users what refund they would get before confirming cancellation
   */
  static async calculatePotentialRefund(appointmentId) {
    try {
      const appointment = await Appointment.findById(appointmentId);
      
      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const payment = await Payment.findOne({ appointment: appointmentId });
      
      if (!payment) {
        throw new Error('No payment found for this appointment');
      }

      // Calculate hours remaining until appointment
      const now = new Date();
      const appointmentTime = new Date(appointment.date);
      const hoursRemaining = (appointmentTime - now) / (1000 * 60 * 60);
      
      // Determine refund percentage based on policy
      let refundPercentage = 0;
      for (const [hourThreshold, percentage] of this.REFUND_POLICY) {
        if (hoursRemaining >= hourThreshold) {
          refundPercentage = percentage;
          break;
        }
      }
      
      // Calculate refund amount
      const refundAmount = payment.totalamount * (refundPercentage / 100);
      
      return {
        appointmentDate: appointment.date,
        hoursRemaining: hoursRemaining.toFixed(2),
        refundPercentage,
        refundAmount,
        totalAmount: payment.totalamount
      };
    } catch (error) {
      console.error('RefundService error:', error);
      throw error;
    }
  }
}

module.exports = RefundService;