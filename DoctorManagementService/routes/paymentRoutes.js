const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { protect, authorize } = require('../middleware/auth');

// Initiate payment
router.post(
  '/initiate',
  protect,
  authorize('patient'),
  paymentController.initiatePayment
);

// Verify payment
router.post(
  '/verify',
  protect,
  authorize('patient'),
  paymentController.verifyPayment
);

// Get payment details
router.get(
  '/:id',
  protect,
  authorize('patient', 'doctor'),
  paymentController.getPaymentDetails
);

// Get user payments
router.get(
  '/',
  protect,
  authorize('patient', 'doctor'),
  paymentController.getUserPayments
);

module.exports = router;