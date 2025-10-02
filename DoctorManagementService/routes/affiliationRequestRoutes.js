const express = require('express');
const router = express.Router();
const {
  createAffiliationRequest,
  getHospitalRequests,
  getDoctorRequests,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  getRequestById,
  getHospitalRequestStats
} = require('../controllers/affiliationRequestController');

// Middleware imports (adjust paths according to your project structure)
const { protect, authorize } = require('../middleware/auth'); // Authentication middleware

// ======================
// Hospital Admin Routes
// ======================

// Create a new affiliation request
// POST /api/affiliation-requests
router.post(
  '/',
  protect,
  authorize('hospitaladmin', 'admin'),
  createAffiliationRequest
);

// Get all requests for a specific hospital
// GET /api/affiliation-requests/hospital/:hospitalId?status=pending
router.get(
  '/hospital/:hospitalId',
  protect,
  authorize('hospitaladmin', 'admin'),
  getHospitalRequests
);

// Get request statistics for a hospital
// GET /api/affiliation-requests/hospital/:hospitalId/stats
router.get(
  '/hospital/:hospitalId/stats',
  protect,
  authorize('hospitaladmin', 'admin'),
  getHospitalRequestStats
);

// Cancel a pending request (Hospital Admin)
// PUT /api/affiliation-requests/:requestId/cancel
router.put(
  '/:requestId/cancel',
  protect,
  authorize('hospitaladmin', 'admin'),
  cancelRequest
);

// ======================
// Doctor Routes
// ======================

// Get all requests for a specific doctor
// GET /api/affiliation-requests/doctor/:doctorId?status=pending
router.get(
  '/doctor/:doctorId',
  protect,
  authorize('doctor', 'admin'),
  getDoctorRequests
);

// Accept an affiliation request (Doctor)
// PUT /api/affiliation-requests/:requestId/accept
router.put(
  '/:requestId/accept',
  protect,
  authorize('doctor', 'admin'),
  acceptRequest
);

// Reject an affiliation request (Doctor)
// PUT /api/affiliation-requests/:requestId/reject
router.put(
  '/:requestId/reject',
  protect,
  authorize('doctor', 'admin'),
  rejectRequest
);

// ======================
// Shared Routes
// ======================

// Get a single request by ID (Doctor or Hospital Admin)
// GET /api/affiliation-requests/:requestId
router.get(
  '/:requestId',
  protect,
  getRequestById
);

module.exports = router;