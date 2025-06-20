const express = require("express");
const router = express.Router();

const {getDoctorRevenue, getWalletSummary, getFinancialSummary, getFinancialData} = require("../controllers/DoctorWalletController");
const { protect, authorize } = require("../middleware/auth");

router.get("/totalincome", protect, authorize("doctor"),  getDoctorRevenue);
router.get('/coinscollected', protect, authorize("doctor"), getWalletSummary);
router.get('/financial/summary', protect, authorize("doctor"), getFinancialSummary);
router.get('/financial/dashboard', protect, authorize("doctor"), getFinancialData);

module.exports = router;
