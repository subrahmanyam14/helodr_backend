const express = require("express");
const router = express.Router();

const {getDoctorRevenue, getWalletSummary} = require("../controllers/DoctorWalletController");
const { protect, authorize } = require("../middleware/auth");

router.get("/totalincome", protect, authorize("doctor"),  getDoctorRevenue);
router.get('/coinscollected', protect, authorize("doctor"), getWalletSummary);

module.exports = router;
