const express = require('express');
const router = express.Router();
const {createRazorpayOrder, checkPaymentStatus, verifyRazorpayPayment, processPayment, refundPayment, getPaymentDetails, getUserPayments, getPaymentStats, getPayments, createDummyPayment} = require("../controllers/PaymentController");

// These two should be real functions exported from the controller
router.post("/create-paypal-order", createRazorpayOrder);
router.get("/check-payment-status/:orderId", checkPaymentStatus);
router.post("/capture-paypal-order", verifyRazorpayPayment);
router.put("/initiate-refund/:paymentId", refundPayment);
router.get("/get-payment/:userId/:userType", getUserPayments);

//doctor routes
router.get("/process-payment/:paymentId", processPayment);

router.post("/create-dummy-payment", createDummyPayment);

router.get("/payment-statics", getPaymentStats);

router.get("/payments", getPayments);

module.exports = router;
