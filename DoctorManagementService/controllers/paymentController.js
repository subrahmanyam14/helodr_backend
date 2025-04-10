const Payment = require('../models/Payment');
const Appointment = require('../models/Appointment');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const mongoose = require('mongoose');
const axios = require('axios'); // For payment gateway integration

/**
 * @desc    Initiate payment for an appointment
 * @route   POST /api/payments/initiate
 * @access  Private (Patient)
 */
const initiatePayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { appointmentId, paymentMethod } = req.body;
    const patientId = req.user.id;

    // Validate appointment exists and belongs to patient
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: patientId
    }).session(session);

    if (!appointment) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

    // Check if payment already exists
    const existingPayment = await Payment.findOne({
      appointment: appointmentId
    }).session(session);

    if (existingPayment) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Payment already initiated for this appointment',
        paymentId: existingPayment._id
      });
    }

    // Create payment record
    const payment = await Payment.create([{
      appointment: appointmentId,
      doctor: appointment.doctor,
      patient: patientId,
      amount: appointment.payment.amount,
      paymentMethod,
      status: 'pending'
    }], { session });

    // Update appointment with payment reference
    appointment.payment = payment[0]._id;
    await appointment.save({ session });

    // For online payments, create payment gateway order
    if (paymentMethod !== 'cash') {
      const order = await createPaymentGatewayOrder(
        payment[0]._id,
        payment[0].amount,
        req.user
      );

      payment[0].gateway = {
        name: 'razorpay', // Example gateway
        transactionId: order.id
      };
      await payment[0].save({ session });
    }

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: payment[0],
      // Include gateway order details for client-side processing
      order: paymentMethod !== 'cash' ? order : null
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Payment initiation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate payment',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Verify and capture payment
 * @route   POST /api/payments/verify
 * @access  Private (Patient)
 */
const verifyPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { paymentId, gatewayResponse } = req.body;
    const patientId = req.user.id;

    // Get payment record
    const payment = await Payment.findOne({
      _id: paymentId,
      patient: patientId
    }).session(session);

    if (!payment) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Verify payment with gateway (example for Razorpay)
    if (payment.paymentMethod !== 'cash') {
      const isValid = await verifyGatewayPayment(
        payment.gateway.transactionId,
        gatewayResponse
      );

      if (!isValid) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Payment verification failed'
        });
      }
    }

    // Update payment status
    payment.status = payment.paymentMethod === 'cash' ? 'authorized' : 'captured';
    payment.gateway.referenceId = gatewayResponse.razorpay_payment_id; // Example field
    await payment.save({ session });

    // Update appointment status
    const appointment = await Appointment.findByIdAndUpdate(
      payment.appointment,
      { 'payment.status': 'paid', status: 'confirmed' },
      { new: true, session }
    );

    // Create transaction record
    await Transaction.create([{
      user: patientId,
      type: 'appointment_payment',
      amount: payment.amount,
      referenceId: payment._id,
      referenceType: 'Payment',
      status: 'completed',
      metadata: {
        appointment: appointment._id,
        doctor: payment.doctor
      }
    }], { session });

    // Credit doctor's wallet (minus platform commission)
    if (payment.status === 'captured') {
      const Doctor = mongoose.model('Doctor');
      const doctor = await Doctor.findById(payment.doctor).session(session);
      
      if (doctor) {
        const commissionRate = doctor.wallet.commissionRate || 20;
        const doctorShare = payment.amount * (1 - commissionRate/100);
        
        await doctor.creditToWallet(
          doctorShare,
          'appointment',
          payment._id
        );
      }
    }

    await session.commitTransaction();

    // Send payment confirmation notification
    await sendPaymentNotification(payment, appointment);

    res.status(200).json({
      success: true,
      data: payment,
      appointment
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get payment details
 * @route   GET /api/payments/:id
 * @access  Private (Patient/Doctor)
 */
const getPaymentDetails = async (req, res) => {
  try {
    const { id } = req.params;
    let query = { _id: id };

    // Patients can only see their own payments
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    }
    // Doctors can see payments for their appointments
    else if (req.user.role === 'doctor') {
      query.doctor = req.user.doctorId;
    }

    const payment = await Payment.findOne(query)
      .populate('appointment')
      .populate('patient', 'fullName')
      .populate('doctor', 'user');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment details',
      error: error.message
    });
  }
};

/**
 * @desc    Get payments for a user
 * @route   GET /api/payments
 * @access  Private (Patient/Doctor)
 */
const getUserPayments = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;
    let query = {};

    // Patients can only see their own payments
    if (req.user.role === 'patient') {
      query.patient = req.user.id;
    }
    // Doctors can see payments for their appointments
    else if (req.user.role === 'doctor') {
      query.doctor = req.user.doctorId;
    }

    if (status) {
      query.status = status;
    }

    const payments = await Payment.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('appointment')
      .populate('patient', 'fullName')
      .populate('doctor', 'user');

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get user payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payments',
      error: error.message
    });
  }
};

// Helper function to create payment gateway order
async function createPaymentGatewayOrder(paymentId, amount, user) {
  // Example using Razorpay
  const options = {
    amount: amount * 100, // Convert to paise
    currency: 'INR',
    receipt: `pay_${paymentId}`,
    notes: {
      paymentId,
      patientId: user.id,
      patientName: user.fullName
    }
  };

  try {
    const response = await axios.post('https://api.razorpay.com/v1/orders', options, {
      auth: {
        username: process.env.RAZORPAY_KEY_ID,
        password: process.env.RAZORPAY_KEY_SECRET
      }
    });
    return response.data;
  } catch (error) {
    console.error('Payment gateway error:', error);
    throw new Error('Failed to create payment order');
  }
}

// Helper function to verify payment with gateway
async function verifyGatewayPayment(orderId, gatewayResponse) {
  // Example verification logic for Razorpay
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
  hmac.update(orderId + '|' + gatewayResponse.razorpay_payment_id);
  const generatedSignature = hmac.digest('hex');

  return generatedSignature === gatewayResponse.razorpay_signature;
}

// Helper function to send payment notifications
async function sendPaymentNotification(payment, appointment) {
  const Notification = mongoose.model('Notification');
  
  await Notification.create([
    {
      user: payment.patient,
      type: 'payment_success',
      message: `Payment of ₹${payment.amount} for appointment was successful`,
      referenceId: payment._id
    },
    {
      user: payment.doctor,
      type: 'payment_received',
      message: `Payment received for appointment with ${appointment.patient.fullName}`,
      referenceId: payment._id
    }
  ]);
}

module.exports = {
  initiatePayment,
  verifyPayment,
  getPaymentDetails,
  getUserPayments
};