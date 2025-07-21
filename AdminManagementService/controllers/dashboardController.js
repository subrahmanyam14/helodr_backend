const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const moment = require("moment");
const {getDoctorIdsByAdmin} = require("../utils/doctorIds.js");

class AdminDashboardAnalytics {
  /**
   * Get comprehensive dashboard analytics for multiple doctors in current month
   * @param {Array} doctorIds - Array of doctor ObjectIds
   * @param {Date} month - Optional month (defaults to current month)
   * @returns {Object} Dashboard analytics object
   */
  static async getDashboardAnalytics(doctorIds, month = new Date()) {
    // Convert string IDs to ObjectIds if needed
    const doctorObjectIds = doctorIds.map(id => 
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    // Calculate date range for current month
    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
    
    // Calculate previous month for growth comparison
    const startOfPrevMonth = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(month.getFullYear(), month.getMonth(), 0, 23, 59, 59, 999);

    try {
      // Run all analytics queries in parallel
      const [
        appointmentMetrics,
        patientMetrics,
        revenueMetrics,
        growthMetrics
      ] = await Promise.all([
        this.getAppointmentMetrics(doctorObjectIds, startOfMonth, endOfMonth),
        this.getPatientMetrics(doctorObjectIds, startOfMonth, endOfMonth),
        this.getRevenueMetrics(doctorObjectIds, startOfMonth, endOfMonth),
        this.getGrowthMetrics(doctorObjectIds, startOfMonth, endOfMonth, startOfPrevMonth, endOfPrevMonth)
      ]);

      return {
        dashboard: {
          metrics: {
            appointments: appointmentMetrics,
            patients: patientMetrics,
            revenue: revenueMetrics,
            growth: growthMetrics
          }
        }
      };
    } catch (error) {
      console.error('Error fetching dashboard analytics:', error);
      throw error;
    }
  }

  /**
   * Get appointment statistics
   */
  static async getAppointmentMetrics(doctorIds, startDate, endDate) {
    const pipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: {
              $cond: [{ $eq: ["$status", "pending"] }, 1, 0]
            }
          },
          completed: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
            }
          },
          cancelled: {
            $sum: {
              $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0]
            }
          }
        }
      }
    ];

    const result = await Appointment.aggregate(pipeline);
    
    return result.length > 0 ? {
      total: result[0].total || 0,
      pending: result[0].pending || 0,
      completed: result[0].completed || 0,
      cancelled: result[0].cancelled || 0
    } : {
      total: 0,
      pending: 0,
      completed: 0,
      cancelled: 0
    };
  }

  /**
   * Get patient statistics and average rating
   */
  static async getPatientMetrics(doctorIds, startDate, endDate) {
    // Get new vs returning patients
    const patientsPipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: "$patient",
          firstAppointment: { $min: "$createdAt" },
          appointmentCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalPatients: { $sum: 1 },
          newPatients: {
            $sum: {
              $cond: [
                { $gte: ["$firstAppointment", startDate] },
                1,
                0
              ]
            }
          }
        }
      }
    ];

    // Get average rating from reviews
    const ratingPipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          createdAt: { $gte: startDate, $lte: endDate },
          "review.rating": { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$review.rating" }
        }
      }
    ];

    const [patientsResult, ratingResult] = await Promise.all([
      Appointment.aggregate(patientsPipeline),
      Appointment.aggregate(ratingPipeline)
    ]);

    const patientsData = patientsResult.length > 0 ? patientsResult[0] : { totalPatients: 0, newPatients: 0 };
    const ratingData = ratingResult.length > 0 ? ratingResult[0] : { averageRating: 0 };

    return {
      new: patientsData.newPatients || 0,
      returning: (patientsData.totalPatients || 0) - (patientsData.newPatients || 0),
      rating: parseFloat((ratingData.averageRating || 0).toFixed(1))
    };
  }

  /**
   * Get revenue statistics
   */
  static async getRevenueMetrics(doctorIds, startDate, endDate) {
    // Get previous month for growth calculation
    const prevMonthStart = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1);
    const prevMonthEnd = new Date(startDate.getFullYear(), startDate.getMonth(), 0, 23, 59, 59, 999);

    const currentRevenuePipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          status: "captured",
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ];

    const prevRevenuePipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          status: "captured",
          createdAt: { $gte: prevMonthStart, $lte: prevMonthEnd }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ];

    const [currentResult, prevResult] = await Promise.all([
      Payment.aggregate(currentRevenuePipeline),
      Payment.aggregate(prevRevenuePipeline)
    ]);

    const currentRevenue = currentResult.length > 0 ? currentResult[0].totalRevenue : 0;
    const prevRevenue = prevResult.length > 0 ? prevResult[0].totalRevenue : 0;

    // Calculate growth percentage
    let growthPercent = 0;
    if (prevRevenue > 0) {
      growthPercent = Math.round(((currentRevenue - prevRevenue) / prevRevenue) * 100);
    } else if (currentRevenue > 0) {
      growthPercent = 100; // 100% growth if no previous revenue
    }

    return {
      total: currentRevenue || 0,
      growthPercent: growthPercent,
      currency: "INR"
    };
  }

  /**
   * Get growth metrics (appointments growth)
   */
  static async getGrowthMetrics(doctorIds, startDate, endDate, prevStartDate, prevEndDate) {
    const currentAppointmentsPipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalAppointments: { $sum: 1 }
        }
      }
    ];

    const prevAppointmentsPipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          createdAt: { $gte: prevStartDate, $lte: prevEndDate }
        }
      },
      {
        $group: {
          _id: null,
          totalAppointments: { $sum: 1 }
        }
      }
    ];

    const [currentResult, prevResult] = await Promise.all([
      Appointment.aggregate(currentAppointmentsPipeline),
      Appointment.aggregate(prevAppointmentsPipeline)
    ]);

    const currentAppointments = currentResult.length > 0 ? currentResult[0].totalAppointments : 0;
    const prevAppointments = prevResult.length > 0 ? prevResult[0].totalAppointments : 0;

    // Calculate growth percentage
    let appointmentsPercent = 0;
    if (prevAppointments > 0) {
      appointmentsPercent = Math.round(((currentAppointments - prevAppointments) / prevAppointments) * 100);
    } else if (currentAppointments > 0) {
      appointmentsPercent = 100;
    }

    return {
      appointmentsPercent: appointmentsPercent
    };
  }

  /**
   * Get analytics for specific date range
   */
  static async getAnalyticsForDateRange(doctorIds, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    return await this.getDashboardAnalytics(doctorIds, start, end);
  }

  /**
   * Get analytics for specific doctor
   */
  static async getDoctorAnalytics(doctorId, month = new Date()) {
    return await this.getDashboardAnalytics([doctorId], month);
  }
}


class RevenueChartController {
  /**
   * Get revenue chart data for multiple doctors across different periods
   * @param {Array} doctorIds - Array of doctor ObjectIds
   * @param {String} period - Period type: 'day', 'week', 'month', 'quarter', 'custom'
   * @param {Object} dateRange - Custom date range for 'custom' period
   * @returns {Object} Revenue chart data
   */
  static async getRevenueChart(doctorIds, period = 'month', dateRange = {}) {
    // Convert string IDs to ObjectIds if needed
    const doctorObjectIds = doctorIds.map(id => 
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    const currentDate = new Date();
    let chartData = {};

    switch (period) {
      case 'day':
        chartData = await this.getDaylyRevenue(doctorObjectIds, dateRange.date || currentDate);
        break;
      case 'week':
        chartData = await this.getWeeklyRevenue(doctorObjectIds, dateRange.date || currentDate);
        break;
      case 'month':
        chartData = await this.getMonthlyRevenue(doctorObjectIds, dateRange.date || currentDate);
        break;
      case 'quarter':
        chartData = await this.getQuarterlyRevenue(doctorObjectIds, dateRange.date || currentDate);
        break;
      case 'custom':
        chartData = await this.getCustomRangeRevenue(doctorObjectIds, dateRange);
        break;
      default:
        throw new Error('Invalid period specified');
    }

    return {
      revenueChart: {
        currentPeriod: period,
        supportedPeriods: ["day", "week", "month", "quarter", "custom"],
        dataByPeriod: {
          [period]: chartData
        }
      }
    };
  }

  /**
   * Get hourly revenue data for a specific day
   */
  static async getDaylyRevenue(doctorIds, targetDate) {
    const date = new Date(targetDate);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

    // Get previous day for comparison
    const prevStartOfDay = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
    const prevEndOfDay = new Date(endOfDay.getTime() - 24 * 60 * 60 * 1000);

    const [currentRevenue, prevRevenue, hourlyData] = await Promise.all([
      this.getTotalRevenue(doctorIds, startOfDay, endOfDay),
      this.getTotalRevenue(doctorIds, prevStartOfDay, prevEndOfDay),
      this.getHourlyRevenue(doctorIds, startOfDay, endOfDay)
    ]);

    const percentChange = this.calculatePercentChange(currentRevenue, prevRevenue);

    return {
      date: date.toISOString().split('T')[0],
      totalRevenue: currentRevenue,
      percentChange: percentChange,
      hourly: hourlyData
    };
  }

  /**
   * Get daily revenue data for a specific week
   */
  static async getWeeklyRevenue(doctorIds, targetDate) {
    const date = new Date(targetDate);
    const startOfWeek = new Date(date.setDate(date.getDate() - date.getDay()));
    const endOfWeek = new Date(date.setDate(date.getDate() - date.getDay() + 6));
    endOfWeek.setHours(23, 59, 59, 999);

    // Get previous week for comparison
    const prevStartOfWeek = new Date(startOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);
    const prevEndOfWeek = new Date(endOfWeek.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [currentRevenue, prevRevenue, dailyData] = await Promise.all([
      this.getTotalRevenue(doctorIds, startOfWeek, endOfWeek),
      this.getTotalRevenue(doctorIds, prevStartOfWeek, prevEndOfWeek),
      this.getDailyRevenue(doctorIds, startOfWeek, endOfWeek)
    ]);

    const percentChange = this.calculatePercentChange(currentRevenue, prevRevenue);

    return {
      weekStart: startOfWeek.toISOString().split('T')[0],
      weekEnd: endOfWeek.toISOString().split('T')[0],
      totalRevenue: currentRevenue,
      percentChange: percentChange,
      daily: dailyData
    };
  }

  /**
   * Get daily revenue data for a specific month
   */
  static async getMonthlyRevenue(doctorIds, targetDate) {
    const date = new Date(targetDate);
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

    // Get previous month for comparison
    const prevStartOfMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
    const prevEndOfMonth = new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59, 999);

    const [currentRevenue, prevRevenue, dailyData] = await Promise.all([
      this.getTotalRevenue(doctorIds, startOfMonth, endOfMonth),
      this.getTotalRevenue(doctorIds, prevStartOfMonth, prevEndOfMonth),
      this.getDailyRevenue(doctorIds, startOfMonth, endOfMonth)
    ]);

    const percentChange = this.calculatePercentChange(currentRevenue, prevRevenue);

    return {
      month: date.toLocaleString('default', { month: 'long' }),
      year: date.getFullYear(),
      totalRevenue: currentRevenue,
      percentChange: percentChange,
      daily: dailyData
    };
  }

  /**
   * Get daily revenue data for a specific quarter
   */
  static async getQuarterlyRevenue(doctorIds, targetDate) {
    const date = new Date(targetDate);
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    const startOfQuarter = new Date(date.getFullYear(), (quarter - 1) * 3, 1);
    const endOfQuarter = new Date(date.getFullYear(), quarter * 3, 0, 23, 59, 59, 999);

    // Get previous quarter for comparison
    const prevStartOfQuarter = new Date(date.getFullYear(), (quarter - 2) * 3, 1);
    const prevEndOfQuarter = new Date(date.getFullYear(), (quarter - 1) * 3, 0, 23, 59, 59, 999);

    const [currentRevenue, prevRevenue, dailyData] = await Promise.all([
      this.getTotalRevenue(doctorIds, startOfQuarter, endOfQuarter),
      this.getTotalRevenue(doctorIds, prevStartOfQuarter, prevEndOfQuarter),
      this.getDailyRevenue(doctorIds, startOfQuarter, endOfQuarter)
    ]);

    const percentChange = this.calculatePercentChange(currentRevenue, prevRevenue);

    const quarterMonths = [
      ['January', 'February', 'March'],
      ['April', 'May', 'June'],
      ['July', 'August', 'September'],
      ['October', 'November', 'December']
    ];

    return {
      quarter: `Q${quarter}`,
      months: quarterMonths[quarter - 1],
      totalRevenue: currentRevenue,
      percentChange: percentChange,
      daily: dailyData
    };
  }

  /**
   * Get daily revenue data for a custom date range
   * FIXED: Proper UTC date handling without timezone issues
   */
  static async getCustomRangeRevenue(doctorIds, dateRange) {
    // Parse dates as UTC to avoid timezone issues
    const startDate = new Date(dateRange.startDate + 'T00:00:00.000Z');
    const endDate = new Date(dateRange.endDate + 'T23:59:59.999Z');

    // Calculate the duration for previous period comparison
    const duration = endDate.getTime() - startDate.getTime();
    const prevEndDate = new Date(startDate.getTime() - 1000); // 1 second before start
    const prevStartDate = new Date(prevEndDate.getTime() - duration);

    // Debug logging
    console.log('Fixed Date Range Debug:', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      prevStartDate: prevStartDate.toISOString(),
      prevEndDate: prevEndDate.toISOString()
    });

    // Additional debugging - let's check what's in the database
    const testQuery = await Payment.find({
      doctor: { $in: doctorIds },
      status: "captured"
    }).limit(5);
    
    console.log('Sample payments from DB:', testQuery.map(p => ({
      doctor: p.doctor.toString(),
      amount: p.amount,
      createdAt: p.createdAt,
      status: p.status
    })));

    const [currentRevenue, prevRevenue, dailyData] = await Promise.all([
      this.getTotalRevenue(doctorIds, startDate, endDate),
      this.getTotalRevenue(doctorIds, prevStartDate, prevEndDate),
      this.getDailyRevenue(doctorIds, startDate, endDate)
    ]);

    const percentChange = this.calculatePercentChange(currentRevenue, prevRevenue);

    return {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      totalRevenue: currentRevenue,
      percentChange: percentChange,
      daily: dailyData
    };
  }

  /**
   * Get total revenue for a date range
   * FIXED: Simplified date filtering with proper boundaries and ObjectId handling
   */
  static async getTotalRevenue(doctorIds, startDate, endDate) {
    // Ensure proper ObjectId conversion
    const doctorObjectIds = doctorIds.map(id => {
      if (typeof id === 'string') {
        return new mongoose.Types.ObjectId(id);
      }
      if (id._id) {
        return new mongoose.Types.ObjectId(id._id);
      }
      return id;
    });

    const pipeline = [
      {
        $match: {
          doctor: { $in: doctorObjectIds },
          status: "captured",
          createdAt: { 
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ];

    console.log('Fixed Pipeline match conditions:', {
      doctor: { $in: doctorObjectIds.map(id => id.toString()) },
      status: "captured",
      createdAt: { 
        $gte: startDate,
        $lte: endDate
      }
    });

    // Also add a direct query to debug
    const directCount = await Payment.countDocuments({
      doctor: { $in: doctorObjectIds },
      status: "captured",
      createdAt: { 
        $gte: startDate,
        $lte: endDate
      }
    });

    console.log('Direct count query result:', directCount);

    const result = await Payment.aggregate(pipeline);
    console.log('Fixed Total revenue result:', result);
    return result.length > 0 ? result[0].totalRevenue : 0;
  }

  /**
   * Get hourly revenue breakdown for a day
   */
  static async getHourlyRevenue(doctorIds, startDate, endDate) {
    const pipeline = [
      {
        $match: {
          doctor: { $in: doctorIds },
          status: "captured",
          createdAt: { 
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: { $hour: "$createdAt" },
          value: { $sum: "$amount" }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ];

    const result = await Payment.aggregate(pipeline);
    
    // Create array for all 24 hours
    const hourlyData = [];
    for (let hour = 0; hour < 24; hour++) {
      const hourData = result.find(item => item._id === hour);
      hourlyData.push({
        hour: hour.toString().padStart(2, '0'),
        value: hourData ? hourData.value : 0
      });
    }

    return hourlyData;
  }

  /**
   * Get daily revenue breakdown for a period
   * FIXED: Proper date filtering and timezone handling with ObjectId fix
   */
  static async getDailyRevenue(doctorIds, startDate, endDate) {
    // Ensure proper ObjectId conversion
    const doctorObjectIds = doctorIds.map(id => {
      if (typeof id === 'string') {
        return new mongoose.Types.ObjectId(id);
      }
      if (id._id) {
        return new mongoose.Types.ObjectId(id._id);
      }
      return id;
    });

    const pipeline = [
      {
        $match: {
          doctor: { $in: doctorObjectIds },
          status: "captured",
          createdAt: { 
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          value: { $sum: "$amount" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 }
      }
    ];

    const result = await Payment.aggregate(pipeline);
    console.log('Fixed Daily revenue aggregation result:', result);
    
    // Generate daily data for the entire period
    const dailyData = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const dayData = result.find(item => 
        item._id.year === currentDate.getUTCFullYear() &&
        item._id.month === currentDate.getUTCMonth() + 1 &&
        item._id.day === currentDate.getUTCDate()
      );

      dailyData.push({
        date: currentDate.toISOString().split('T')[0],
        day: currentDate.getUTCDate(),
        value: dayData ? dayData.value : 0
      });

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    return dailyData;
  }

  /**
   * Calculate percentage change between two values
   */
  static calculatePercentChange(current, previous) {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
  }

  /**
   * Get all supported periods data at once
   */
  static async getAllPeriodsData(doctorIds, baseDate = new Date()) {
    const doctorObjectIds = doctorIds.map(id => 
      typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
    );

    const [dayData, weekData, monthData, quarterData] = await Promise.all([
      this.getDaylyRevenue(doctorObjectIds, baseDate),
      this.getWeeklyRevenue(doctorObjectIds, baseDate),
      this.getMonthlyRevenue(doctorObjectIds, baseDate),
      this.getQuarterlyRevenue(doctorObjectIds, baseDate)
    ]);

    return {
      revenueChart: {
        currentPeriod: "month",
        supportedPeriods: ["day", "week", "month", "quarter", "custom"],
        dataByPeriod: {
          day: dayData,
          week: weekData,
          month: monthData,
          quarter: quarterData
        }
      }
    };
  }
}


const generateQuarterlyRevenue = async (req, res) => {
  try {
    const { year, quarter } = req.query;
    const doctorIds = await getDoctorIdsByAdmin(req.user.id);
    // Validate inputs
    if (!year || !quarter || !doctorIds || !Array.isArray(doctorIds)) {
      return res.status(400).json({
        success: false,
        message: "Year, quarter, and doctorIds array are required"
      });
    }

    if (quarter < 1 || quarter > 4) {
      return res.status(400).json({
        success: false,
        message: "Quarter must be between 1 and 4"
      });
    }

    // Calculate quarter date ranges
    const quarterMonths = getQuarterMonths(year, quarter);
    const startDate = moment(`${year}-${String(quarterMonths[0].monthIndex + 1).padStart(2, '0')}-01`, 'YYYY-MM-DD').startOf('month');
    const endDate = moment(`${year}-${String(quarterMonths[2].monthIndex + 1).padStart(2, '0')}-01`, 'YYYY-MM-DD').endOf('month');

    // Aggregate payments by date for the specified doctors and date range
    const pipeline = [
      {
        $match: {
          doctor: { $in: doctorIds.map(id => new mongoose.Types.ObjectId(id)) },
          status: "captured",
          createdAt: {
            $gte: startDate.toDate(),
            $lte: endDate.toDate()
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt"
            }
          },
          revenue: { $sum: "$amount" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ];

    const dailyRevenue = await Payment.aggregate(pipeline);

    // Create a map for quick lookup
    const revenueMap = {};
    dailyRevenue.forEach(item => {
      revenueMap[item._id] = item.revenue;
    });

    // Generate the response structure
    const response = {
      year: parseInt(year),
      quarter: parseInt(quarter),
      months: []
    };

    // Process each month in the quarter
    for (const monthInfo of quarterMonths) {
      const monthData = {
        month: monthInfo.month,
        monthIndex: monthInfo.monthIndex,
        days: []
      };

      // Get all days in the month
      const daysInMonth = moment(`${year}-${String(monthInfo.monthIndex + 1).padStart(2, '0')}-01`, 'YYYY-MM-DD').daysInMonth();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(monthInfo.monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const revenue = revenueMap[dateStr] || 0;
        
        monthData.days.push({
          date: dateStr,
          revenue: revenue
        });
      }

      response.months.push(monthData);
    }

    res.json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error("Error generating quarterly revenue:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


/**
 * Helper function to get quarter months
 */
function getQuarterMonths(year, quarter) {
  const quarters = {
    1: [
      { month: "January", monthIndex: 0 },
      { month: "February", monthIndex: 1 },
      { month: "March", monthIndex: 2 }
    ],
    2: [
      { month: "April", monthIndex: 3 },
      { month: "May", monthIndex: 4 },
      { month: "June", monthIndex: 5 }
    ],
    3: [
      { month: "July", monthIndex: 6 },
      { month: "August", monthIndex: 7 },
      { month: "September", monthIndex: 8 }
    ],
    4: [
      { month: "October", monthIndex: 9 },
      { month: "November", monthIndex: 10 },
      { month: "December", monthIndex: 11 }
    ]
  };

  return quarters[quarter];
}


/**
 * Generate daily dashboard statistics for specified doctors
 */
const generateDailyDashboard = async (req, res) => {
  try {
    const { date } = req.query;
    const doctorIds = await getDoctorIdsByAdmin(req.user.id);

    // Validate inputs
    if (!date || !doctorIds || !Array.isArray(doctorIds)) {
      return res.status(400).json({
        success: false,
        message: "Date and doctorIds array are required"
      });
    }

    // Parse and validate date
    const targetDate = moment(date, 'YYYY-MM-DD');
    if (!targetDate.isValid()) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD"
      });
    }

    const startOfDay = targetDate.startOf('day').toDate();
    const endOfDay = targetDate.endOf('day').toDate();
    const dayOfWeek = targetDate.format('dddd');

    // Convert doctorIds to ObjectIds
    const doctorObjectIds = doctorIds.map(id => new mongoose.Types.ObjectId(id));

    // Get daily revenue from captured payments
    const revenueResult = await Payment.aggregate([
      {
        $match: {
          doctor: { $in: doctorObjectIds },
          status: "captured",
          createdAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ]);

    const revenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    // Get appointment statistics
    const appointmentStats = await Appointment.aggregate([
      {
        $match: {
          doctor: { $in: doctorObjectIds },
          createdAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      },
      {
        $group: {
          _id: null,
          totalAppointments: { $sum: 1 },
          completedAppointments: {
            $sum: {
              $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
            }
          },
          doctorsWorking: { $addToSet: "$doctor" }
        }
      }
    ]);

    const appointments = appointmentStats.length > 0 ? appointmentStats[0].totalAppointments : 0;
    const completedAppointments = appointmentStats.length > 0 ? appointmentStats[0].completedAppointments : 0;
    const doctorsWorking = appointmentStats.length > 0 ? appointmentStats[0].doctorsWorking.length : 0;

    // Calculate patient satisfaction from completed appointments with reviews
    const satisfactionResult = await Appointment.aggregate([
      {
        $match: {
          doctor: { $in: doctorObjectIds },
          date: {
            $gte: startOfDay,
            $lte: endOfDay
          },
          status: "completed",
          "review.rating": { $exists: true }
        }
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$review.rating" },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    // Convert average rating to satisfaction percentage (assuming 5-star scale)
    let patientSatisfaction = 95; // Default value
    if (satisfactionResult.length > 0) {
      const avgRating = satisfactionResult[0].averageRating;
      patientSatisfaction = Math.round((avgRating / 5) * 100);
    }

    // Get top doctors by appointment count for the day
    const topDoctorsResult = await Appointment.aggregate([
      {
        $match: {
          doctor: { $in: doctorObjectIds },
          createdAt: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      },
      {
        $group: {
          _id: "$doctor",
          appointmentCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "doctors",
          localField: "_id",
          foreignField: "_id",
          as: "doctorInfo"
        }
      },
      {
        $unwind: "$doctorInfo"
      },
      {
        $project: {
          name: { $concat: ["$doctorInfo.title","$doctorInfo.fullName"] },
          appointments: {
            $min: [7, "$appointmentCount"] // Cap at 7 appointments max
          }
        }
      },
      {
        $sort: { appointments: -1 }
      },
      {
        $limit: 7
      }
    ]);

    // Ensure we have at least some doctors in the response
    const topDoctors = topDoctorsResult.length > 0 ? topDoctorsResult : [];

    // If we have fewer than expected doctors, fill with remaining doctors (0 appointments)
    if (topDoctors.length < doctorIds.length) {
      const activeDoctorIds = topDoctors.map(doc => doc._id.toString());
      const remainingDoctorIds = doctorIds.filter(id => !activeDoctorIds.includes(id));
      
      if (remainingDoctorIds.length > 0) {
        const remainingDoctors = await Doctor.find({
          _id: { $in: remainingDoctorIds.map(id => new mongoose.Types.ObjectId(id)) }
        }).select('fullName title');

        const remainingDoctorsFormatted = remainingDoctors.map(doctor => ({
          name: `${doctor.title} ${doctor.fullName}`,
          appointments: 0
        }));

        topDoctors.push(...remainingDoctorsFormatted);
      }
    }

    // Limit to 7 doctors and ensure appointment count is between 0-7
    const finalTopDoctors = topDoctors.slice(0, 7).map(doctor => ({
      name: doctor.name,
      appointments: Math.min(7, Math.max(0, doctor.appointments))
    }));

    const dashboardData = {
      date: targetDate.format('YYYY-MM-DD'),
      dayOfWeek,
      revenue,
      appointments,
      completedAppointments,
      doctorsWorking,
      patientSatisfaction,
      topDoctors: finalTopDoctors
    };

    res.json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error("Error generating daily dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

const generateTopDoctorsAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, location = "defaultLocation", limit = 3 } = req.query;
    const doctorIds = await getDoctorIdsByAdmin(req.user.id);

    // Validate inputs
    if (!doctorIds || !Array.isArray(doctorIds)) {
      return res.status(400).json({
        success: false,
        message: "Doctor IDs are required"
      });
    }

    // Validate and parse limit
    const doctorLimit = parseInt(limit);
    if (isNaN(doctorLimit) || doctorLimit < 1) {
      return res.status(400).json({
        success: false,
        message: "Limit must be a positive integer"
      });
    }

    // Set default date range if not provided (last 30 days)
    const endDateMoment = endDate ? moment(endDate) : moment();
    const startDateMoment = startDate ? moment(startDate) : moment().subtract(30, 'days');

    if (!startDateMoment.isValid() || !endDateMoment.isValid()) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD"
      });
    }

    const startOfPeriod = startDateMoment.startOf('day').toDate();
    const endOfPeriod = endDateMoment.endOf('day').toDate();

    // Convert doctorIds to ObjectIds
    const doctorObjectIds = doctorIds.map(id => new mongoose.Types.ObjectId(id));

    // Alternative: Start with payments and join appointments
    const topDoctorsData = await Payment.aggregate([
      {
        $match: {
          doctor: { $in: doctorObjectIds },
          status: "captured",
          createdAt: {
            $gte: startOfPeriod,
            $lte: endOfPeriod
          }
        }
      },
      {
        $lookup: {
          from: "appointments",
          localField: "appointment",
          foreignField: "_id",
          as: "appointmentInfo"
        }
      },
      {
        $unwind: "$appointmentInfo"
      },
      {
        $lookup: {
          from: "doctors",
          localField: "doctor",
          foreignField: "_id",
          as: "doctorInfo"
        }
      },
      {
        $unwind: "$doctorInfo"
      },
      {
        $group: {
          _id: "$doctor",
          doctorInfo: { $first: "$doctorInfo" },
          totalRevenue: { $sum: "$amount" },
          totalVisits: { $sum: 1 },
          completedVisits: {
            $sum: {
              $cond: [{ $eq: ["$appointmentInfo.status", "completed"] }, 1, 0]
            }
          },
          averageRating: {
            $avg: {
              $cond: [
                { 
                  $and: [
                    { $ne: ["$appointmentInfo.review.rating", null] }, 
                    { $ne: ["$appointmentInfo.review.rating", undefined] }
                  ]
                },
                "$appointmentInfo.review.rating",
                null
              ]
            }
          },
          totalRatings: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $ne: ["$appointmentInfo.review.rating", null] }, 
                    { $ne: ["$appointmentInfo.review.rating", undefined] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      // Add appointments without payments to get complete visit count
      {
        $lookup: {
          from: "appointments",
          let: { doctorId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$doctor", "$$doctorId"] },
                date: {
                  $gte: startOfPeriod,
                  $lte: endOfPeriod
                }
              }
            },
            {
              $group: {
                _id: null,
                totalAppointments: { $sum: 1 },
                completedAppointments: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
                  }
                }
              }
            }
          ],
          as: "allAppointments"
        }
      },
      {
        $addFields: {
          actualVisits: {
            $ifNull: [
              { $arrayElemAt: ["$allAppointments.totalAppointments", 0] },
              0
            ]
          },
          actualCompletedVisits: {
            $ifNull: [
              { $arrayElemAt: ["$allAppointments.completedAppointments", 0] },
              0
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          name: {
            $concat: ["Dr. ", "$doctorInfo.fullName"]
          },
          specialization: "$doctorInfo.specialization",
          experience: {
            $concat: [
              { $toString: "$doctorInfo.experience" },
              " years"
            ]
          },
          revenue: "$totalRevenue", // Use the calculated revenue
          visits: "$actualVisits",
          completedVisits: "$actualCompletedVisits",
          rating: {
            $round: [
              {
                $ifNull: ["$averageRating", 0]
              },
              1
            ]
          },
          profileImage: {
            $ifNull: [
              "$doctorInfo.profileImage",
              "https://archive.org/download/default_profile/default-avatar.png"
            ]
          },
          totalRatings: 1
        }
      },
      {
        $sort: { revenue: -1 }
      },
      {
        $limit: doctorLimit
      }
    ]);

    // Add rank to each doctor
    const doctorsWithRank = topDoctorsData.map((doctor, index) => ({
      rank: index + 1,
      name: doctor.name,
      specialization: doctor.specialization,
      experience: doctor.experience,
      revenue: doctor.revenue,
      visits: doctor.visits,
      completedVisits: doctor.completedVisits,
      rating: doctor.rating,
      profileImage: doctor.profileImage
    }));

    // Fill with dummy data if less than requested limit
    while (doctorsWithRank.length < doctorLimit) {
      doctorsWithRank.push({
        rank: doctorsWithRank.length + 1,
        name: "Dr. Not Available",
        specialization: "General",
        experience: "0 years",
        revenue: 0,
        visits: 0,
        completedVisits: 0,
        rating: 0,
        profileImage: "https://archive.org/download/default_profile/default-avatar.png"
      });
    }

    const analyticsData = {
      topDoctorsAnalytics: {
        location,
        doctors: doctorsWithRank
      }
    };

    res.json({
      success: true,
      data: analyticsData
    });

  } catch (error) {
    console.error("Error generating top doctors analytics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

const getPatientAnalytics = async (req, res) => {
  try {
    const { location = 'defaultLocation', month, year } = req.query;
    const doctorIdArray = await getDoctorIdsByAdmin(req.user.id);
      
    // Set date range (default to current month/year if not provided)
    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) - 1 : currentDate.getMonth(); // 0-indexed
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    
    const startDate = new Date(targetYear, targetMonth, 1);
    const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
    
    // Build match conditions
    const matchConditions = {
      date: { $gte: startDate, $lte: endDate }
    };
    
    if (doctorIdArray.length > 0) {
      matchConditions.doctor = { $in: doctorIdArray };
    }
    
    // Get all appointments for the specified period and doctors
    const appointments = await Appointment.find(matchConditions)
      .populate('patient', 'fullName email gender dateOfBirth')
      .populate('doctor', 'name');
    
    // Calculate total appointments
    const totalAppointments = appointments.length;
    
    // Get unique patient IDs
    const uniquePatientIds = [...new Set(appointments.map(apt => apt.patient._id.toString()))];
    
    // Calculate new patients (first-time patients in this period)
    const newPatientIds = new Set();
    for (const appointment of appointments) {
      const patientId = appointment.patient._id;
      const earlierAppointment = await Appointment.findOne({
        patient: patientId,
        date: { $lt: startDate },
        ...(doctorIdArray.length > 0 && { doctor: { $in: doctorIdArray } })
      });
      
      if (!earlierAppointment) {
        newPatientIds.add(patientId.toString());
      }
    }
    
    // Calculate revisit rate
    const revisitPatients = uniquePatientIds.length - newPatientIds.size;
    const revisitRate = uniquePatientIds.length > 0 
      ? Math.round((revisitPatients / uniquePatientIds.length) * 100) + '%'
      : '0%';
    
    // Calculate average wait time (mock calculation - you may need to adjust based on actual data)
    const avgWaitTime = appointments.length > 0 
      ? Math.round(Math.random() * 30 + 10) + ' min' // Mock data
      : '0 min';
    
    // Gender distribution
    const genderCount = { male: 0, female: 0, other: 0 };
    appointments.forEach(apt => {
      const gender = apt.patient.gender || 'other';
      if (gender === 'prefer not to say') {
        genderCount.other++;
      } else {
        genderCount[gender] = (genderCount[gender] || 0) + 1;
      }
    });
    
    // Age demographics
    const ageGroups = { '0-18': 0, '19-35': 0, '36-50': 0, '51+': 0 };
    appointments.forEach(apt => {
      if (apt.patient.dateOfBirth) {
        const age = calculateAge(apt.patient.dateOfBirth);
        if (age <= 18) ageGroups['0-18']++;
        else if (age <= 35) ageGroups['19-35']++;
        else if (age <= 50) ageGroups['36-50']++;
        else ageGroups['51+']++;
      }
    });
    
    // Patient satisfaction from reviews
    const reviewedAppointments = appointments.filter(apt => apt.review && apt.review.rating);
    const totalReviews = reviewedAppointments.length;
    const ratingsBreakdown = { '5': 0, '4': 0, '3': 0, '2': 0, '1': 0 };
    let totalRatingSum = 0;
    
    reviewedAppointments.forEach(apt => {
      const rating = apt.review.rating.toString();
      ratingsBreakdown[rating]++;
      totalRatingSum += apt.review.rating;
    });
    
    const overallRating = totalReviews > 0 ? (totalRatingSum / totalReviews).toFixed(1) : 0;
    
    // Monthly appointment trends (last 6 months)
    const monthlyTrends = {};
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(targetYear, targetMonth - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthlyCount = await Appointment.countDocuments({
        date: { $gte: monthStart, $lte: monthEnd },
        ...(doctorIdArray.length > 0 && { doctor: { $in: doctorIdArray } })
      });
      
      monthlyTrends[monthNames[date.getMonth()]] = monthlyCount;
    }
    
    // Patient retention rate (quarterly)
    const currentQuarter = Math.floor(targetMonth / 3) + 1;
    const retentionRates = {};
    
    for (let q = 1; q <= 4; q++) {
      if (q <= currentQuarter) {
        // Calculate actual retention for completed quarters
        const quarterStart = new Date(targetYear, (q - 1) * 3, 1);
        const quarterEnd = new Date(targetYear, q * 3, 0);
        
        const quarterAppointments = await Appointment.find({
          date: { $gte: quarterStart, $lte: quarterEnd },
          ...(doctorIdArray.length > 0 && { doctor: { $in: doctorIdArray } })
        });
        
        const quarterUniquePatients = [...new Set(quarterAppointments.map(apt => apt.patient.toString()))];
        const returnPatients = quarterUniquePatients.filter(async (patientId) => {
          const prevAppointment = await Appointment.findOne({
            patient: patientId,
            date: { $lt: quarterStart },
            ...(doctorIdArray.length > 0 && { doctor: { $in: doctorIdArray } })
          });
          return prevAppointment !== null;
        });
        
        retentionRates[`Q${q}`] = quarterUniquePatients.length > 0 
          ? Math.round((returnPatients.length / quarterUniquePatients.length) * 100)
          : 75 + q * 2; // Mock progressive values
      } else {
        retentionRates[`Q${q}`] = 75 + q * 2; // Placeholder for future quarters
      }
    }
    
    // Common health issues (from prescription diagnosis)
    const healthIssues = {};
    appointments.forEach(apt => {
      if (apt.prescription && apt.prescription.diagnosis) {
        const diagnosis = apt.prescription.diagnosis.toLowerCase();
        // Simple keyword matching for common conditions
        if (diagnosis.includes('fever')) healthIssues['Fever'] = (healthIssues['Fever'] || 0) + 1;
        else if (diagnosis.includes('diabetes')) healthIssues['Diabetes'] = (healthIssues['Diabetes'] || 0) + 1;
        else if (diagnosis.includes('hypertension') || diagnosis.includes('blood pressure')) 
          healthIssues['Hypertension'] = (healthIssues['Hypertension'] || 0) + 1;
        else if (diagnosis.includes('arthritis') || diagnosis.includes('joint')) 
          healthIssues['Arthritis'] = (healthIssues['Arthritis'] || 0) + 1;
        else if (diagnosis.includes('respiratory') || diagnosis.includes('cough') || diagnosis.includes('asthma')) 
          healthIssues['Respiratory'] = (healthIssues['Respiratory'] || 0) + 1;
        else if (diagnosis.includes('skin') || diagnosis.includes('rash')) 
          healthIssues['Skin Conditions'] = (healthIssues['Skin Conditions'] || 0) + 1;
      }
    });
    
    const commonHealthIssues = Object.entries(healthIssues)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    
    // Appointment frequency analysis
    const patientVisitCounts = {};
    appointments.forEach(apt => {
      const patientId = apt.patient._id.toString();
      patientVisitCounts[patientId] = (patientVisitCounts[patientId] || 0) + 1;
    });
    
    const frequencyBuckets = {
      firstVisit: { count: 0, percentage: 0 },
      '2to5Visits': { count: 0, percentage: 0 },
      '6to10Visits': { count: 0, percentage: 0 },
      '10PlusVisits': { count: 0, percentage: 0 }
    };
    
    Object.values(patientVisitCounts).forEach(count => {
      if (count === 1) frequencyBuckets.firstVisit.count++;
      else if (count >= 2 && count <= 5) frequencyBuckets['2to5Visits'].count++;
      else if (count >= 6 && count <= 10) frequencyBuckets['6to10Visits'].count++;
      else frequencyBuckets['10PlusVisits'].count++;
    });
    
    // Calculate percentages
    const totalUniquePatients = uniquePatientIds.length;
    Object.keys(frequencyBuckets).forEach(key => {
      frequencyBuckets[key].percentage = totalUniquePatients > 0 
        ? Math.round((frequencyBuckets[key].count / totalUniquePatients) * 100)
        : 0;
    });
    
    // Construct response
    const analyticsData = {
      patientAnalytics: {
        location,
        summary: {
          totalPatients: totalAppointments,
          newPatients: newPatientIds.size,
          revisitRate,
          averageWaitTime: avgWaitTime
        },
        genderDistribution: genderCount,
        ageDemographics: ageGroups,
        patientSatisfaction: {
          overallRating: parseFloat(overallRating),
          totalReviews,
          ratingsBreakdown
        },
        monthlyAppointmentTrends: monthlyTrends,
        patientRetentionRate: retentionRates,
        commonHealthIssues,
        appointmentFrequency: frequencyBuckets
      }
    };
    
    res.status(200).json(analyticsData);
    
  } catch (error) {
    console.error('Error fetching patient analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch patient analytics',
      error: error.message
    });
  }
};

// Helper function to calculate age
const calculateAge = (dateOfBirth) => {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
};

module.exports = {AdminDashboardAnalytics, RevenueChartController, generateQuarterlyRevenue, generateDailyDashboard, generateTopDoctorsAnalytics, getPatientAnalytics};