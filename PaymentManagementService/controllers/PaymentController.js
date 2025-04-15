// controllers/PaymentController.js

const Razorpay = require("razorpay");
const crypto = require("crypto");
const Payment = require("../models/Payment");
const Transaction = require("../models/Transaction");
const Notification = require("../models/Notification");
require("dotenv").config();

const razorpay = new Razorpay({
  key_id: process.env.KEY_ID,
  key_secret: process.env.KEY_SECRET,
});

// STEP 1: Create Razorpay Order
exports.createRazorpayOrder = async (req, res) => {
  const { amount } = req.body;

  try {
    const gstAmount = amount * 0.18;
    const totalAmount = amount + gstAmount;

    const options = {
      amount: totalAmount * 100, // Razorpay uses paisa
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);

    res.status(200).json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error) {
    console.error("Razorpay Order Creation Error:", error);
    res.status(500).json({ success: false, message: "Failed to create order" });
  }
};

// STEP 2: Verify and Capture Payment
exports.verifyRazorpayPayment = async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    appointmentId,
    doctorId,
    patientId,
    amount,
  } = req.body;

  const session = await Payment.startSession();
  session.startTransaction();

  try {
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const gstAmount = amount * 0.18;
    const totalAmount = amount + gstAmount;

    // Save Payment
    const payment = await Payment.create([{
      appointment: appointmentId,
      doctor: doctorId,
      patient: patientId,
      amount,
      gstamount: gstAmount,
      totalamount: totalAmount,
      status: "captured",
      paymentMethod: "online",
      gateway: {
        name: "razorpay",
        transactionId: razorpay_payment_id,
        referenceId: razorpay_order_id
      }
    }], { session });

    // Save Transaction
    await Transaction.create([{
      user: patientId,
      type: "appointment_payment",
      amount: totalAmount,
      referenceId: payment[0]._id,
      referenceType: "Payment",
      status: "completed",
      notes: `Payment for appointment ${appointmentId}`
    }], { session });

    // Send Notifications
    await Notification.create([
      {
        referenceId: appointmentId,
        user: patientId,
        message: "Appointment confirmed",
        type: "payment"
      },
      {
        referenceId: appointmentId,
        user: doctorId,
        message: "Appointment scheduled",
        type: "payment"
      }
    ], { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Payment verified and captured successfully",
      payment: payment[0],
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Razorpay Payment Verification Error:", error);
    res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};
