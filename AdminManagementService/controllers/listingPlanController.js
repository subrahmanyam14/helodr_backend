const ListingPlan = require("../models/ListingPlan");

// Create Listing Plan (Admin only)
exports.createListingPlan = async (req, res) => {
  try {
    const { name, type, amount, currency, features, description, isActive } = req.body;

    const listingPlan = new ListingPlan({
      name,
      type,
      amount,
      currency,
      features,
      description,
      isActive
    });

    await listingPlan.save();
    res.status(201).json({
      success: true,
      message: "Listing plan created successfully",
      data: listingPlan
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get All Listing Plans
exports.getAllListingPlans = async (req, res) => {
  try {
    const { isActive } = req.query;
    let filter = {};
    
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const listingPlans = await ListingPlan.find(filter).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: listingPlans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Single Listing Plan
exports.getListingPlan = async (req, res) => {
  try {
    const listingPlan = await ListingPlan.findOne({name: req.params.name});
    
    if (!listingPlan) {
      return res.status(404).json({
        success: false,
        message: "Listing plan not found"
      });
    }

    res.status(200).json({
      success: true,
      data: listingPlan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Listing Plan (Admin only) - Dynamic field update
exports.updateListingPlan = async (req, res) => {
  try {
    const { name, type, amount, currency, features, description, isActive } = req.body;

    // Create update object with only provided fields
    const updateFields = {};
    
    if (name !== undefined) updateFields.name = name;
    if (type !== undefined) updateFields.type = type;
    if (amount !== undefined) updateFields.amount = amount;
    if (currency !== undefined) updateFields.currency = currency;
    if (features !== undefined) updateFields.features = features;
    if (description !== undefined) updateFields.description = description;
    if (isActive !== undefined) updateFields.isActive = isActive;

    // Check if any fields are provided to update
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided for update"
      });
    }

    const listingPlan = await ListingPlan.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!listingPlan) {
      return res.status(404).json({
        success: false,
        message: "Listing plan not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Listing plan updated successfully",
      data: listingPlan
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
// Delete Listing Plan (Admin only)
exports.deleteListingPlan = async (req, res) => {
  try {
    const listingPlan = await ListingPlan.findByIdAndDelete(req.params.id);

    if (!listingPlan) {
      return res.status(404).json({
        success: false,
        message: "Listing plan not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Listing plan deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};