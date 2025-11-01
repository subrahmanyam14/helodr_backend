const ListingPayment = require("../models/ListingPayment");
const ListingPlan = require("../models/ListingPlan");
const TopDoctorListing = require("../models/TopDoctorListing");
const TopHospitalListing = require("../models/TopHospitalListing");
const HospitalAdvertisement = require("../models/HospitalAdvertisement");
const User = require("../models/User");
const mongoose = require("mongoose");

// Create Dummy Payment (for testing)
exports.createDummyPayment = async (req, res) => {
  try {
    const {
      entityType,
      entity,
      plan,
      amount,
      currency,
      paymentMethod,
      paymentStatus,
      adminNotes,
      metadata
    } = req.body;

    // Validation: Check if required fields are provided
    if (!entityType || !entity || !plan) {
      return res.status(400).json({
        success: false,
        message: "Entity type, entity ID, and plan ID are required fields"
      });
    }

    // Validation: Check if plan exists
    const planExists = await ListingPlan.findById(plan);
    if (!planExists) {
      return res.status(404).json({
        success: false,
        message: "Listing plan not found"
      });
    }

    // Set default amount from plan if not provided
    const finalAmount = amount !== undefined ? amount : planExists.amount;

    // Create dummy payment
    const dummyPayment = new ListingPayment({
      user: req.user._id,
      entityType,
      entity,
      plan,
      amount: finalAmount,
      currency: currency || "INR",
      paymentMethod: paymentMethod || "manual",
      paymentStatus: paymentStatus || "paid",
      status: paymentStatus === "paid" ? "completed" : "pending",
      isManualAddition: true,
      addedByAdmin: req.user.role === 'admin' ? req.user._id : undefined,
      adminNotes,
      metadata,
      isActive: paymentStatus === "paid",
      paidAt: paymentStatus === "paid" ? new Date() : undefined
    });

    // Calculate dates if payment is paid
    if (paymentStatus === "paid") {
      const { startDate, endDate } = calculatePlanDates(planExists);
      dummyPayment.startDate = startDate;
      dummyPayment.endDate = endDate;
    }

    await dummyPayment.save();

    // Populate with related data
    await dummyPayment.populate([
      {
        path: 'user',
        select: 'name email role'
      },
      {
        path: 'plan',
        select: 'name type amount currency features duration'
      },
      {
        path: 'entity',
        select: 'name title'
      },
      {
        path: 'addedByAdmin',
        select: 'name email'
      }
    ]);

    res.status(201).json({
      success: true,
      message: "Dummy payment created successfully",
      data: dummyPayment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Create Manual Payment (Admin only) - Supports Free Plans
exports.createManualPayment = async (req, res) => {
  try {
    // Only admin can create manual payments
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Only admins can create manual payments"
      });
    }

    const {
      user,
      entityType,
      entity,
      plan,
      amount,
      currency,
      paymentStatus,
      startDate,
      endDate,
      adminNotes,
      metadata
    } = req.body;

    // Validation: Check if required fields are provided
    if (!user || !entityType || !entity) {
      return res.status(400).json({
        success: false,
        message: "User ID, entity type, and entity ID are required fields"
      });
    }

    // Validation: Check if user exists
    const userExists = await User.findById(user);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let planDetails = null;
    if (plan) {
      planDetails = await ListingPlan.findById(plan);
      if (!planDetails) {
        return res.status(404).json({
          success: false,
          message: "Listing plan not found"
        });
      }
    }

    // Calculate final amount - handle free plans
    let finalAmount = amount;
    if (finalAmount === undefined && planDetails) {
      finalAmount = planDetails.amount;
    }
    
    // If no amount provided and no plan, set to 0 (free)
    if (finalAmount === undefined) {
      finalAmount = 0;
    }

    // Determine payment method and status for free plans
    let finalPaymentMethod = "manual";
    let finalPaymentStatus = paymentStatus || "paid";
    let finalStatus = "completed";
    
    // Auto-set to free for zero amount payments
    if (finalAmount === 0) {
      finalPaymentMethod = "free";
      finalPaymentStatus = "paid";
      finalStatus = "completed";
    }

    // Calculate dates based on plan or provided dates
    let finalStartDate = startDate ? new Date(startDate) : new Date();
    let finalEndDate = endDate ? new Date(endDate) : null;

    // Calculate dates from plan if available and no end date provided
    if (!finalEndDate && planDetails) {
      const calculatedDates = calculatePlanDates(planDetails, finalStartDate);
      finalEndDate = calculatedDates.endDate;
    } else if (!finalEndDate) {
      // Default to 30 days if no plan and no end date
      finalEndDate = new Date(finalStartDate);
      finalEndDate.setDate(finalEndDate.getDate() + 30);
    }

    // Validate dates
    if (finalEndDate <= finalStartDate) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date"
      });
    }

    // Create manual payment
    const manualPayment = new ListingPayment({
      user,
      entityType,
      entity,
      plan: plan || undefined,
      amount: finalAmount,
      currency: currency || "INR",
      paymentMethod: finalPaymentMethod,
      paymentStatus: finalPaymentStatus,
      status: finalStatus,
      isManualAddition: true,
      addedByAdmin: req.user._id,
      adminNotes,
      metadata,
      isActive: finalPaymentStatus === "paid",
      startDate: finalStartDate,
      endDate: finalEndDate,
      paidAt: finalPaymentStatus === "paid" ? new Date() : undefined
    });

    await manualPayment.save();

    // Populate with related data
    await manualPayment.populate([
      {
        path: 'user',
        select: 'name email role'
      },
      {
        path: 'plan',
        select: 'name type amount currency features duration'
      },
      {
        path: 'entity',
        select: 'name title'
      },
      {
        path: 'addedByAdmin',
        select: 'name email'
      }
    ]);

    res.status(201).json({
      success: true,
      message: finalAmount === 0 ? 
        "Free listing created successfully" : 
        "Manual payment created successfully",
      data: manualPayment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Create Free Listing (Admin only) - Update existing entities only
exports.createFreeListing = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Only admin can create free listings
    if (req.user.role !== 'admin') {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: "Access denied: Only admins can create free listings"
      });
    }

    const {
      user,
      entityType,
      entity,
      plan,
      adminNotes
    } = req.body;

    // Validation: Check if required fields are provided
    if (!user || !entityType || !entity) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "User ID, entity type, and entity ID are required fields"
      });
    }

    // Validation: Check if user exists
    const userExists = await User.findById(user).session(session);
    if (!userExists) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let planDetails = null;
    if (plan) {
      planDetails = await ListingPlan.findById(plan).session(session);
      if (!planDetails) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "Listing plan not found"
        });
      }
    }

    // Calculate dates
    const finalStartDate = new Date();
    let finalEndDate = new Date();
    
    if (planDetails) {
      // Use plan-based calculation
      const calculatedDates = calculatePlanDates(planDetails);
      finalEndDate = calculatedDates.endDate;
    } else {
      // Default to 30 days
      finalEndDate.setDate(finalEndDate.getDate() + 30);
    }

    // Create free payment record
    const freePayment = new ListingPayment({
      user,
      entityType,
      entity,
      plan: plan || undefined,
      amount: 0,
      currency: "INR",
      paymentMethod: "free",
      paymentStatus: "paid",
      status: "completed",
      isManualAddition: true,
      addedByAdmin: req.user._id,
      adminNotes,
      isActive: true,
      startDate: finalStartDate,
      endDate: finalEndDate,
      paidAt: new Date()
    });

    await freePayment.save({ session });

    // Update the respective entity collection based on entityType
    let updatedEntity;
    let entityModel;
    let entityQuery;

    switch (entityType) {
      case 'TopDoctorListing':
        entityModel = TopDoctorListing;
        entityQuery = { _id: entity };
        break;
      case 'TopHospitalListing':
        entityModel = TopHospitalListing;
        entityQuery = { _id: entity };
        break;
      case 'HospitalAdvertisement':
        entityModel = HospitalAdvertisement;
        entityQuery = { _id: entity };
        break;
      default:
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "Invalid entity type"
        });
    }

    // Find existing entity listing - only update if it exists
    const existingEntity = await entityModel.findOne(entityQuery).session(session);

    if (!existingEntity) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `${entityType} not found. Only existing entities can be updated.`
      });
    }

    // Update only the specific fields: isActive, startDate, endDate
    existingEntity.isActive = true;
    existingEntity.startDate = finalStartDate;
    existingEntity.endDate = finalEndDate;
    existingEntity.payment = freePayment._id;
    existingEntity.updatedAt = new Date();

    // Optional: Update plan if provided
    if (plan) {
      existingEntity.plan = plan;
    }

    // Optional: Update admin fields
    existingEntity.addedByAdmin = true;
    existingEntity.adminAddedBy = req.user._id;
    if (adminNotes) {
      existingEntity.adminNotes = adminNotes;
    }

    updatedEntity = await existingEntity.save({ session });

    // Update the payment record with the entity reference
    freePayment.entity = updatedEntity._id;
    await freePayment.save({ session });

    // Populate with related data for response
    await freePayment.populate([
      {
        path: 'user',
        select: 'fullName email role profilePhoto'
      },
      {
        path: 'plan',
        select: 'name type amount currency features duration'
      },
      {
        path: 'entity',
        select: 'doctor hospital title isActive startDate endDate'
      },
      {
        path: 'addedByAdmin',
        select: 'fullName email'
      }
    ]);

    // Also populate the updated entity for comprehensive response
    // await updatedEntity.populate([
    //   {
    //     path: 'doctor',
    //     select: 'fullName specializations registrationNumber'
    //   },
    //   {
    //     path: 'user',
    //     select: 'fullName email'
    //   },
    //   {
    //     path: 'plan',
    //     select: 'name type amount currency'
    //   }
    // ]);

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Free listing activated successfully",
      data: {
        payment: freePayment,
        entity: updatedEntity
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Error creating free listing:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  } finally {
    session.endSession();
  }
};

// Helper function to calculate plan dates
const calculatePlanDates = (plan) => {
  const startDate = new Date();
  const endDate = new Date();
  
  switch (plan.type) {
    case 'monthly':
      endDate.setMonth(endDate.getMonth() + 1);
      break;
    case 'quarterly':
      endDate.setMonth(endDate.getMonth() + 3);
      break;
    case 'annual':
      endDate.setFullYear(endDate.getFullYear() + 1);
      break;
    default:
      endDate.setMonth(endDate.getMonth() + 1); // Default to monthly
  }
  
  return { startDate, endDate };
};

// Helper function to calculate plan dates
// const calculatePlanDates = (plan, customStartDate = null) => {
//   const startDate = customStartDate || new Date();
//   const endDate = new Date(startDate);

//   if (plan.type === 'daily') {
//     endDate.setDate(endDate.getDate() + (plan.duration || 1));
//   } else if (plan.type === 'weekly') {
//     endDate.setDate(endDate.getDate() + (plan.duration || 7));
//   } else if (plan.type === 'monthly') {
//     endDate.setMonth(endDate.getMonth() + (plan.duration || 1));
//   } else if (plan.type === 'annual') {
//     endDate.setFullYear(endDate.getFullYear() + (plan.duration || 1));
//   } else if (plan.type === 'custom' && plan.duration) {
//     // Handle custom duration in days
//     endDate.setDate(endDate.getDate() + plan.duration);
//   } else {
//     // Default fallback - 30 days
//     endDate.setDate(endDate.getDate() + 30);
//   }

//   return { startDate, endDate };
// };

// Get All Payments (Admin only)
exports.getAllPayments = async (req, res) => {
  try {
    // Only admin can access all payments
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Only admins can view all payments"
      });
    }

    const {
      entityType,
      paymentStatus,
      paymentMethod,
      isManualAddition,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20
    } = req.query;

    let filter = {};

    // Apply filters
    if (entityType) filter.entityType = entityType;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (isManualAddition !== undefined) filter.isManualAddition = isManualAddition === 'true';

    // Date range filter
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await ListingPayment.find(filter)
      .populate([
        {
          path: 'user',
          select: 'name email role mobileNumber'
        },
        {
          path: 'plan',
          select: 'name type amount currency features duration'
        },
        {
          path: 'entity',
          select: 'name title'
        },
        {
          path: 'addedByAdmin',
          select: 'name email'
        }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ListingPayment.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    // Calculate summary statistics including free listings
    const totalAmount = await ListingPayment.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const statusSummary = await ListingPayment.aggregate([
      { $match: filter },
      { $group: { _id: "$paymentStatus", count: { $sum: 1 }, amount: { $sum: "$amount" } } }
    ]);

    const methodSummary = await ListingPayment.aggregate([
      { $match: filter },
      { $group: { _id: "$paymentMethod", count: { $sum: 1 }, amount: { $sum: "$amount" } } }
    ]);

    // Count free listings
    const freeListingsCount = await ListingPayment.countDocuments({
      ...filter,
      amount: 0,
      paymentMethod: 'free'
    });

    res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPayments: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      summary: {
        totalAmount: totalAmount[0]?.total || 0,
        totalPayments: total,
        freeListings: freeListingsCount,
        paidListings: total - freeListingsCount,
        statusSummary,
        methodSummary
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Payments by User ID (Admin only)
exports.getPaymentsByUserId = async (req, res) => {
  try {
    // Only admin can access payments by user ID
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Only admins can view payments by user ID"
      });
    }

    const { userId } = req.params;
    const {
      entityType,
      paymentStatus,
      page = 1,
      limit = 20
    } = req.query;

    // Validation: Check if user exists
    const userExists = await User.findById(userId);
    if (!userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let filter = { user: userId };

    // Apply filters
    if (entityType) filter.entityType = entityType;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await ListingPayment.find(filter)
      .populate([
        {
          path: 'plan',
          select: 'name type amount currency features duration'
        },
        {
          path: 'entity',
          select: 'name title'
        },
        {
          path: 'addedByAdmin',
          select: 'name email'
        }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ListingPayment.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    // Calculate user-specific statistics including free listings
    const userStats = await ListingPayment.aggregate([
      { $match: filter },
      { 
        $group: { 
          _id: null,
          totalPayments: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          freeListings: {
            $sum: { $cond: [{ $eq: ["$paymentMethod", "free"] }, 1, 0] }
          },
          paidListings: {
            $sum: { $cond: [{ $ne: ["$paymentMethod", "free"] }, 1, 0] }
          },
          successfulPayments: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] }
          },
          activeListings: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$isActive", true] },
                    { $gt: ["$endDate", new Date()] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const stats = userStats[0] || {
      totalPayments: 0,
      totalAmount: 0,
      freeListings: 0,
      paidListings: 0,
      successfulPayments: 0,
      activeListings: 0
    };

    res.status(200).json({
      success: true,
      data: payments,
      user: {
        id: userExists._id,
        name: userExists.name,
        email: userExists.email
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPayments: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      statistics: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Payment Status (Admin only) - Enhanced with date calculation
exports.updatePaymentStatus = async (req, res) => {
  try {
    // Only admin can update payment status
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Access denied: Only admins can update payment status"
      });
    }

    const { paymentId } = req.params;
    const {
      paymentStatus,
      adminNotes,
      startDate,
      endDate,
      isActive,
      plan
    } = req.body;

    // Validation: Check if payment exists
    const payment = await ListingPayment.findById(paymentId).populate('plan');
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    const updateData = {};

    // Update plan if provided
    if (plan) {
      const planDetails = await ListingPlan.findById(plan);
      if (!planDetails) {
        return res.status(404).json({
          success: false,
          message: "Listing plan not found"
        });
      }
      updateData.plan = plan;

      // Recalculate dates if plan changes and payment is active
      if (payment.paymentStatus === 'paid') {
        const { startDate: newStartDate, endDate: newEndDate } = calculatePlanDates(planDetails);
        updateData.startDate = newStartDate;
        updateData.endDate = newEndDate;
      }
    }

    // Update payment status
    if (paymentStatus) {
      if (!["created", "attempted", "paid", "failed", "refunded", "partially_refunded", "cancelled", "expired"].includes(paymentStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment status"
        });
      }
      updateData.paymentStatus = paymentStatus;

      // Auto-update timestamps based on status
      const now = new Date();
      if (paymentStatus === 'paid' && !payment.paidAt) {
        updateData.paidAt = now;
        updateData.status = 'completed';
        updateData.isActive = true;

        // Calculate dates if not already set
        if (!updateData.startDate && !payment.startDate) {
          const currentPlan = await ListingPlan.findById(updateData.plan || payment.plan);
          if (currentPlan) {
            const calculatedDates = calculatePlanDates(currentPlan);
            updateData.startDate = calculatedDates.startDate;
            updateData.endDate = calculatedDates.endDate;
          } else {
            // Default dates if no plan
            updateData.startDate = now;
            const defaultEndDate = new Date(now);
            defaultEndDate.setDate(defaultEndDate.getDate() + 30);
            updateData.endDate = defaultEndDate;
          }
        }
      } else if ((paymentStatus === 'failed' || paymentStatus === 'cancelled') && !payment.failedAt) {
        updateData.failedAt = now;
        updateData.status = 'failed';
        updateData.isActive = false;
      } else if ((paymentStatus === 'refunded' || paymentStatus === 'partially_refunded') && !payment.refundedAt) {
        updateData.refundedAt = now;
        updateData.status = 'refunded';
        updateData.isActive = false;
      }
    }

    // Update other fields
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate) updateData.endDate = new Date(endDate);
    if (isActive !== undefined) updateData.isActive = isActive;

    // Add updatedAt timestamp
    updateData.updatedAt = new Date();

    const updatedPayment = await ListingPayment.findByIdAndUpdate(
      paymentId,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'user',
        select: 'name email role'
      },
      {
        path: 'plan',
        select: 'name type amount currency features duration'
      },
      {
        path: 'entity',
        select: 'name title'
      },
      {
        path: 'addedByAdmin',
        select: 'name email'
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
      data: updatedPayment
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get My Payments (for logged-in user) - Simplified version
exports.getMyPayments = async (req, res) => {
  try {
    const {
      entityType,
      paymentStatus,
      isActive,
      page = 1,
      limit = 20
    } = req.query;

    let filter = { user: req.user._id };

    // Apply filters
    if (entityType) filter.entityType = entityType;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (isActive !== undefined) {
      if (isActive === 'true') {
        filter.isActive = true;
        filter.endDate = { $gt: new Date() };
      } else {
        filter.$or = [
          { isActive: false },
          { endDate: { $lte: new Date() } }
        ];
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const payments = await ListingPayment.find(filter)
      .populate([
        {
          path: 'plan',
          select: 'name type amount currency features duration'
        },
        {
          path: 'entity',
          // Select common fields that exist across different entity types
          select: 'name title description doctor hospital'
        }
      ])
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ListingPayment.countDocuments(filter);
    const totalPages = Math.ceil(total / parseInt(limit));

    // Add virtual fields for frontend
    const paymentsWithVirtuals = payments.map(payment => {
      const paymentObj = payment.toObject();
      paymentObj.isCurrentlyActive = paymentObj.isActive && paymentObj.endDate && paymentObj.endDate > new Date();
      paymentObj.daysRemaining = paymentObj.isCurrentlyActive ? 
        Math.ceil((new Date(paymentObj.endDate) - new Date()) / (1000 * 60 * 60 * 24)) : 0;
      return paymentObj;
    });

    res.status(200).json({
      success: true,
      data: paymentsWithVirtuals,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalPayments: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.log("error in the getMyPayments", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Payment by ID
exports.getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await ListingPayment.findById(paymentId)
      .populate([
        {
          path: 'user',
          select: 'name email role'
        },
        {
          path: 'plan',
          select: 'name type amount currency features duration'
        },
        {
          path: 'entity',
          select: 'name title'
        },
        {
          path: 'addedByAdmin',
          select: 'name email'
        }
      ]);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found"
      });
    }

    // Users can only access their own payments unless admin
    if (req.user.role !== 'admin' && payment.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    // Add virtual fields
    const paymentObj = payment.toObject();
    paymentObj.isCurrentlyActive = paymentObj.isActive && paymentObj.endDate && paymentObj.endDate > new Date();
    paymentObj.daysRemaining = paymentObj.isCurrentlyActive ? 
      Math.ceil((new Date(paymentObj.endDate) - new Date()) / (1000 * 60 * 60 * 24)) : 0;

    res.status(200).json({
      success: true,
      data: paymentObj
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};