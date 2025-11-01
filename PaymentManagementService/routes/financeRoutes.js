// routes/financeRoutes.js
const express = require('express');
const router = express.Router();
const financeController = require('../controllers/financeController');
const { protect, authorize } = require('../middleware/auth');

// Finance overview routes
router.get('/overview', protect, financeController.getFinanceOverview);
router.get('/transactions', protect, financeController.getTransactions);
router.get('/transactions/summary', protect, financeController.getTransactionSummary);

module.exports = router;