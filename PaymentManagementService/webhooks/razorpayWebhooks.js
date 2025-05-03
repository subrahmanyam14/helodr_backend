// webhooks/razorpayWebhooks.js
const { razorpay } = require('../utils/razorpayUtils');
const Payment = require('../models/Payment');
const crypto = require('crypto');

/**
 * Verify Razorpay webhook signature
 */
const verifyWebhookSignature = (req) => {
  const razorpaySignature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  const generatedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');
    
  return generatedSignature === razorpaySignature;
};

/**
 * Handle Razorpay refund webhook
 */
const handleRefundWebhook = async (req, res) => {
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body.event;
  const payload = req.body.payload;

  try {
    if (event === 'refund.created') {
      // Update your system that refund is initiated
      const payment = await Payment.findOneAndUpdate(
        { 'gateway.transactionId': payload.payment.entity.id },
        { $set: { 'refund.status': 'pending' } },
        { new: true }
      );
      
      if (!payment) {
        console.warn('Payment not found for refund:', payload.payment.entity.id);
      }
    }
    else if (event === 'refund.processed') {
      // Refund completed successfully
      const payment = await Payment.findOneAndUpdate(
        { 'gateway.transactionId': payload.payment.entity.id },
        { $set: { 'refund.status': 'processed' } },
        { new: true }
      );
      
      if (!payment) {
        console.warn('Payment not found for processed refund:', payload.payment.entity.id);
      }
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  handleRefundWebhook
};