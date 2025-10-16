const express = require('express');
const router = express.Router();
const { getPatientList, getPatientDetails, getFilterOptions } = require('../controllers/patientController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/patients', protect, authorize('admin'), getPatientList);
router.get('/patients/:patientId', protect, authorize('admin'), getPatientDetails);
router.get('/filter', protect, authorize('admin'), getFilterOptions);

module.exports = router;

