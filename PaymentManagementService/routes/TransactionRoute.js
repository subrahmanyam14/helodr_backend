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

module.exports = router;