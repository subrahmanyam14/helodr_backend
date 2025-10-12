const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/TransactionController');
const { protect, authorize } = require('../middleware/auth');

// Create a new transaction
router.post(
  '/',
  protect,
  authorize('admin', 'doctor', 'patient'),
  transactionController.createTransaction
);

// Get transactions with filters
router.get(
  '/get-transactions',
  protect,
  authorize('admin', 'doctor', 'patient'),
  transactionController.getTransactions
);

// Get a single transaction by ID
router.get(
  '/:id',
  protect,
  authorize('admin', 'doctor', 'patient'),
  transactionController.getTransactionById
);

// Update transaction status (typically for admin)
router.patch(
  '/:id/status',
  protect,
  authorize('admin'),
  transactionController.updateTransactionStatus
);

// Get transaction statistics
router.get(
  '/stats/summary',
  protect,
  authorize('admin', 'doctor'),
  transactionController.getTransactionStats
);

router.get(
  '/transactions/all',
  protect,
  authorize( 'doctor'),
  transactionController.getAllTransactions
);


router.get(
  '/earings/weeks/months',
  protect,
  authorize( 'doctor'),
  transactionController.getWeekAndMonthEarning
);

router.get(
  '/patient/getPaymentDashboard',
  protect,
  authorize( 'patient'),
  transactionController.getPaymentDashboard
);

// Doctor transaction routes
router.get(
  "/doctor/transactions/credited",
  protect,
  authorize("doctor"),
  transactionController.getDoctorCreditedTransactions
);

router.get(
  "/doctor/transactions/analysis",
  protect,
  authorize("doctor"),
  transactionController.getDoctorTransactionAnalysis
);

router.get(
  "/doctor/transactions/available",
  protect,
  authorize("doctor"),
  transactionController.getAvailableForWithdrawal
);

router.get(
  "/doctor/transactions/history",
  protect,
  authorize("doctor"),
  transactionController.getTransactionHistory
);



module.exports = router;