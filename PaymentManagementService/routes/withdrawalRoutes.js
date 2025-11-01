const express = require("express");
const router = express.Router();
const withdrawalController = require("../controllers/withdrawalController");
const walletController = require("../controllers/walletController");
const { protect, authorize } = require("../middleware/auth");

// Doctor routes
router.get(
  "/doctor/withdrawals",
  protect,
  authorize("doctor"),
  withdrawalController.getDoctorWithdrawals
);

router.post(
  "/doctor/withdraw",
  protect,
  authorize("doctor"),
  withdrawalController.initiateWithdrawal
);

router.patch(
  "/doctor/withdrawals/:withdrawalId/verify",
  protect,
  authorize("doctor"),
  withdrawalController.verifyDoctorReceipt
);

// Wallet routes for doctors
router.get(
  "/doctor/wallet/balance",
  protect,
  authorize("doctor"),
  walletController.getWalletBalance
);

router.get(
  "/doctor/wallet/available-transactions",
  protect,
  authorize("doctor"),
  walletController.getAvailableTransactions
);

// Hospital admin routes
router.get(
  "/hospital/withdrawals",
  protect,
  authorize("hospitaladmin"),
  withdrawalController.getHospitalWithdrawals
);

router.post(
  "/hospital/withdrawals/:withdrawalId/generate-otp",
  protect,
  authorize("hospitaladmin"),
  withdrawalController.generateDoctorOTP
);

router.patch(
  "/hospital/withdrawals/:withdrawalId/record-payment",
  protect,
  authorize("hospitaladmin"),
  withdrawalController.recordDoctorPayment
);

// Admin routes
router.get(
  "/admin/withdrawals",
  protect,
  authorize("admin", "superadmin", "hospitaladmin", "doctor"),
  withdrawalController.getAllWithdrawals
);

router.patch(
  "/admin/withdrawals/:withdrawalId/approve",
  protect,
  authorize("admin", "superadmin"),
  withdrawalController.approveWithdrawal
);

router.patch(
  "/admin/withdrawals/:withdrawalId/reject",
  protect,
  authorize("admin", "superadmin"),
  withdrawalController.rejectWithdrawal
);

router.patch(
  "/admin/withdrawals/:withdrawalId/record-hospital-transfer",
  protect,
  authorize("admin", "superadmin"),
  withdrawalController.recordHospitalTransfer
);

module.exports = router;