const TopDoctorListing = require("../models/TopDoctorListing");
const ListingPlan = require("../models/ListingPlan");
const Doctor = require("../models/Doctor");
const ListingPayment = require("../models/ListingPayment");

// Create Top Doctor Listing
exports.createTopDoctorListing = async (req, res) => {
  try {
    const {
      doctor,
      plan,
      isFeatured,
      featuredOrder,
      adminNotes
    } = req.body;

    // Validation: Check if required fields are provided
    if (!doctor || !plan) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID and Plan ID are required fields"
      });
    }

    // Validation: Check if doctor exists
    const doctorExists = await Doctor.findById(doctor);
    if (!doctorExists) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found"
      });
    }

    // Validation: Check if plan exists and get plan details
    const planDetails = await ListingPlan.findById(plan);
    if (!planDetails) {
      return res.status(404).json({
        success: false,
        message: "Listing plan not found"
      });
    }

    // Validation: Check if plan is active
    if (!planDetails.isActive) {
      return res.status(400).json({
        success: false,
        message: "Selected listing plan is not active"
      });
    }

    // Validation: Check if doctor already has an active listing
    const existingActiveListing = await TopDoctorListing.findOne({
      doctor,
      isActive: true,
      endDate: { $gt: new Date() }
    });

    if (existingActiveListing) {
      return res.status(400).json({
        success: false,
        message: "This doctor already has an active top listing"
      });
    }


    // Role-based validation for featured listings
    let finalIsFeatured = false;
    let finalFeaturedOrder = 0;

    if (req.user.role === 'admin') {
      // Admin can set featured status
      finalIsFeatured = isFeatured !== undefined ? isFeatured : false;
      finalFeaturedOrder = featuredOrder !== undefined ? featuredOrder : 0;
    } else {
      // Non-admin users cannot create featured listings
      if (isFeatured === true) {
        return res.status(403).json({
          success: false,
          message: "Only admins can create featured listings"
        });
      }
      if (featuredOrder !== undefined && featuredOrder > 0) {
        return res.status(403).json({
          success: false,
          message: "Only admins can set featured order"
        });
      }
    }

    // Validation: Check if adminNotes is provided and valid
    let finalAdminNotes = '';
    if (adminNotes !== undefined && adminNotes !== null && adminNotes.trim() !== '') {
      finalAdminNotes = adminNotes.trim();
    }

    const topDoctorListing = new TopDoctorListing({
      doctor,
      user: req.user._id,
      plan,
      isFeatured: finalIsFeatured,
      featuredOrder: finalFeaturedOrder,
      adminNotes: finalAdminNotes,
      addedByAdmin: req.user.role === 'admin',
      adminAddedBy: req.user.role === 'admin' ? req.user._id : undefined
    });

    await topDoctorListing.save();

    // Populate with specific fields
    await topDoctorListing.populate([
      {
        path: 'doctor',
        select: 'name email specialization experience registrationNumber'
      },
      {
        path: 'user',
        select: 'name email role'
      },
      {
        path: 'plan',
        select: 'name type amount currency features'
      },
      {
        path: 'adminAddedBy',
        select: 'name email'
      }
    ]);

    res.status(201).json({
      success: true,
      message: "Top doctor listing created successfully",
      data: topDoctorListing
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "An active listing already exists for this doctor"
      });
    }
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get All Top Doctor Listings
exports.getAllTopDoctorListings = async (req, res) => {
  try {
    const { isActive, isFeatured, doctor, addedByAdmin } = req.query;
    let filter = {};

    // Admin can see all, users can only see their own
    if (req.user.role !== 'admin') {
      filter.user = req.user._id;
    }

    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isFeatured !== undefined) filter.isFeatured = isFeatured === 'true';
    if (doctor) filter.doctor = doctor;
    if (addedByAdmin !== undefined) filter.addedByAdmin = addedByAdmin === 'true';

    const topDoctorListings = await TopDoctorListing.find(filter)
      .populate('user plan payment adminAddedBy')
      .populate({
        path: 'doctor',
        select: 'bio languages experience registrationNumber specializations review address fullName'
      })
      .sort({ featuredOrder: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: topDoctorListings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Single Top Doctor Listing
exports.getTopDoctorListing = async (req, res) => {
  try {
    const topDoctorListing = await TopDoctorListing.findOne({ doctor: req.params.id })
      .populate('user plan payment adminAddedBy')
      .populate({
        path: 'doctor',
        select: 'bio languages experience registrationNumber specializations review address'
      });

    if (!topDoctorListing) {
      return res.status(404).json({
        success: false,
        message: "Top doctor listing not found"
      });
    }

    // Users can only access their own listings unless admin
    // if (req.user.role !== 'admin' && topDoctorListing.user._id.toString() !== req.user._id.toString()) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Access denied"
    //   });
    // }

    res.status(200).json({
      success: true,
      data: topDoctorListing
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Top Doctor Listing
exports.updateTopDoctorListing = async (req, res) => {
  try {
    const {
      plan,
      payment,
      isFeatured,
      featuredOrder,
      adminNotes
    } = req.body;

    // Check if listing exists and user has permission
    const existingListing = await TopDoctorListing.findById(req.params.id)
      .populate('plan')
      .populate('payment');

    if (!existingListing) {
      return res.status(404).json({
        success: false,
        message: "Top doctor listing not found"
      });
    }

    // Create update object with only non-empty fields
    const updateData = {};

    // Helper function to check if value is not empty
    const isValidValue = (value) => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') return value.trim() !== '';
      if (typeof value === 'object' && !(value instanceof Date)) {
        return Object.keys(value).length > 0;
      }
      return true;
    };

    // Validation for plan field
    let selectedPlan = null;
    if (isValidValue(plan)) {
      selectedPlan = await ListingPlan.findById(plan);
      if (!selectedPlan) {
        return res.status(404).json({
          success: false,
          message: "Listing plan not found"
        });
      }
      updateData.plan = plan;
    }

    // Validation for payment field
    let paymentData = null;
    if (isValidValue(payment)) {
      updateData.payment = payment;

      // Fetch payment details to check if payment status changed to paid
      paymentData = await ListingPayment.findById(payment);
    }

    // Enhanced function to calculate dates based on multiple scenarios
    const calculateListingDates = async (plan, existingListing, paymentData) => {
      const now = new Date();
      let startDate, endDate;

      // Get the current plan (new one or existing)
      const currentPlan = plan || existingListing.plan;

      if (!currentPlan) {
        throw new Error('No plan found for date calculation');
      }

      // Scenario 1: Renewal or extension (current listing is still active or recently expired)
      if (existingListing.endDate && existingListing.endDate >= now) {
        // Extend from current end date
        startDate = existingListing.endDate;
        endDate = new Date(existingListing.endDate);

        if (currentPlan.type === 'monthly') {
          endDate.setMonth(endDate.getMonth() + 1);
        } else if (currentPlan.type === 'annual') {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }

        console.log(`🔄 Renewal: Extending from ${startDate} to ${endDate}`);
      }
      // Scenario 2: Reactivation (listing expired or never had dates)
      else {
        // Start from current date
        startDate = now;
        endDate = new Date(now);

        if (currentPlan.type === 'monthly') {
          endDate.setMonth(endDate.getMonth() + 1);
        } else if (currentPlan.type === 'annual') {
          endDate.setFullYear(endDate.getFullYear() + 1);
        }

        console.log(`🆕 New/Reactivation: Starting from ${startDate} to ${endDate}`);
      }

      return { startDate, endDate };
    };

    // Auto-set start and end dates when payment is updated to paid
    if (paymentData && paymentData.paymentStatus === 'paid') {
      try {
        const planToUse = selectedPlan || existingListing.plan;

        if (planToUse) {
          const { startDate, endDate } = await calculateListingDates(
            planToUse,
            existingListing,
            paymentData
          );

          updateData.startDate = startDate;
          updateData.endDate = endDate;

          // Also activate the listing when payment is successful
          updateData.isActive = true;

          console.log(`✅ Payment successful: Dates set to ${startDate} - ${endDate}`);
        }
      } catch (error) {
        console.error('Error calculating dates:', error);
        return res.status(400).json({
          success: false,
          message: "Error calculating listing dates: " + error.message
        });
      }
    }

    // Manual date validation (only if provided in request and not auto-calculated)
    if (!updateData.startDate && isValidValue(req.body.startDate)) {
      const parsedStartDate = new Date(req.body.startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid start date format"
        });
      }
      updateData.startDate = parsedStartDate;
    }

    if (!updateData.endDate && isValidValue(req.body.endDate)) {
      const parsedEndDate = new Date(req.body.endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid end date format"
        });
      }

      // Check if end date is after start date
      const startDateToCheck = updateData.startDate || existingListing.startDate;
      if (startDateToCheck && parsedEndDate <= startDateToCheck) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date"
        });
      }

      updateData.endDate = parsedEndDate;
    }

    // Rest of the function remains the same...
    // Validation for adminNotes field
    if (isValidValue(adminNotes)) {
      updateData.adminNotes = adminNotes.trim();
    }

    // Validation for metadata field
    if (isValidValue(req.body.metadata)) {
      updateData.metadata = req.body.metadata;
    }

    // Only admin can update featured status and active status
    if (req.user.role === 'admin') {
      if (isFeatured !== undefined && isFeatured !== null) {
        updateData.isFeatured = isFeatured;
      }

      if (isValidValue(featuredOrder)) {
        if (isNaN(featuredOrder) || featuredOrder < 0) {
          return res.status(400).json({
            success: false,
            message: "Featured order must be a positive number"
          });
        }
        updateData.featuredOrder = parseInt(featuredOrder);
      }

      if (req.body.isActive !== undefined && req.body.isActive !== null) {
        updateData.isActive = req.body.isActive;

        // If activating, check if end date is in future
        if (req.body.isActive === true) {
          const endDateToCheck = updateData.endDate || existingListing.endDate;
          if (endDateToCheck && endDateToCheck <= new Date()) {
            return res.status(400).json({
              success: false,
              message: "Cannot activate listing with expired end date"
            });
          }
        }
      }
    } else {
      // Non-admin users cannot update admin-only fields
      if (isFeatured !== undefined || featuredOrder !== undefined || req.body.isActive !== undefined) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Only admins can update featured status and active status"
        });
      }
    }

    // Check if any valid fields are provided to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update"
      });
    }

    // Add updatedAt timestamp
    updateData.updatedAt = new Date();

    const topDoctorListing = await TopDoctorListing.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'doctor',
        select: 'name email specialization experience registrationNumber'
      },
      {
        path: 'user',
        select: 'name email role'
      },
      {
        path: 'plan',
        select: 'name type amount currency features'
      },
      {
        path: 'payment',
        select: 'amount status paymentDate paymentStatus startDate endDate'
      },
      {
        path: 'adminAddedBy',
        select: 'name email'
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Top doctor listing updated successfully",
      data: topDoctorListing
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "An active listing already exists for this doctor"
      });
    }
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Delete Top Doctor Listing
exports.deleteTopDoctorListing = async (req, res) => {
  try {
    const topDoctorListing = await TopDoctorListing.findById(req.params.id);

    if (!topDoctorListing) {
      return res.status(404).json({
        success: false,
        message: "Top doctor listing not found"
      });
    }

    if (req.user.role !== 'admin' && topDoctorListing.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    await TopDoctorListing.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Top doctor listing deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Active Top Doctor Listings (Public endpoint)
exports.getActiveTopDoctorListings = async (req, res) => {
  try {
    // Parse pagination parameters from query string
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Validate pagination parameters
    if (page < 1) {
      return res.status(400).json({
        success: false,
        message: 'Page number must be greater than 0'
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limit must be between 1 and 100'
      });
    }

    // Get total count for pagination info
    const totalCount = await TopDoctorListing.countDocuments({
      isActive: true,
      endDate: { $gt: new Date() }
    });

    // Calculate total pages
    const totalPages = Math.ceil(totalCount / limit);

    // Fetch paginated results
    const topDoctorListings = await TopDoctorListing.find({
      isActive: true,
      endDate: { $gt: new Date() }
    })
      .populate({
        path: 'doctor',
        select: 'bio languages experience registrationNumber specializations review address qualifications ',
        populate: {
          path: 'user',
          select: 'fullName profilePhoto email mobileNumber city state dateOfBirth gender'
        }
      })
      .populate({
        path: 'user',
        select: 'fullName profilePhoto email mobileNumber'
      })
      .populate({
        path: 'plan',
        select: 'name type amount currency features'
      })
      .sort({ 
        featuredOrder: 1, 
        isFeatured: -1, 
        createdAt: -1 
      })
      .skip(skip)
      .limit(limit);

    // Transform the data to include user information in a more accessible format
    const transformedListings = topDoctorListings.map(listing => {
      const listingObj = listing.toObject();
      
      // Extract user data from doctor or direct user reference
      let userData = {};
      
      if (listingObj.doctor && listingObj.doctor.user) {
        // Get user data from doctor's user reference
        userData = {
          fullName: listingObj.doctor.user.fullName,
          profilePhoto: listingObj.doctor.user.profilePhoto,
          email: listingObj.doctor.user.email,
          mobileNumber: listingObj.doctor.user.mobileNumber,
          city: listingObj.doctor.user.city,
          state: listingObj.doctor.user.state,
          dateOfBirth: listingObj.doctor.user.dateOfBirth,
          gender: listingObj.doctor.user.gender
        };
      } else if (listingObj.user) {
        // Fallback to direct user reference
        userData = {
          fullName: listingObj.user.fullName,
          profilePhoto: listingObj.user.profilePhoto,
          email: listingObj.user.email,
          mobileNumber: listingObj.user.mobileNumber
        };
      }
      
      // Combine doctor and user data
      return {
        ...listingObj,
        doctor: {
          ...listingObj.doctor,
          user: userData
        },
        // Additional computed fields for easier frontend consumption
        displayInfo: {
          name: userData.fullName || listingObj.doctor?.fullName,
          profilePhoto: userData.profilePhoto,
          specialization: listingObj.doctor?.specializations?.[0] || 'General Medicine',
          experience: listingObj.doctor?.experience || 0,
          rating: listingObj.doctor?.review?.averageRating || 0,
          ratingCount: listingObj.doctor?.review?.count || 0,
          city: listingObj.doctor?.address?.city || userData.city,
          consultationFee: listingObj.doctor?.clinicConsultationFee?.consultationFee || 0,
          languages: listingObj.doctor?.languages || []
        }
      };
    });

    // Build pagination response
    const paginationInfo = {
      currentPage: page,
      totalPages: totalPages,
      totalCount: totalCount,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      limit: limit
    };

    res.status(200).json({
      success: true,
      count: transformedListings.length,
      pagination: paginationInfo,
      data: transformedListings
    });
  } catch (error) {
    console.error('Error fetching top doctor listings:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// Enhanced helper function for date calculations
exports.calculateListingDates = async (paymentId, planId, existingListing = null) => {
  try {
    const payment = await ListingPayment.findById(paymentId);
    const plan = await ListingPlan.findById(planId);

    if (!payment || !plan) {
      throw new Error('Payment or plan not found');
    }

    // Only calculate dates if payment is successful
    if (payment.paymentStatus === 'paid') {
      const now = new Date();
      let startDate, endDate;

      // If we have existing listing data, use it for smart date calculation
      if (existingListing && existingListing.endDate) {
        const currentEndDate = new Date(existingListing.endDate);

        // If current listing is still active, extend from end date
        if (currentEndDate >= now) {
          startDate = currentEndDate;
          endDate = new Date(currentEndDate);
        } else {
          // Listing expired, start from now
          startDate = now;
          endDate = new Date(now);
        }
      } else {
        // No existing listing, start from now
        startDate = now;
        endDate = new Date(now);
      }

      // Calculate end date based on plan type
      if (plan.type === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (plan.type === 'annual') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }

      return {
        startDate,
        endDate,
        isActive: true
      };
    }

    return null;
  } catch (error) {
    throw error;
  }
};

// Function to handle payment history and prevent duplicates
exports.handlePaymentUpdate = async (listingId, newPaymentId, planId) => {
  try {
    const listing = await TopDoctorListing.findById(listingId)
      .populate('plan')
      .populate('payment');

    const newPayment = await ListingPayment.findById(newPaymentId);

    if (!newPayment || newPayment.paymentStatus !== 'paid') {
      throw new Error('Payment not found or not successful');
    }

    // Check if this payment is already associated with any listing
    const existingListingWithSamePayment = await TopDoctorListing.findOne({
      payment: newPaymentId,
      _id: { $ne: listingId }
    });

    if (existingListingWithSamePayment) {
      throw new Error('This payment is already associated with another listing');
    }

    // Calculate dates considering existing listing
    const dateUpdates = await this.calculateListingDates(newPaymentId, planId, listing);

    const updateData = {
      payment: newPaymentId,
      plan: planId,
      ...dateUpdates,
      updatedAt: new Date()
    };

    const updatedListing = await TopDoctorListing.findByIdAndUpdate(
      listingId,
      updateData,
      { new: true, runValidators: true }
    );

    return updatedListing;
  } catch (error) {
    throw error;
  }
};