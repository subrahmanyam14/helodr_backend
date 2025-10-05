const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
// const Review = require('../models/Review');
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
    if (appointment.review && appointment.review.rating) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Review already submitted for this appointment'
      });
    }

    // Create review within appointment
    appointment.review = {
      rating,
      feedback,
      aspects,
      isAnonymous,
      createdAt: new Date()
    };

    await appointment.save({ session });

    // Create notification for doctor
    await Notification.create([{
      user: appointment.doctor,
      type: 'new_review',
      message: `You received a new ${rating}-star rating from a patient`,
      referenceId: appointment._id
    }], { session });

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      data: appointment
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

const getDoctorReviewAnalytics = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { period = '30', startDate, endDate } = req.query;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required"
      });
    }

    // Build date filter
    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        'review.createdAt': {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
    } else {
      const days = parseInt(period);
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - days);
      dateFilter = {
        'review.createdAt': { $gte: periodStart }
      };
    }

    // Build match criteria - only appointments with reviews
    const matchCriteria = {
      doctor: new mongoose.Types.ObjectId(doctorId),
      'review.rating': { $exists: true, $ne: null },
      ...dateFilter
    };

    const analytics = await Appointment.aggregate([
      { $match: matchCriteria },
      {
        $facet: {
          // Overall statistics
          overallStats: [
            {
              $group: {
                _id: null,
                totalReviews: { $sum: 1 },
                averageRating: { $avg: "$review.rating" }
              }
            }
          ],

          // Rating distribution
          ratingDistribution: [
            {
              $group: {
                _id: "$review.rating",
                count: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ],

          // Aspect ratings analysis
          aspectAnalysis: [
            {
              $group: {
                _id: null,
                avgWaitingTime: { $avg: "$review.aspects.waitingTime" },
                avgStaffCourteousness: { $avg: "$review.aspects.staffCourteousness" },
                avgDoctorKnowledge: { $avg: "$review.aspects.doctorKnowledge" },
                avgDoctorFriendliness: { $avg: "$review.aspects.doctorFriendliness" },
                avgTreatmentExplanation: { $avg: "$review.aspects.treatmentExplanation" },
                waitingTimeCount: { 
                  $sum: { $cond: [{ $ne: ["$review.aspects.waitingTime", null] }, 1, 0] }
                },
                staffCourtCount: { 
                  $sum: { $cond: [{ $ne: ["$review.aspects.staffCourteousness", null] }, 1, 0] }
                },
                doctorKnowCount: { 
                  $sum: { $cond: [{ $ne: ["$review.aspects.doctorKnowledge", null] }, 1, 0] }
                },
                doctorFriendCount: { 
                  $sum: { $cond: [{ $ne: ["$review.aspects.doctorFriendliness", null] }, 1, 0] }
                },
                treatmentExpCount: { 
                  $sum: { $cond: [{ $ne: ["$review.aspects.treatmentExplanation", null] }, 1, 0] }
                }
              }
            }
          ],

          // Monthly trends (last 12 months)
          monthlyTrends: [
            {
              $group: {
                _id: {
                  year: { $year: "$review.createdAt" },
                  month: { $month: "$review.createdAt" }
                },
                reviewCount: { $sum: 1 },
                averageRating: { $avg: "$review.rating" }
              }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
            { $limit: 12 }
          ],

          // Recent reviews sample
          recentReviews: [
            { $sort: { 'review.createdAt': -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "users",
                localField: "patient",
                foreignField: "_id",
                as: "patientInfo"
              }
            },
            {
              $project: {
                appointmentId: "$_id",
                appointmentDate: "$date",
                appointmentType: "$appointmentType",
                rating: "$review.rating",
                feedback: "$review.feedback",
                aspects: "$review.aspects",
                createdAt: "$review.createdAt",
                patientName: { $arrayElemAt: ["$patientInfo.fullName", 0] },
                patientEmail: { $arrayElemAt: ["$patientInfo.email", 0] }
              }
            }
          ],

          // Review trends by day (for line chart)
          dailyTrends: [
            {
              $group: {
                _id: {
                  date: {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$review.createdAt"
                    }
                  }
                },
                count: { $sum: 1 },
                avgRating: { $avg: "$review.rating" }
              }
            },
            { $sort: { "_id.date": 1 } },
            { $limit: 30 }
          ]
        }
      }
    ]);

    const result = analytics[0];

    // Format the response
    const response = {
      success: true,
      data: {
        overview: {
          totalReviews: result.overallStats[0]?.totalReviews || 0,
          averageRating: parseFloat((result.overallStats[0]?.averageRating || 0).toFixed(2))
        },
        
        ratingDistribution: result.ratingDistribution.reduce((acc, item) => {
          acc[`${item._id}star`] = item.count;
          return acc;
        }, { '1star': 0, '2star': 0, '3star': 0, '4star': 0, '5star': 0 }),
        
        aspectRatings: result.aspectAnalysis[0] ? {
          waitingTime: {
            average: parseFloat((result.aspectAnalysis[0].avgWaitingTime || 0).toFixed(2)),
            count: result.aspectAnalysis[0].waitingTimeCount || 0
          },
          staffCourteousness: {
            average: parseFloat((result.aspectAnalysis[0].avgStaffCourteousness || 0).toFixed(2)),
            count: result.aspectAnalysis[0].staffCourtCount || 0
          },
          doctorKnowledge: {
            average: parseFloat((result.aspectAnalysis[0].avgDoctorKnowledge || 0).toFixed(2)),
            count: result.aspectAnalysis[0].doctorKnowCount || 0
          },
          doctorFriendliness: {
            average: parseFloat((result.aspectAnalysis[0].avgDoctorFriendliness || 0).toFixed(2)),
            count: result.aspectAnalysis[0].doctorFriendCount || 0
          },
          treatmentExplanation: {
            average: parseFloat((result.aspectAnalysis[0].avgTreatmentExplanation || 0).toFixed(2)),
            count: result.aspectAnalysis[0].treatmentExpCount || 0
          }
        } : {},
        
        monthlyTrends: result.monthlyTrends.map(trend => ({
          month: `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}`,
          reviewCount: trend.reviewCount,
          averageRating: parseFloat(trend.averageRating.toFixed(2))
        })),
        
        dailyTrends: result.dailyTrends.map(trend => ({
          date: trend._id.date,
          reviewCount: trend.count,
          averageRating: parseFloat(trend.avgRating.toFixed(2))
        })),
        
        recentReviews: result.recentReviews,
      },
      filters: {
        doctorId,
        period: period + ' days',
        dateRange: startDate && endDate ? { startDate, endDate } : null
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching doctor review analytics:', error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch review analytics",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

    let query = { 
      doctor: doctorId, 
      status: 'completed',
      'review.rating': { $exists: true }
    };

    // Filter by rating if provided
    if (rating) {
      query['review.rating'] = parseInt(rating);
    }

    const appointmentsWithReviews = await Appointment.find(query)
      .populate('patient', 'fullName profilePhoto')
      .sort({ 'review.createdAt': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Appointment.countDocuments(query);

    // Calculate average rating and stats
    const stats = await Appointment.aggregate([
      { 
        $match: { 
          doctor: new mongoose.Types.ObjectId(doctorId), 
          status: 'completed',
          'review.rating': { $exists: true }
        } 
      },
      { 
        $group: {
          _id: null,
          averageRating: { $avg: '$review.rating' },
          totalReviews: { $sum: 1 },
          ratingCounts: {
            $push: {
              rating: '$review.rating',
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

    // Transform appointments to reviews format for response
    const reviews = appointmentsWithReviews.map(appt => ({
      _id: appt._id,
      appointment: appt._id,
      patient: appt.patient,
      doctor: appt.doctor,
      hospital: appt.hospital,
      rating: appt.review.rating,
      feedback: appt.review.feedback,
      aspects: appt.review.aspects,
      isAnonymous: appt.review.isAnonymous,
      createdAt: appt.review.createdAt,
      status: 'approved' // Since we're only querying completed appointments with reviews
    }));

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

    const appointmentsWithReviews = await Appointment.find({ 
      patient: patientId,
      'review.rating': { $exists: true }
    })
    .populate('doctor', 'user')
    .populate({
      path: 'doctor',
      populate: {
        path: 'user',
        select: 'fullName profilePhoto'
      }
    })
    .sort({ 'review.createdAt': -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Appointment.countDocuments({ 
      patient: patientId,
      'review.rating': { $exists: true }
    });

    // Transform appointments to reviews format for response
    const reviews = appointmentsWithReviews.map(appt => ({
      _id: appt._id,
      appointment: appt._id,
      patient: appt.patient,
      doctor: appt.doctor,
      hospital: appt.hospital,
      rating: appt.review.rating,
      feedback: appt.review.feedback,
      aspects: appt.review.aspects,
      isAnonymous: appt.review.isAnonymous,
      createdAt: appt.review.createdAt,
      status: 'approved'
    }));

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

    const appointment = await Appointment.findOneAndUpdate(
      { 
        _id: id, 
        patient: patientId,
        'review.rating': { $exists: true }
      },
      { 
        $set: {
          'review.rating': rating,
          'review.feedback': feedback,
          'review.aspects': aspects,
          'review.isAnonymous': isAnonymous
        } 
      },
      { new: true, runValidators: true }
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }

    res.status(200).json({
      success: true,
      data: appointment
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

    // Find and remove review from appointment
    const appointment = await Appointment.findOneAndUpdate(
      { 
        _id: id,
        patient: patientId
      },
      { 
        $unset: { review: 1 } 
      },
      { new: true, session }
    );

    if (!appointment) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Appointment not found'
      });
    }

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
  getDoctorReviewAnalytics,
  getDoctorReviews,
  getPatientReviews,
  updateReview,
  deleteReview
};