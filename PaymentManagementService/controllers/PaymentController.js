const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const UpcomingEarnings = require("../models/UpcomingEarnings");
const Appointment = require("../models/Appointment");
const Wallet = require("../models/Wallet");

require("dotenv").config();

const razorpay = new Razorpay({
  key_id: process.env.KEY_ID,
  key_secret: process.env.KEY_SECRET,
});

// STEP 1: Create Razorpay Order
const createRazorpayOrder = async (req, res) => {
  const { amount } = req.body;

  try {
    const baseAmount = parseInt(amount);
    const gstAmount = Math.round(baseAmount * 18 / 100);
    const totalAmount = baseAmount + gstAmount;

    const options = {
      amount: totalAmount * 100, // Razorpay uses paisa
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`,
      method: 'upi', // Specify UPI as the payment method
      notes: {
        description: 'Appointment Booking Payment'
      },
      upi: {
        flow: 'qr', // Request QR code flow
      }
    };

    const order = await razorpay.orders.create(options);

    // The QR code URL will be in the order response
    const qrCodeUrl = order.upi.qr_code;

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      qrCodeUrl: qrCodeUrl, // Send QR code URL to frontend
      upiDeepLink: order.upi.intent_url // Also send UPI deep link for apps
    });
  } catch (error) {
    console.error("Razorpay Order Creation Error:", error);
    res.status(500).json({ success: false, message: "Failed to create order" });
  }
};

// Check payment status of an order
const checkPaymentStatus = async (req, res) => {
  const { orderId } = req.params;

  try {
    const order = await razorpay.orders.fetch(orderId);
    
    res.status(200).json({
      success: true,
      status: order.status,
      paid: order.status === 'paid',
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    console.error("Payment Status Check Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to check payment status" 
    });
  }
};

// STEP 2: Verify and Capture Payment
const verifyRazorpayPayment = async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    appointmentId,
    doctorId,
    patientId,
    amount,
  } = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // First verify the payment with Razorpay
    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    
    if (payment.status !== 'captured') {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Payment not captured" });
    }

    // Then verify the signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    // Get appointment details for upcoming earnings
    const appointment = await Appointment.findById(appointmentId).session(session);
    if (!appointment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Calculate amounts
    const baseAmount = parseInt(amount);
    const gstAmount = Math.round(baseAmount * 18 / 100);
    const totalAmount = baseAmount + gstAmount;

    // Create payment record with appointment date
    const paymentData = {
      appointment: appointmentId,
      doctor: doctorId,
      patient: patientId,
      amount: baseAmount,
      gstamount: gstAmount,
      totalamount: totalAmount,
      status: "captured",
      paymentMethod: "online",
      gateway: {
        name: "razorpay",
        transactionId: razorpay_payment_id,
        referenceId: razorpay_order_id
      }
    };

    // Use the createPayment method which now handles upcoming earnings
    const paymentDoc = await Payment.createPayment(paymentData, appointment.date);
    
    // Create notifications
    const notificationDocs = [
      new Notification({
        referenceId: appointmentId,
        user: patientId,
        message: "Appointment confirmed",
        type: "payment"
      }),
      new Notification({
        referenceId: appointmentId,
        user: doctorId,
        message: "Appointment scheduled",
        type: "payment"
      })
    ];
    
    await Notification.insertMany(notificationDocs, { session });
    
    // Update appointment status
    appointment.status = "confirmed";
    appointment.payment = paymentDoc._id;
    await appointment.save({ session });
    
    await session.commitTransaction();
    session.endSession();
    
    // Get the upcoming earning details for response
    const upcomingEarning = await UpcomingEarnings.findById(paymentDoc.upcomingEarning)
      .populate('doctor', 'name');

    res.status(200).json({
      success: true,
      message: "Payment verified and captured successfully",
      payment: paymentDoc,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      upcomingEarning: {
        amount: upcomingEarning.amount,
        scheduledDate: upcomingEarning.scheduledDate
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Razorpay Payment Verification Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Payment verification failed",
      error: error.message 
    });
  }
};

// Create dummy payment (for testing purposes)
const createDummyPayment = async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    appointmentId,
    doctorId,
    patientId,
    amount
  } = req.body;
  const baseAmount = parseInt(amount);
  const gstAmount = Math.round(baseAmount * 18 / 100);
  const totalAmount = baseAmount + gstAmount;
  const session = await mongoose.startSession();
  session.startTransaction();
 
  try {
    // 1. Create payment record - fixed to use proper session pattern with new document
    const paymentDoc = new Payment({
      appointment: appointmentId,
      doctor: doctorId,
      patient: patientId,
      amount: baseAmount,
      gstamount: gstAmount,
      totalamount: totalAmount,
      status: "captured",
      paymentMethod: "online",
      gateway: {
        name: "razorpay",
        transactionId: razorpay_payment_id,
        referenceId: razorpay_order_id
      }
    });
    
    const payment = await paymentDoc.save({ session });
    
    // 2. Process payment to distribute to doctor's wallet
    const result = await payment.processPayment();
    
    // 3. Create patient transaction - fixed session pattern
    const transactionDoc = new Transaction({
      user: patientId,
      type: "appointment_payment",
      amount: totalAmount,
      referenceId: payment._id,
      referenceType: "Payment",
      status: "completed",
      notes: `Payment for appointment ${appointmentId}`
    });
    
    await transactionDoc.save({ session });
    
    // 4. Create notifications
    const notificationDocs = [
      new Notification({
        referenceId: appointmentId,
        user: patientId,
        message: "Appointment confirmed",
        type: "payment"
      }),
      new Notification({
        referenceId: appointmentId,
        user: doctorId,
        message: "Appointment scheduled",
        type: "payment"
      })
    ];
    
    await Notification.insertMany(notificationDocs, { session });
    
    // 5. Update appointment status
    await Appointment.findByIdAndUpdate(
      appointmentId,
      { status: "confirmed" },
      { new: true, runValidators: true, session }
    );
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: "Payment verified and captured successfully",
      payment: payment,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error in createDummyPayment:", error);
    res.status(500).send({
      message: "Internal server error",
      error: error.message,
      success: false
    });
  }
};

// Mark an appointment as completed and process the payment
const completeAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    const appointment = await Appointment.findById(appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ 
        success: false, 
        message: "Appointment not found" 
      });
    }
    
    if (appointment.status === "completed") {
      return res.status(400).json({ 
        success: false, 
        message: "Appointment is already marked as completed" 
      });
    }
    
    // Find the payment for this appointment
    const payment = await Payment.findOne({ appointment: appointmentId })
      .populate('upcomingEarning');
    
    if (!payment) {
      return res.status(404).json({ 
        success: false, 
        message: "Payment not found for this appointment" 
      });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // Update appointment status
      appointment.status = "completed";
      await appointment.save({ session });
      
      // Process the payment to credit doctor's wallet
      if (payment.upcomingEarning && payment.upcomingEarning.status === "pending") {
        const result = await payment.processPayment();
        
        // Create notification for doctor
        await Notification.create([{
          referenceId: appointmentId,
          user: payment.doctor,
          message: `₹${result.doctorShare} added to your wallet for completed appointment`,
          type: "wallet"
        }], { session });
        
        await session.commitTransaction();
        session.endSession();
        
        return res.status(200).json({
          success: true,
          message: "Appointment completed and payment processed",
          appointment,
          doctorShare: result.doctorShare,
          platformCommission: result.platformCommission
        });
      } else {
        await session.commitTransaction();
        session.endSession();
        
        return res.status(200).json({
          success: true,
          message: "Appointment completed but no pending payment to process",
          appointment
        });
      }
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error("Complete Appointment Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to complete appointment",
      error: error.message
    });
  }
};

// Get payment details by ID
const getPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId)
      .populate('appointment', 'appointmentDate status')
      .populate('doctor', 'name email')
      .populate('patient', 'fullName email');

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    res.status(200).json({
      success: true,
      payment
    });
  } catch (error) {
    console.error("Get Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment details"
    });
  }
};

// Get payments for a specific user (doctor or patient)
const getUserPayments = async (req, res) => {
  try {
    const { userId, userType } = req.params;
    const { status, from, to, limit = 10, page = 1 } = req.query;

    const query = {};

    // Set user type filter (doctor or patient)
    query[userType] = userId;

    // Add optional filters
    if (status) query.status = status;

    // Date range filter
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await Payment.find(query)
      .populate('appointment', 'appointmentDate status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      payments
    });
  } catch (error) {
    console.error("Get Payments Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payments"
    });
  }
};

// Get all payments (admin function)
const getPayments = async (req, res) => {
  try {
    const { status, from, to, limit = 10, page = 1 } = req.query;

    const query = {};

    // Add optional filters
    if (status) query.status = status;

    // Date range filter
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await Payment.find(query)
      .populate('appointment', 'appointmentDate status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      pages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      payments
    });
  } catch (error) {
    console.error("Get Payments Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payments"
    });
  }
};

// Get payment statistics for admin dashboard
const getPaymentStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;

    let dateFilter = {};
    const now = new Date();

    // Set date filter based on period
    if (period === 'day') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      dateFilter = { createdAt: { $gte: today } };
    } else if (period === 'week') {
      const lastWeek = new Date(now);
      lastWeek.setDate(now.getDate() - 7);
      dateFilter = { createdAt: { $gte: lastWeek } };
    } else if (period === 'month') {
      const lastMonth = new Date(now);
      lastMonth.setMonth(now.getMonth() - 1);
      dateFilter = { createdAt: { $gte: lastMonth } };
    } else if (period === 'year') {
      const lastYear = new Date(now);
      lastYear.setFullYear(now.getFullYear() - 1);
      dateFilter = { createdAt: { $gte: lastYear } };
    }

    // Get total revenue
    const totalRevenue = await Payment.aggregate([
      { $match: { ...dateFilter, status: 'captured' } },
      { $group: { _id: null, total: { $sum: '$totalamount' } } }
    ]);

    // Get revenue by payment method
    const revenueByMethod = await Payment.aggregate([
      { $match: { ...dateFilter, status: 'captured' } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$totalamount' } } }
    ]);

    // Get count by status
    const countByStatus = await Payment.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.status(200).json({
      success: true,
      totalRevenue: totalRevenue.length ? totalRevenue[0].total : 0,
      revenueByMethod,
      countByStatus
    });
  } catch (error) {
    console.error("Payment Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment statistics"
    });
  }
};

// Get upcoming earnings for a doctor
const getUpcomingEarnings = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { status, from, to } = req.query;
    
    const query = { doctor: doctorId };
    
    // Add optional filters
    if (status) query.status = status;
    
    // Date range filter
    if (from || to) {
      query.scheduledDate = {};
      if (from) query.scheduledDate.$gte = new Date(from);
      if (to) query.scheduledDate.$lte = new Date(to);
    }
    
    const upcomingEarnings = await UpcomingEarnings.find(query)
      .populate({
        path: 'appointment',
        select: 'appointmentType date slot status',
      })
      .sort({ scheduledDate: 1 });
    
    const totalAmount = await UpcomingEarnings.getTotalUpcomingEarnings(doctorId);
    
    res.status(200).json({
      success: true,
      totalUpcoming: totalAmount,
      upcomingEarnings
    });
  } catch (error) {
    console.error("Get Upcoming Earnings Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch upcoming earnings",
      error: error.message
    });
  }
};

// Get wallet statistics for a doctor
const getDoctorWalletStats = async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    // Get wallet details
    const wallet = await Wallet.findOne({ doctor: doctorId });
    
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found for this doctor"
      });
    }
    
    // Get upcoming earnings total
    const upcomingTotal = await UpcomingEarnings.getTotalUpcomingEarnings(doctorId);
    
    // Get recent transactions
    const recentTransactions = await Transaction.find({
      user: doctorId,
      type: { $in: ["doctor_credit", "withdrawal_processed"] }
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    // Get upcoming appointments with earnings
    const upcomingAppointments = await UpcomingEarnings.find({
      doctor: doctorId,
      status: "pending"
    })
    .populate({
      path: 'appointment',
      select: 'appointmentType date slot status patient',
      populate: {
        path: 'patient',
        select: 'fullName'
      }
    })
    .sort({ scheduledDate: 1 })
    .limit(5);
    
    res.status(200).json({
      success: true,
      wallet: {
        current_balance: wallet.current_balance,
        total_earned: wallet.total_earned,
        total_withdrawn: wallet.total_withdrawn,
        commission_rate: wallet.commission_rate
      },
      upcomingEarnings: upcomingTotal,
      recentTransactions,
      upcomingAppointments
    });
  } catch (error) {
    console.error("Get Doctor Wallet Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet statistics",
      error: error.message
    });
  }
};

// Process a refund for a payment
const refundPayment = async (req, res) => {
  const { paymentId } = req.params;
  const { reason } = req.body;
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Find the payment
    const payment = await Payment.findById(paymentId)
      .populate('appointment')
      .session(session);
    
    if (!payment) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ 
        success: false, 
        message: "Payment not found" 
      });
    }
    
    if (payment.status === "refunded") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ 
        success: false, 
        message: "Payment has already been refunded" 
      });
    }
    
    // Check if this is a Razorpay payment that needs to be refunded via API
    if (payment.gateway && payment.gateway.name === "razorpay" && payment.gateway.transactionId) {
      try {
        // Initiate refund with Razorpay
        const refund = await razorpay.payments.refund(payment.gateway.transactionId, {
          amount: payment.totalamount * 100, // Convert to paisa
          notes: { reason: reason || "Appointment cancelled" }
        });
        
        // Update payment record with refund details
        payment.refund = {
          refundId: refund.id,
          amount: refund.amount / 100,
          reason: reason || "Appointment cancelled",
          date: new Date()
        };
      } catch (razorpayError) {
        console.error("Razorpay Refund Error:", razorpayError);
        await session.abortTransaction();
        session.endSession();
        return res.status(500).json({ 
          success: false, 
          message: "Failed to process refund with payment gateway",
          error: razorpayError.message
        });
      }
    }
    
    // Update payment status
    payment.status = "refunded";
    await payment.save({ session });
    
    // Update appointment status
    if (payment.appointment) {
      payment.appointment.status = "cancelled";
      await payment.appointment.save({ session });
    }
    
    // Cancel upcoming earnings if they exist
    if (payment.upcomingEarning) {
      await UpcomingEarnings.findByIdAndUpdate(
        payment.upcomingEarning,
        { status: "cancelled" },
        { session }
      );
    }
    
    // Create refund transaction record
    const transaction = new Transaction({
      user: payment.patient,
      type: "refund",
      amount: payment.totalamount,
      referenceId: payment._id,
      referenceType: "Payment",
      status: "completed",
      notes: `Refund for appointment: ${reason || "Appointment cancelled"}`
    });
    
    await transaction.save({ session });
    
    // Create notifications
    const notificationDocs = [
      new Notification({
        referenceId: payment.appointment._id,
        user: payment.patient,
        message: `Appointment cancelled and refund of ₹${payment.totalamount} initiated`,
        type: "refund"
      }),
      new Notification({
        referenceId: payment.appointment._id,
        user: payment.doctor,
        message: "Appointment has been cancelled",
        type: "appointment"
      })
    ];
    
    await Notification.insertMany(notificationDocs, { session });
    
    await session.commitTransaction();
    session.endSession();
    
    res.status(200).json({
      success: true,
      message: "Payment refunded successfully",
      payment
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Refund Payment Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process refund",
      error: error.message
    });
  }
};


/**
 * Controller to handle appointment cancellation by patient
 */
const cancelAppointment = async (req, res) => {
  const { appointmentId } = req.params;
  const { reason } = req.body;
  
  try {
    // Assuming req.user contains the logged-in user's details
    // Check if the user is authorized to cancel this appointment
    // This would be a separate middleware or function call

    const result = await RefundService.processAppointmentCancellation(
      appointmentId, 
      'patient', 
      reason || 'Cancelled by patient'
    );
    
    res.status(200).json({
      success: true,
      message: `Appointment cancelled successfully. ${result.refundPercentage}% refund processed.`,
      data: result
    });
  } catch (error) {
    console.error('Cancel Appointment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel appointment',
      error: error.message
    });
  }
};

/**
 * Controller to handle appointment rejection by doctor
 */
const rejectAppointment = async (req, res) => {
  const { appointmentId } = req.params;
  const { reason } = req.body;
  
  try {
    // Assuming req.user contains the logged-in doctor's details
    // Check if the doctor is authorized to reject this appointment
    // This would be a separate middleware or function call

    const result = await RefundService.processAppointmentRejection(
      appointmentId,
      'doctor',
      reason || 'Rejected by doctor'
    );
    
    res.status(200).json({
      success: true,
      message: 'Appointment rejected successfully and refund processed',
      data: result
    });
  } catch (error) {
    console.error('Reject Appointment Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject appointment',
      error: error.message
    });
  }
};

/**
 * Controller for admin to process refunds
 */
const adminProcessRefund = async (req, res) => {
  const { paymentId } = req.params;
  const { amount, reason } = req.body;
  
  try {
    // Validate admin permissions
    // This would be done in middleware
    
    const result = await RefundService.processCustomRefund(
      paymentId,
      amount,
      reason || 'Admin initiated refund',
      'admin'
    );
    
    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: result
    });
  } catch (error) {
    console.error('Admin Refund Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};

/**
 * Get potential refund information before cancellation
 */
const getPotentialRefund = async (req, res) => {
  const { appointmentId } = req.params;
  
  try {
    const refundInfo = await RefundService.calculatePotentialRefund(appointmentId);
    
    res.status(200).json({
      success: true,
      message: 'Potential refund calculated',
      data: refundInfo
    });
  } catch (error) {
    console.error('Get Potential Refund Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate potential refund',
      error: error.message
    });
  }
};
// Export all controller functions
module.exports = { 
  createRazorpayOrder, 
  checkPaymentStatus, 
  verifyRazorpayPayment, 
  getPaymentDetails, 
  getUserPayments, 
  getPaymentStats, 
  getPayments, 
  createDummyPayment,
  completeAppointment,
  getUpcomingEarnings,
  getDoctorWalletStats,
  refundPayment,
  rejectAppointment, 
  cancelAppointment,
  getPotentialRefund,
  adminProcessRefund
};