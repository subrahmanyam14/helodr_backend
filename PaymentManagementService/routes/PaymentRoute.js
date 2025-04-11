const express = require('express');
const router = express.Router();
const {processPaypalPayment} = require('../controllers/PaymentController');

router.post('/', processPaypalPayment);

module.exports = router;
