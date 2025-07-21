const express = require('express');
const router = express.Router();
const {AdminDashboardAnalytics, RevenueChartController, generateQuarterlyRevenue, generateDailyDashboard, generateTopDoctorsAnalytics, getPatientAnalytics} = require('../controllers/dashboardController.js');
const {doctorAnalyticsController} = require("../controllers/doctorController.js");
const { fetchDoctorAnalytics, getDoctorProfile } = require("../controllers/doctorListController.js");
const { getPatientList, getPatientProfile } = require("../controllers/patientController.js");
const {getDoctorIdsByAdmin} = require("../utils/doctorIds.js");
const { protect, authorize } = require("../middleware/authMiddleware.js");

/**
 * GET /admin/dashboard
 * Get dashboard analytics for multiple doctors
 */
router.get('/dashboard', protect, authorize("admin"), async (req, res) => {
  try {
    const doctorIds = await getDoctorIdsByAdmin(req.user.id);
    // Validate doctor IDs
    if (!doctorIds || !Array.isArray(doctorIds) || doctorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Doctor IDs are required and must be an array'
      });
    }

    // Parse month and year if provided, otherwise use current month
    let targetMonth = new Date();
    

    // Get dashboard analytics
    const analytics = await AdminDashboardAnalytics.getDashboardAnalytics(
      doctorIds,
      targetMonth
    );

    res.json({
      success: true,
      data: analytics,
      meta: {
        period: {
          month: targetMonth.getMonth() + 1,
          year: targetMonth.getFullYear(),
          monthName: targetMonth.toLocaleString('default', { month: 'long' })
        },
        doctorCount: doctorIds.length
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard analytics',
      error: error.message
    });
  }
});

/**
 * GET /admin/revenue-chart
 * Get revenue chart data for specific period
 * Query params:
 * - doctorIds: Array of doctor IDs
 * - period: day, week, month, quarter, custom
 * - date: Base date for period calculation (optional)
 * - startDate: Start date for custom period
 * - endDate: End date for custom period
 */
router.get('/revenue-chart', protect, authorize("admin"), async (req, res) => {
  try {
    const { period = 'month', date, startDate, endDate } = req.query;
    const doctorIds = await getDoctorIdsByAdmin(req.user.id);
    console.log(doctorIds);
    // Validate doctor IDs
    if (!doctorIds || !Array.isArray(doctorIds) || doctorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Doctor IDs are required and must be an array'
      });
    }

    // Validate custom period dates
    if (period === 'custom') {
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date and end date are required for custom period'
        });
      }

      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
      }
    }

    // Validate period
    const supportedPeriods = ['day', 'week', 'month', 'quarter', 'custom'];
    if (!supportedPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: `Invalid period. Supported periods: ${supportedPeriods.join(', ')}`
      });
    }

    // Prepare date range for custom period
    let dateRange = {};
    if (period === 'custom') {
      dateRange = { startDate, endDate };
    } else if (date) {
      dateRange = { date: new Date(date) };
    }

    // Get revenue chart data
    const revenueChart = await RevenueChartController.getRevenueChart(
      doctorIds,
      period,
      dateRange
    );

    res.json({
      success: true,
      data: revenueChart,
      meta: {
        period: period,
        doctorCount: doctorIds.length,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching revenue chart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue chart data',
      error: error.message
    });
  }
});



// Route to generate actual quarterly revenue data
router.get("/quarterly-revenue", protect, authorize("admin"), generateQuarterlyRevenue);

router.get("/daily", protect, authorize("admin"), generateDailyDashboard);

router.get("/top-doctors-analytics", protect, authorize("admin"), generateTopDoctorsAnalytics);

router.get("/patient-analytics", protect, authorize("admin"), getPatientAnalytics);

router.get('/doctors-analytics', protect, authorize("admin"), doctorAnalyticsController.getDoctorAnalytics.bind(doctorAnalyticsController));

router.get('/list-doctor', protect, authorize("admin"), fetchDoctorAnalytics);

router.get('/list-patient', protect, authorize("admin"), getPatientList);

router.get('/doctor-profile/:doctorId', protect, authorize("admin"), getDoctorProfile);

router.get('/patient-details/:patientId', protect, authorize("admin"), getPatientProfile);

module.exports = router;