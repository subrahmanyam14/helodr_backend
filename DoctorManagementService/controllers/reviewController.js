const Review = require('../models/Review');
const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

/**
 * @desc    Submit a review for a completed appointment
 * @route   POST /api/reviews
 * @access  Private (Patient)
 */
const submitReview = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { appointmentId, rating, feedback, aspects, isAnonymous } = req.body;
    const patientId = req.user.id;

    // Validate appointment exists and belongs to patient
    const appointment = await Appointment.findOne({
      _id: appointmentId,
      patient: patientId,
      status: 'completed'
    }).session(session);

    if (!appointment) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Appointment not found or not completed'
      });
    }

    // Check if review already exists for this appointment
    const existingReview = await Review.findOne({
      appointment: appointmentId
    }).session(session);

    if (existingReview) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Review already submitted for this appointment'
      });
    }

    // Create review
    const review = await Review.create([{
      appointment: appointmentId,
      patient: patientId,
      doctor: appointment.doctor,
      hospital: appointment.hospital,
      rating,
      feedback,
      aspects,
      isAnonymous,
      status: 'pending', // Default status, can be moderated later
      isVerifiedConsultation: true // Since it comes from a real appointment
    }], { session });

    // Update appointment with review reference
    appointment.review = review[0]._id;
    await appointment.save({ session });

    // Create notification for doctor
    await Notification.create([{
      user: appointment.doctor,
      type: 'new_review',
      message: `You received a new ${rating}-star rating from a patient`,
      referenceId: review[0]._id
    }], { session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: review[0]
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Review submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get reviews for a doctor
 * @route   GET /api/reviews/doctor/:doctorId
 * @access  Public
 */
const getDoctorReviews = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;
    const skip = (page - 1) * limit;

    let query = { doctor: doctorId, status: 'approved' };

    // Filter by rating if provided
    if (rating) {
      query.rating = parseInt(rating);
    }

    const reviews = await Review.find(query)
      .populate('patient', 'fullName profilePhoto')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments(query);

    // Calculate average rating
    const stats = await Review.aggregate([
      { $match: { doctor: mongoose.Types.ObjectId(doctorId), status: 'approved' } },
      { 
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratingCounts: {
            $push: {
              rating: '$rating',
              count: 1
            }
          }
        }
      },
      {
        $project: {
          averageRating: { $round: ['$averageRating', 1] },
          totalReviews: 1,
          ratingDistribution: {
            $reduce: {
              input: [1, 2, 3, 4, 5],
              initialValue: [],
              in: {
                $concatArrays: [
                  '$$value',
                  [{
                    rating: '$$this',
                    count: {
                      $size: {
                        $filter: {
                          input: '$ratingCounts',
                          as: 'item',
                          cond: { $eq: ['$$item.rating', '$$this'] }
                        }
                      }
                    }
                  }]
                ]
              }
            }
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: reviews,
      stats: stats[0] || { averageRating: 0, totalReviews: 0, ratingDistribution: [] },
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get doctor reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get doctor reviews',
      error: error.message
    });
  }
};

/**
 * @desc    Get a patient's reviews
 * @route   GET /api/reviews/patient
 * @access  Private (Patient)
 */
const getPatientReviews = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ patient: patientId })
      .populate('doctor', 'user')
      .populate({
        path: 'doctor',
        populate: {
          path: 'user',
          select: 'fullName profilePhoto'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({ patient: patientId });

    res.status(200).json({
      success: true,
      data: reviews,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get patient reviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get patient reviews',
      error: error.message
    });
  }
};

/**
 * @desc    Update a review
 * @route   PUT /api/reviews/:id
 * @access  Private (Patient)
 */
const updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const patientId = req.user.id;
    const { rating, feedback, aspects, isAnonymous } = req.body;

    const review = await Review.findOneAndUpdate(
      { _id: id, patient: patientId },
      { rating, feedback, aspects, isAnonymous, status: 'pending' }, // Reset status for moderation
      { new: true, runValidators: true }
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.status(200).json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update review',
      error: error.message
    });
  }
};

/**
 * @desc    Delete a review
 * @route   DELETE /api/reviews/:id
 * @access  Private (Patient)
 */
const deleteReview = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const patientId = req.user.id;

    // Find and delete review
    const review = await Review.findOneAndDelete({
      _id: id,
      patient: patientId
    }).session(session);

    if (!review) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    // Remove review reference from appointment
    await Appointment.updateOne(
      { _id: review.appointment },
      { $unset: { review: 1 } }
    ).session(session);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('Delete review error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete review',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

module.exports = {
  submitReview,
  getDoctorReviews,
  getPatientReviews,
  updateReview,
  deleteReview
};