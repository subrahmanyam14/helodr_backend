const AdvisoryBoard = require("../models/AdvisoryBoard");
const Doctor = require("../models/Doctor");
const User = require("../models/User");

// Create Advisory Board Member (Admin only)
exports.createAdvisoryBoardMember = async (req, res) => {
  try {
    const {
      doctor,
      position,
      specialization,
      bio,
      order,
      isActive,
      socialLinks,
      achievements,
      metadata
    } = req.body;

    const advisoryBoardMember = new AdvisoryBoard({
      doctor,
      position,
      specialization,
      bio,
      order,
      isActive: isActive !== undefined ? isActive : true,
      addedBy: req.user._id,
      socialLinks,
      achievements,
      metadata
    });

    await advisoryBoardMember.save();
    await advisoryBoardMember.populate({
      path: 'doctor',
      select: 'bio languages experience registrationNumber specializations review address'
    }).populate('addedBy');

    res.status(201).json({
      success: true,
      message: "Advisory board member created successfully",
      data: advisoryBoardMember
    });
  } catch (error) {
    console.error(error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This doctor is already on the advisory board"
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get All Advisory Board Members
exports.getAllAdvisoryBoardMembers = async (req, res) => {
  try {
    const { isActive, position, specialization } = req.query;
    let filter = {};

    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (position) filter.position = position;
    if (specialization) {
      filter.specialization = { $regex: specialization, $options: 'i' };
    }

    const advisoryBoardMembers = await AdvisoryBoard.find(filter)
      .populate({
        path: 'doctor',
        select: 'bio languages experience registrationNumber specializations review address fullName'
      })
      .populate('addedBy')
      .sort({ order: 1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: advisoryBoardMembers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Single Advisory Board Member
exports.getAdvisoryBoardMember = async (req, res) => {
  try {
    const advisoryBoardMember = await AdvisoryBoard.findById(req.params.id)
      .populate({
        path: 'doctor',
        select: 'bio languages experience registrationNumber specializations review address'
      })
      .populate('addedBy');

    if (!advisoryBoardMember) {
      return res.status(404).json({
        success: false,
        message: "Advisory board member not found"
      });
    }

    res.status(200).json({
      success: true,
      data: advisoryBoardMember
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Advisory Board Member by Doctor ID
exports.getAdvisoryBoardMemberByDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;

    const advisoryBoardMember = await AdvisoryBoard.findOne({ doctor: doctorId })
      .populate({
        path: 'doctor',
        select: 'bio languages experience registrationNumber  specializations review address'
      })
      .populate('addedBy');

    if (!advisoryBoardMember) {
      return res.status(404).json({
        success: false,
        message: "Advisory board member not found for this doctor"
      });
    }

    res.status(200).json({
      success: true,
      data: advisoryBoardMember
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Advisory Board Member (Admin only)
function createUpdateObject(body, fields) {
  const updateFields = {};
  fields.forEach(field => {
    if (body[field] !== undefined) {
      updateFields[field] = body[field];
    }
  });
  return updateFields;
}

exports.updateAdvisoryBoardMember = async (req, res) => {
  try {
    const updateFields = createUpdateObject(req.body, [
      'position', 'specialization', 'bio', 'order', 
      'isActive', 'socialLinks', 'achievements', 'metadata'
    ]);

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields provided for update"
      });
    }

    const advisoryBoardMember = await AdvisoryBoard.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate({
      path: 'doctor',
      select: 'bio languages experience registrationNumber specializations review address'
    }).populate('addedBy');

    if (!advisoryBoardMember) {
      return res.status(404).json({
        success: false,
        message: "Advisory board member not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Advisory board member updated successfully",
      data: advisoryBoardMember
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This doctor is already on the advisory board"
      });
    }
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Delete Advisory Board Member (Admin only)
exports.deleteAdvisoryBoardMember = async (req, res) => {
  try {
    const advisoryBoardMember = await AdvisoryBoard.findByIdAndDelete(req.params.id);

    if (!advisoryBoardMember) {
      return res.status(404).json({
        success: false,
        message: "Advisory board member not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Advisory board member deleted successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Active Advisory Board (Public endpoint)
exports.getActiveAdvisoryBoard = async (req, res) => {
  try {
    const { position, specialization, page = 1, limit = 10 } = req.query;
    let filter = { isActive: true };

    if (position) filter.position = position;
    if (specialization) {
      filter.specialization = { $regex: specialization, $options: 'i' };
    }

    // Convert page and limit to numbers
    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    
    // Calculate skip value
    const skip = (pageNumber - 1) * limitNumber;

    // Get total count for pagination info
    const total = await AdvisoryBoard.countDocuments(filter);

    const advisoryBoardMembers = await AdvisoryBoard.find(filter)
      .populate({
        path: 'doctor',
        select: 'bio languages experience registrationNumber specializations qualifications review address',
        populate: {
          path: 'user',
          select: 'fullName profilePhoto '
        }
      })
      .sort({ order: 1, position: 1, createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    // Calculate total pages
    const totalPages = Math.ceil(total / limitNumber);

    res.status(200).json({
      success: true,
      data: advisoryBoardMembers,
      pagination: {
        currentPage: pageNumber,
        totalPages: totalPages,
        totalItems: total,
        itemsPerPage: limitNumber,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Reorder Advisory Board Members (Admin only)
exports.reorderAdvisoryBoard = async (req, res) => {
  try {
    const { orderUpdates } = req.body; // Array of { id, order }

    if (!Array.isArray(orderUpdates)) {
      return res.status(400).json({
        success: false,
        message: "orderUpdates must be an array"
      });
    }

    const bulkOperations = orderUpdates.map(update => ({
      updateOne: {
        filter: { _id: update.id },
        update: { order: update.order }
      }
    }));

    await AdvisoryBoard.bulkWrite(bulkOperations);

    const updatedMembers = await AdvisoryBoard.find({
      _id: { $in: orderUpdates.map(update => update.id) }
    }).populate({
      path: 'doctor',
      select: 'bio languages experience registrationNumber specializations review address'
    });

    res.status(200).json({
      success: true,
      message: "Advisory board members reordered successfully",
      data: updatedMembers
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};