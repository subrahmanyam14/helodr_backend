const HospitalAffiliationRequest = require('../models/HospitalAffiliationRequest');
const Hospital = require('../models/Hospital');
const Doctor = require('../models/Doctor');
const User = require('../models/User');

// @desc    Create a new affiliation request
// @route   POST /api/affiliation-requests
// @access  Private (Hospital Admin only)
exports.createAffiliationRequest = async (req, res) => {
  try {
    const { hospitalId, doctorId, reason, proposedDetails } = req.body;
    const requestedById = req.user.id; // Assuming user is attached via auth middleware

    // Validate required fields
    if (!hospitalId || !doctorId || !reason) {
      return res.status(400).json({
        success: false,
        message: 'Hospital ID, Doctor ID, and reason are required'
      });
    }

    // Verify hospital exists
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    // Verify user is the hospital admin
    if (hospital.addedBy.toString() !== requestedById.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only hospital admin can create affiliation requests'
      });
    }

    // Verify doctor exists
    const doctor = await Doctor.findById(doctorId).populate('user', 'fullName email');
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Check if there's already a pending request
    const existingRequest = await HospitalAffiliationRequest.findOne({
      hospital: hospitalId,
      doctor: doctorId,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: 'A pending request already exists for this doctor'
      });
    }

    // Check if doctor is already affiliated
    const isAlreadyAffiliated = doctor.hospitalAffiliations.some(
      aff => aff.hospital.toString() === hospitalId.toString() && aff.currentlyWorking
    );

    if (isAlreadyAffiliated) {
      return res.status(400).json({
        success: false,
        message: 'Doctor is already affiliated with this hospital'
      });
    }

    // Create the request
    const request = await HospitalAffiliationRequest.create({
      hospital: hospitalId,
      doctor: doctorId,
      requestedBy: requestedById,
      reason,
      proposedDetails: proposedDetails || {}
    });

    const populatedRequest = await HospitalAffiliationRequest.findById(request._id)
      .populate('hospital', 'name type address')
      .populate('doctor', 'fullName specializations')
      .populate('requestedBy', 'fullName email');

    res.status(201).json({
      success: true,
      message: 'Affiliation request created successfully',
      data: populatedRequest
    });

  } catch (error) {
    console.error('Error creating affiliation request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create affiliation request',
      error: error.message
    });
  }
};

// @desc    Get all requests for a hospital
// @route   GET /api/affiliation-requests/hospital/:hospitalId
// @access  Private (Hospital Admin only)
exports.getHospitalRequests = async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { status } = req.query; // Optional filter by status

    // Verify hospital exists and user has access
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    if (hospital.addedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const query = { hospital: hospitalId };
    if (status) {
      query.status = status;
    }

    const requests = await HospitalAffiliationRequest.find(query)
      .populate('doctor', 'fullName specializations registrationNumber experience')
      .populate('requestedBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });

  } catch (error) {
    console.error('Error fetching hospital requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
      error: error.message
    });
  }
};

// @desc    Get all pending requests for a doctor
// @route   GET /api/affiliation-requests/doctor/:doctorId
// @access  Private (Doctor only)
exports.getDoctorRequests = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { status } = req.query; // Optional filter by status

    // Verify doctor exists and user has access
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    if (doctor.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const query = { doctor: doctorId };
    if (status) {
      query.status = status;
    } else {
      // By default, show only pending and recent requests
      query.status = { $in: ['pending', 'accepted', 'rejected'] };
    }

    // Don't show expired requests
    if (query.status === 'pending' || (query.status && query.status.$in && query.status.$in.includes('pending'))) {
      query.expiresAt = { $gt: new Date() };
    }

    const requests = await HospitalAffiliationRequest.find(query)
      .populate('hospital', 'name type address contact photos featuredImage')
      .populate('requestedBy', 'fullName email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });

  } catch (error) {
    console.error('Error fetching doctor requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch requests',
      error: error.message
    });
  }
};

// @desc    Accept an affiliation request
// @route   PUT /api/affiliation-requests/:requestId/accept
// @access  Private (Doctor only)
exports.acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { responseMessage } = req.body;

    const request = await HospitalAffiliationRequest.findById(requestId)
      .populate('doctor')
      .populate('hospital', 'name');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Verify user is the doctor
    if (request.doctor.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the doctor can accept this request'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request has already been ${request.status}`
      });
    }

    // Check if request is expired
    if (request.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Request has expired'
      });
    }

    // Accept the request (this will also update doctor and hospital records)
    await request.acceptRequest(responseMessage);

    const updatedRequest = await HospitalAffiliationRequest.findById(requestId)
      .populate('hospital', 'name type address')
      .populate('doctor', 'fullName specializations')
      .populate('requestedBy', 'fullName email');

    res.status(200).json({
      success: true,
      message: 'Request accepted successfully',
      data: updatedRequest
    });

  } catch (error) {
    console.error('Error accepting request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept request',
      error: error.message
    });
  }
};

// @desc    Reject an affiliation request
// @route   PUT /api/affiliation-requests/:requestId/reject
// @access  Private (Doctor only)
exports.rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { responseMessage } = req.body;

    const request = await HospitalAffiliationRequest.findById(requestId)
      .populate('doctor');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Verify user is the doctor
    if (request.doctor.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the doctor can reject this request'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request has already been ${request.status}`
      });
    }

    // Reject the request
    await request.rejectRequest(responseMessage);

    const updatedRequest = await HospitalAffiliationRequest.findById(requestId)
      .populate('hospital', 'name type address')
      .populate('doctor', 'fullName specializations')
      .populate('requestedBy', 'fullName email');

    res.status(200).json({
      success: true,
      message: 'Request rejected successfully',
      data: updatedRequest
    });

  } catch (error) {
    console.error('Error rejecting request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject request',
      error: error.message
    });
  }
};

// @desc    Cancel an affiliation request
// @route   PUT /api/affiliation-requests/:requestId/cancel
// @access  Private (Hospital Admin only)
exports.cancelRequest = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await HospitalAffiliationRequest.findById(requestId)
      .populate('hospital');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Verify user is the hospital admin
    if (request.hospital.addedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only hospital admin can cancel this request'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a request that has been ${request.status}`
      });
    }

    // Cancel the request
    await request.cancelRequest();

    const updatedRequest = await HospitalAffiliationRequest.findById(requestId)
      .populate('hospital', 'name type address')
      .populate('doctor', 'fullName specializations')
      .populate('requestedBy', 'fullName email');

    res.status(200).json({
      success: true,
      message: 'Request cancelled successfully',
      data: updatedRequest
    });

  } catch (error) {
    console.error('Error cancelling request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel request',
      error: error.message
    });
  }
};

// @desc    Get a single request by ID
// @route   GET /api/affiliation-requests/:requestId
// @access  Private (Doctor or Hospital Admin)
exports.getRequestById = async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await HospitalAffiliationRequest.findById(requestId)
      .populate('hospital', 'name type address contact')
      .populate('doctor', 'fullName specializations registrationNumber experience')
      .populate('requestedBy', 'fullName email');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }

    // Verify user has access to this request
    const doctor = await Doctor.findById(request.doctor._id);
    const hospital = await Hospital.findById(request.hospital._id);

    const isDoctor = doctor.user.toString() === req.user._id.toString();
    const isHospitalAdmin = hospital.addedBy.toString() === req.user._id.toString();

    if (!isDoctor && !isHospitalAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: request
    });

  } catch (error) {
    console.error('Error fetching request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch request',
      error: error.message
    });
  }
};

// @desc    Get request statistics for a hospital
// @route   GET /api/affiliation-requests/hospital/:hospitalId/stats
// @access  Private (Hospital Admin only)
exports.getHospitalRequestStats = async (req, res) => {
  try {
    const { hospitalId } = req.params;

    // Verify hospital exists and user has access
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: 'Hospital not found'
      });
    }

    if (hospital.addedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const stats = await HospitalAffiliationRequest.aggregate([
      { $match: { hospital: hospital._id } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = {
      pending: 0,
      accepted: 0,
      rejected: 0,
      cancelled: 0,
      total: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
    });

    res.status(200).json({
      success: true,
      data: formattedStats
    });

  } catch (error) {
    console.error('Error fetching hospital stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
};