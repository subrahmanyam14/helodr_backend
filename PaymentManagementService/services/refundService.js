// services/refundService.js
const Payment = require('../models/Payment');

class RefundService {
  /**
   * Process automatic refund for cancelled appointment
   */
  static async processAppointmentCancellation(appointmentId) {
    try {
      const payment = await Payment.findOne({ appointment: appointmentId });
      
      if (!payment) {
        throw new Error('No payment found for this appointment');
      }
      
      // Check if within refundable period (e.g., 24 hours before appointment)
      // Add your business logic here
      
      return Payment.autoRefund(payment._id, 'Appointment cancelled by patient');
    } catch (error) {
      console.error('RefundService error:', error);
      throw error;
    }
  }
  
  /**
   * Process automatic refund for rejected appointment
   */
  static async processAppointmentRejection(appointmentId) {
    try {
      const payment = await Payment.findOne({ appointment: appointmentId });
      
      if (!payment) {
        throw new Error('No payment found for this appointment');
      }
      
      return Payment.autoRefund(payment._id, 'Appointment rejected by doctor');
    } catch (error) {
      console.error('RefundService error:', error);
      throw error;
    }
  }
  
  /**
   * Process partial refund if applicable
   */
  static async processPartialRefund(paymentId, refundAmount, reason) {
    try {
      const payment = await Payment.findById(paymentId);
      
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      return payment.processRefund(refundAmount, reason, 'system');
    } catch (error) {
      console.error('RefundService error:', error);
      throw error;
    }
  }
}

module.exports = RefundService;