// paymentRoutes.js
const express = require("express");
const router = express.Router();
const { 
  createRazorpayOrder, 
  checkPaymentStatus, 
  verifyRazorpayPayment, 
  refundPayment, 
  getPaymentDetails, 
  getUserPayments, 
  getPaymentStats, 
  getPayments, 
  createDummyPayment,
  completeAppointment,
  getUpcomingEarnings,
  getDoctorWalletStats,
  rejectAppointment, 
  cancelAppointment,
  getPotentialRefund,
  adminProcessRefund
} = require("../controllers/PaymentController");
const { protect, authorize } = require("../middleware/auth");

// Payment creation and verification
router.post("/create-order", protect, createRazorpayOrder);
router.get("/check-status/:orderId", protect, checkPaymentStatus);
router.post("/verify", protect, verifyRazorpayPayment);

// Appointment completion endpoint
router.post("/appointments/:appointmentId/complete", protect, completeAppointment);

//
router.post("/refund/:paymentId", protect, refundPayment);

router.post("/cancelAppointment", protect, cancelAppointment);

// Payment details and history
router.get("/:paymentId", protect, getPaymentDetails);
router.get("/user/:userId/:userType", protect, getUserPayments);

// Upcoming earnings
router.get("/upcoming-earnings/:doctorId", protect, getUpcomingEarnings);
router.get("/wallet-stats/:doctorId", protect, getDoctorWalletStats);

// Admin routes
router.get("/stats", protect, authorize("admin"), getPaymentStats);
router.get("/", protect, authorize("admin"), getPayments);

// For testing
router.post("/dummy-payment", protect, createDummyPayment);

module.exports = router;