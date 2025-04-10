const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/auth');

// Submit review
router.post(
  '/',
  protect,
  authorize('patient'),
  reviewController.submitReview
);

// Get doctor reviews
router.get(
  '/doctor/:doctorId',
  reviewController.getDoctorReviews
);

// Get patient's reviews
router.get(
  '/patient',
  protect,
  authorize('patient'),
  reviewController.getPatientReviews
);

// Update review
router.put(
  '/:id',
  protect,
  authorize('patient'),
  reviewController.updateReview
);

// Delete review
router.delete(
  '/:id',
  protect,
  authorize('patient'),
  reviewController.deleteReview
);

module.exports = router;