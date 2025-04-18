const Razorpay = require("razorpay");
const crypto = require("crypto");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
const Appointment = require("../models/Appointment");
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

    // Rest of your existing processing logic...
    const baseAmount = parseInt(amount);
    const gstAmount = Math.round(baseAmount * 18 / 100);
    const totalAmount = baseAmount + gstAmount;

    // 1. Create payment record
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
    await paymentDoc.save({ session });
    
    // 2. Process payment to distribute to doctor's wallet
    const result = await payment.processPayment();
    
    // 3. Create patient transaction
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
      razorpayPaymentId: razorpay_payment_id,
      doctorShare: result.doctorShare,
      platformCommission: result.platformCommission
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
}

const processPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    if (payment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        message: "Payment must be captured before processing"
      });
    }

    const result = await payment.processPayment();

    res.status(200).json({
      success: true,
      message: "Payment processed successfully",
      doctorShare: result.doctorShare,
      platformCommission: result.platformCommission
    });
  } catch (error) {
    console.error("Payment Processing Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process payment",
      error: error.message
    });
  }
};

// STEP 4: Refund payment
const refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason, initiatedBy } = req.body;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    const refundedPayment = await payment.processRefund(amount, reason, initiatedBy);

    // Send notifications about the refund
    await Notification.create([
      {
        referenceId: payment.appointment,
        user: payment.patient,
        message: `Refund of ₹${amount} processed for your appointment`,
        type: "refund"
      },
      {
        referenceId: payment.appointment,
        user: payment.doctor,
        message: `Refund of ₹${amount} processed for appointment`,
        type: "refund"
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      payment: refundedPayment
    });
  } catch (error) {
    console.error("Payment Refund Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process refund",
      error: error.message
    });
  }
};

// Get payment details
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

// Get payments for a user (doctor or patient)
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

// Get payment statistics (for admin dashboard)
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

module.exports = { createRazorpayOrder, checkPaymentStatus, verifyRazorpayPayment, processPayment, refundPayment, getPaymentDetails, getUserPayments, getPaymentStats, getPayments, createDummyPayment }