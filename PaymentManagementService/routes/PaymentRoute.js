const express = require('express');
const router = express.Router();
const PaymentController = require("../controllers/PaymentController");

// These two should be real functions exported from the controller
router.post("/create-paypal-order", PaymentController.createPaypalOrder);
router.post("/capture-paypal-order", PaymentController.capturePaypalOrder);

module.exports = router;
