const HospitalAdvertisement = require("../models/HospitalAdvertisement");
const Hospital = require("../models/Hospital");
const ListingPayment = require("../models/ListingPayment");
const ListingPlan = require("../models/ListingPlan");

// Create Hospital Advertisement
exports.createHospitalAd = async (req, res) => {
  try {
    const {
      hospital,
      plan,
      title,
      description,
      video,
      image,
      titleCard,
      placement,
      adminNotes
      } = req.body;

    // Validation: Check if required fields are provided
    if (!hospital || !title || !placement || !plan) {
      return res.status(400).json({
        success: false,
        message: "Hospital ID, title, and placement are required fields"
      });
    }

    // Validation: Check if hospital exists
    const hospitalExists = await Hospital.findById(hospital);
    if (!hospitalExists) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found"
      });
    }

    // Validation: Check for duplicate active ads in same placement
    const existingActiveAd = await HospitalAdvertisement.findOne({
      hospital,
      placement,
      isActive: true,
      $or: [
        { endDate: { $gt: new Date() } },
        { endDate: null }
      ]
    });

    if (existingActiveAd) {
      return res.status(400).json({
        success: false,
        message: "An active advertisement already exists for this hospital in the selected placement"
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

    // Role-based validation for admin fields
    let finalAdminNotes = '';
    if (req.user.role === 'admin') {
      if (adminNotes !== undefined && adminNotes !== null && adminNotes.trim() !== '') {
        finalAdminNotes = adminNotes.trim();
      }
    } else {
      // Non-admin users cannot set adminNotes
      if (adminNotes) {
        return res.status(403).json({
          success: false,
          message: "Only admins can set admin notes"
        });
      }
    }


    const hospitalAd = new HospitalAdvertisement({
      hospital,
      plan,
      user: req.user._id,
      title: title.trim(),
      description: description ? description.trim() : '',
      video,
      image,
      titleCard,
      placement,
      adminNotes: finalAdminNotes,
      addedByAdmin: req.user.role === 'admin',
      adminAddedBy: req.user.role === 'admin' ? req.user._id : undefined
    });

    await hospitalAd.save();

    // Populate with specific fields
    await hospitalAd.populate([
      {
        path: 'hospital',
        select: 'name registrationNumber address contactInfo'
      },
      {
        path: 'user',
        select: 'name email role'
      },
      {
        path: 'adminAddedBy',
        select: 'name email'
      },
      {
        path: 'payment',
        select: 'amount status paymentDate paymentStatus'
      }
    ]);

    res.status(201).json({
      success: true,
      message: "Hospital advertisement created successfully",
      data: hospitalAd
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate advertisement found for this hospital and placement"
      });
    }
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get All Hospital Advertisements
exports.getAllHospitalAds = async (req, res) => {
  try {
    const { isActive, placement, hospital, addedByAdmin, status } = req.query;
    let filter = {};

    // Admin can see all, users can only see their own
    if (req.user.role !== 'admin') {
      filter.user = req.user._id;
    }

    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (placement) filter.placement = placement;
    if (hospital) filter.hospital = hospital;
    if (addedByAdmin !== undefined) filter.addedByAdmin = addedByAdmin === 'true';

    // Status filter (active, expired, upcoming)
    if (status) {
      const now = new Date();
      switch (status) {
        case 'active':
          filter.isActive = true;
          filter.startDate = { $lte: now };
          filter.endDate = { $gt: now };
          break;
        case 'expired':
          filter.$or = [
            { isActive: false },
            { endDate: { $lte: now } }
          ];
          break;
        case 'upcoming':
          filter.isActive = true;
          filter.startDate = { $gt: now };
          break;
      }
    }

    const hospitalAds = await HospitalAdvertisement.find(filter)
      .populate('hospital user adminAddedBy payment')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: hospitalAds.length,
      data: hospitalAds
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Single Hospital Advertisement
exports.getHospitalAd = async (req, res) => {
  try {
    const hospitalAd = await HospitalAdvertisement.findOne({hospital: req.params.id})
      .populate('hospital user adminAddedBy payment');

    if (!hospitalAd) {
      return res.status(404).json({
        success: false,
        message: "Hospital advertisement not found"
      });
    }

    // Users can only access their own ads unless admin
    if (req.user.role !== 'admin' && hospitalAd.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    res.status(200).json({
      success: true,
      data: hospitalAd
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Hospital Advertisement
exports.updateHospitalAd = async (req, res) => {
  try {
    const {
      title,
      description,
      video,
      image,
      titleCard,
      placement,
      targetAudience,
      startDate,
      endDate,
      isActive,
      adminNotes,
      metadata,
      payment
    } = req.body;

    // Check if advertisement exists
    const existingAd = await HospitalAdvertisement.findById(req.params.id)
      .populate('payment');

    if (!existingAd) {
      return res.status(404).json({
        success: false,
        message: "Hospital advertisement not found"
      });
    }

    // Permission check
    if (req.user.role !== 'admin' && existingAd.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
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

    // Validation for title
    if (isValidValue(title)) {
      updateData.title = title.trim();
    }

    // Validation for description
    if (isValidValue(description)) {
      updateData.description = description.trim();
    }

    // Validation for media fields
    if (isValidValue(video)) updateData.video = video;
    if (isValidValue(image)) updateData.image = image;
    if (isValidValue(titleCard)) updateData.titleCard = titleCard;

    // Validation for placement
    if (isValidValue(placement)) {
      updateData.placement = placement;

      // Check for duplicate active ads in new placement
      if (placement !== existingAd.placement) {
        const duplicateAd = await HospitalAdvertisement.findOne({
          hospital: existingAd.hospital,
          placement,
          isActive: true,
          _id: { $ne: req.params.id },
          $or: [
            { endDate: { $gt: new Date() } },
            { endDate: null }
          ]
        });

        if (duplicateAd) {
          return res.status(400).json({
            success: false,
            message: "An active advertisement already exists for this hospital in the selected placement"
          });
        }
      }
    }

    // Validation for targetAudience
    if (isValidValue(targetAudience)) {
      if (typeof targetAudience !== 'object') {
        return res.status(400).json({
          success: false,
          message: "Target audience must be an object"
        });
      }
      updateData.targetAudience = targetAudience;
    }

    // Validation for dates
    if (isValidValue(startDate)) {
      const parsedStartDate = new Date(startDate);
      if (isNaN(parsedStartDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid start date format"
        });
      }
      updateData.startDate = parsedStartDate;
    }

    if (isValidValue(endDate)) {
      const parsedEndDate = new Date(endDate);
      if (isNaN(parsedEndDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid end date format"
        });
      }
      updateData.endDate = parsedEndDate;
    }

    // Check if end date is after start date
    const startDateToCheck = updateData.startDate || existingAd.startDate;
    const endDateToCheck = updateData.endDate || existingAd.endDate;
    if (startDateToCheck && endDateToCheck && endDateToCheck <= startDateToCheck) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date"
      });
    }

    // Validation for payment field
    let paymentData = null;
    if (isValidValue(payment)) {
      updateData.payment = payment;

      // Fetch payment details
      paymentData = await ListingPayment.findById(payment);
    }

    // Auto-activate when payment is successful
    if (paymentData && paymentData.paymentStatus === 'paid') {
      updateData.isActive = true;

      // Set default dates if not provided and payment is successful
      if (!updateData.startDate && !existingAd.startDate) {
        updateData.startDate = new Date();
      }
      if (!updateData.endDate && !existingAd.endDate) {
        const defaultEndDate = new Date();
        defaultEndDate.setMonth(defaultEndDate.getMonth() + 1);
        updateData.endDate = defaultEndDate;
      }
    }

    // Validation for metadata
    if (isValidValue(metadata)) {
      updateData.metadata = metadata;
    }

    // Only admin can update adminNotes and isActive
    if (req.user.role === 'admin') {
      if (isValidValue(adminNotes)) {
        updateData.adminNotes = adminNotes.trim();
      }

      if (isActive !== undefined && isActive !== null) {
        updateData.isActive = isActive;

        // If activating, check if dates are valid
        if (isActive === true) {
          const finalEndDate = updateData.endDate || existingAd.endDate;
          if (finalEndDate && finalEndDate <= new Date()) {
            return res.status(400).json({
              success: false,
              message: "Cannot activate advertisement with expired end date"
            });
          }
        }
      }
    } else {
      // Non-admin users cannot update admin-only fields
      if (adminNotes !== undefined || isActive !== undefined) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Only admins can update admin notes and active status"
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

    const hospitalAd = await HospitalAdvertisement.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate([
      {
        path: 'hospital',
        select: 'name registrationNumber address contactInfo'
      },
      {
        path: 'user',
        select: 'name email role'
      },
      {
        path: 'adminAddedBy',
        select: 'name email'
      },
      {
        path: 'payment',
        select: 'amount status paymentDate paymentStatus'
      }
    ]);

    res.status(200).json({
      success: true,
      message: "Hospital advertisement updated successfully",
      data: hospitalAd
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate advertisement found for this hospital and placement"
      });
    }
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Delete Hospital Advertisement
exports.deleteHospitalAd = async (req, res) => {
  try {
    const hospitalAd = await HospitalAdvertisement.findById(req.params.id);

    if (!hospitalAd) {
      return res.status(404).json({
        success: false,
        message: "Hospital advertisement not found"
      });
    }

    if (req.user.role !== 'admin' && hospitalAd.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    await HospitalAdvertisement.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Hospital advertisement deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Clicks and Impressions
exports.updateStats = async (req, res) => {
  try {
    const { type } = req.body; // 'click' or 'impression'

    if (!type || !['click', 'impression'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be either 'click' or 'impression'"
      });
    }

    const updateField = type === 'click' ? { $inc: { clicks: 1 } } : { $inc: { impressions: 1 } };

    const hospitalAd = await HospitalAdvertisement.findByIdAndUpdate(
      req.params.id,
      {
        ...updateField,
        lastInteraction: new Date()
      },
      { new: true }
    );

    if (!hospitalAd) {
      return res.status(404).json({
        success: false,
        message: "Hospital advertisement not found"
      });
    }

    res.status(200).json({
      success: true,
      message: `${type} recorded successfully`,
      data: {
        id: hospitalAd._id,
        clicks: hospitalAd.clicks,
        impressions: hospitalAd.impressions,
        lastInteraction: hospitalAd.lastInteraction
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Active Hospital Advertisements (Public endpoint)
exports.getActiveHospitalAds = async (req, res) => {
  try {
    const { placement, hospital, limit } = req.query;

    let filter = {
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gt: new Date() }
    };

    if (placement) filter.placement = placement;
    if (hospital) filter.hospital = hospital;

    const hospitalAds = await HospitalAdvertisement.find(filter)
      .populate({
        path: 'hospital',
        select: 'name registrationNumber address contactInfo facilities departments ratings',
        populate: {
          path: 'addedBy',
          select: 'fullName profilePhoto email mobileNumber'
        }
      })
      .sort({
        clicks: -1,
        impressions: -1,
        createdAt: -1
      })
      .limit(parseInt(limit) || 20);

    // Transform data for public consumption
    const transformedAds = hospitalAds.map(ad => {
      const adObj = ad.toObject();

      return {
        ...adObj,
        displayInfo: {
          title: adObj.title,
          description: adObj.description,
          hospitalName: adObj.hospital?.name,
          hospitalAddress: adObj.hospital?.address,
          facilities: adObj.hospital?.facilities || [],
          rating: adObj.hospital?.ratings?.average || 0,
          media: {
            image: adObj.image,
            video: adObj.video,
            titleCard: adObj.titleCard
          }
        }
      };
    });

    res.status(200).json({
      success: true,
      count: transformedAds.length,
      data: transformedAds
    });
  } catch (error) {
    console.error('Error fetching active hospital ads:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Check advertisement status for a hospital
exports.checkHospitalAdStatus = async (req, res) => {
  try {
    const { hospitalId, placement } = req.params;

    const activeAd = await HospitalAdvertisement.findOne({
      hospital: hospitalId,
      placement,
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gt: new Date() }
    }).populate('payment');

    res.status(200).json({
      success: true,
      data: {
        hasActiveAd: !!activeAd,
        advertisement: activeAd
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};