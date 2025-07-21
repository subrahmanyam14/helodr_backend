const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
const {getDoctorIdsByAdmin} = require("../utils/doctorIds");
const moment = require('moment');

class DoctorAnalyticsController {
  
  // Get comprehensive analytics data for specific doctors
  async getDoctorAnalytics(req, res) {
    try {
      const { location, selectedMonth, previousMonth } = req.query;
      const rawDoctorIds = await getDoctorIdsByAdmin(req.user.id);
      if (!rawDoctorIds || !Array.isArray(rawDoctorIds) || rawDoctorIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Doctor IDs array is required' 
        });
      }

      // Fix: Extract string IDs from objects if needed
      const doctorIds = rawDoctorIds.map(id => 
        typeof id === 'object' && id._id ? id._id.toString() : id.toString()
      );

      console.log("Processed doctor IDs:", doctorIds);

      // Validate doctor IDs exist
      const validDoctors = await Doctor.find({ _id: { $in: doctorIds } });
      if (validDoctors.length !== doctorIds.length) {
        return res.status(400).json({ 
          success: false, 
          message: 'Some doctor IDs are invalid' 
        });
      }

      const currentMonth = selectedMonth || moment().format('MMMM');
      const prevMonth = previousMonth || moment().subtract(1, 'month').format('MMMM');
      console.log("query params: ", currentMonth, prevMonth);
      
      // Fix: Proper date range calculation
      const currentYear = moment().year();
      const currentMonthStart = moment().month(moment().month(currentMonth).month()).year(currentYear).startOf('month');
      const currentMonthEnd = moment().month(moment().month(currentMonth).month()).year(currentYear).endOf('month');
      
      // For previous month, handle year transition
      let prevMonthStart, prevMonthEnd;
      const prevMonthIndex = moment().month(prevMonth).month();
      const currentMonthIndex = moment().month(currentMonth).month();
      
      if (prevMonthIndex > currentMonthIndex) {
        // Previous month is in the previous year
        prevMonthStart = moment().month(prevMonthIndex).year(currentYear - 1).startOf('month');
        prevMonthEnd = moment().month(prevMonthIndex).year(currentYear - 1).endOf('month');
      } else {
        prevMonthStart = moment().month(prevMonthIndex).year(currentYear).startOf('month');
        prevMonthEnd = moment().month(prevMonthIndex).year(currentYear).endOf('month');
      }

      console.log("Date ranges:", {
        currentMonthStart: currentMonthStart.format('YYYY-MM-DD'),
        currentMonthEnd: currentMonthEnd.format('YYYY-MM-DD'),
        prevMonthStart: prevMonthStart.format('YYYY-MM-DD'),
        prevMonthEnd: prevMonthEnd.format('YYYY-MM-DD')
      });

      // Build base query with proper ObjectId conversion
      const mongoose = require('mongoose');
      const baseQuery = { 
        doctor: { $in: doctorIds.map(id => new mongoose.Types.ObjectId(id)) } 
      };
      if (location) {
        baseQuery.location = location;
      }

      console.log("Base query:", JSON.stringify(baseQuery, null, 2));

      // Get summary statistics
      const summaryStats = await this.getSummaryStats(
        baseQuery, 
        currentMonthStart, 
        currentMonthEnd, 
        prevMonthStart, 
        prevMonthEnd
      );

      // Get daily demographics
      const dailyDemographics = await this.getDailyDemographics(
        baseQuery, 
        currentMonthStart, 
        currentMonthEnd, 
        currentMonth
      );

      // Get real-time data
      const realTime = await this.getRealTimeData(baseQuery);

      const response = {
        success: true,
        data: {
          location: location || 'All Locations',
          selectedMonth: currentMonth,
          previousMonth: prevMonth,
          doctorIds: doctorIds,
          summaryStats,
          dailyDemographics,
          realTime
        }
      };

      res.status(200).json(response);

    } catch (error) {
      console.error('Error in getDoctorAnalytics:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error.message 
      });
    }
  }

  // Get summary statistics for doctors
  async getSummaryStats(baseQuery, currentStart, currentEnd, previousStart, previousEnd) {
    try {
      console.log("Summary stats date ranges:", {
        currentStart: currentStart.format('YYYY-MM-DD'),
        currentEnd: currentEnd.format('YYYY-MM-DD'),
        previousStart: previousStart.format('YYYY-MM-DD'),
        previousEnd: previousEnd.format('YYYY-MM-DD')
      });

      // Current month appointments
      const currentAppointments = await Appointment.countDocuments({
        ...baseQuery,
        date: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
      });

      // Previous month appointments
      const previousAppointments = await Appointment.countDocuments({
        ...baseQuery,
        date: { $gte: previousStart.toDate(), $lte: previousEnd.toDate() }
      });

      // Current month unique doctors
      const currentDoctors = await Appointment.distinct('doctor', {
        ...baseQuery,
        date: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
      });

      // Previous month unique doctors
      const previousDoctors = await Appointment.distinct('doctor', {
        ...baseQuery,
        date: { $gte: previousStart.toDate(), $lte: previousEnd.toDate() }
      });

      // Current month unique patients
      const currentPatients = await Appointment.distinct('patient', {
        ...baseQuery,
        date: { $gte: currentStart.toDate(), $lte: currentEnd.toDate() }
      });

      // Previous month unique patients
      const previousPatients = await Appointment.distinct('patient', {
        ...baseQuery,
        date: { $gte: previousStart.toDate(), $lte: previousEnd.toDate() }
      });

      return {
        appointments: {
          total: currentAppointments,
          growthFromPrevious: currentAppointments - previousAppointments
        },
        doctors: {
          total: currentDoctors.length,
          growthFromPrevious: currentDoctors.length - previousDoctors.length
        },
        patients: {
          total: currentPatients.length,
          growthFromPrevious: currentPatients.length - previousPatients.length
        }
      };

    } catch (error) {
      console.error('Error in getSummaryStats:', error);
      throw error;
    }
  }

  // Get daily demographics data
  async getDailyDemographics(baseQuery, monthStart, monthEnd, monthName) {
    try {
      console.log("Daily demographics date range:", {
        monthStart: monthStart.format('YYYY-MM-DD'),
        monthEnd: monthEnd.format('YYYY-MM-DD'),
        monthName: monthName
      });

      console.log("Base query for aggregation:", JSON.stringify(baseQuery, null, 2));

      // First, let's check if there are any appointments in the date range
      const totalAppointments = await Appointment.countDocuments({
        ...baseQuery,
        date: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() }
      });

      console.log("Total appointments in date range:", totalAppointments);

      // Get appointments aggregated by day
      const appointmentsData = await Appointment.aggregate([
        {
          $match: {
            ...baseQuery,
            date: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() }
          }
        },
        {
          $group: {
            _id: { $dayOfMonth: '$date' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      console.log("Appointments aggregation result:", appointmentsData);

      // Get unique doctors by day
      const doctorsData = await Appointment.aggregate([
        {
          $match: {
            ...baseQuery,
            date: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() }
          }
        },
        {
          $group: {
            _id: { 
              day: { $dayOfMonth: '$date' },
              doctor: '$doctor'
            }
          }
        },
        {
          $group: {
            _id: '$_id.day',
            uniqueDoctors: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      console.log("Doctors aggregation result:", doctorsData);

      // Get unique patients by day
      const patientsData = await Appointment.aggregate([
        {
          $match: {
            ...baseQuery,
            date: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() }
          }
        },
        {
          $group: {
            _id: { 
              day: { $dayOfMonth: '$date' },
              patient: '$patient'
            }
          }
        },
        {
          $group: {
            _id: '$_id.day',
            uniquePatients: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      console.log("Patients aggregation result:", patientsData);

      // Fix: Better formatting for daily data
      const formatDailyData = (data, type) => {
        if (!data || data.length === 0) return [];
        
        const result = [];
        
        data.forEach((item, index) => {
          const currentValue = type === 'appointments' ? item.count : 
                             type === 'doctors' ? item.uniqueDoctors : item.uniquePatients;
          
          // Calculate change from previous day in the array (not cumulative)
          const previousValue = index > 0 ? 
            (type === 'appointments' ? data[index - 1].count : 
             type === 'doctors' ? data[index - 1].uniqueDoctors : data[index - 1].uniquePatients) : 0;
          
          const change = currentValue - previousValue;
          
          result.push({
            day: `${monthName.substr(0, 3)} ${item._id}`,
            value: currentValue,
            change: change >= 0 ? `+${change}` : `${change}`
          });
        });
        
        return result;
      };

      return {
        appointments: formatDailyData(appointmentsData, 'appointments'),
        doctors: formatDailyData(doctorsData, 'doctors'),
        patients: formatDailyData(patientsData, 'patients')
      };

    } catch (error) {
      console.error('Error in getDailyDemographics:', error);
      throw error;
    }
  }

  // Get real-time data for last 48 hours
  async getRealTimeData(baseQuery) {
    try {
      const now = moment();
      const last48Hours = moment().subtract(48, 'hours');

      // New appointments in last 48 hours
      const newAppointments = await Appointment.countDocuments({
        ...baseQuery,
        createdAt: { $gte: last48Hours.toDate(), $lte: now.toDate() }
      });

      // Completed appointments (patients closed) in last 48 hours
      const patientsClosed = await Appointment.countDocuments({
        ...baseQuery,
        status: 'completed',
        updatedAt: { $gte: last48Hours.toDate(), $lte: now.toDate() }
      });

      // Activity chart - appointments created in 5 time windows of ~10 hours each
      const activityChart = [];
      for (let i = 0; i < 5; i++) {
        const windowStart = moment().subtract((i + 1) * 10, 'hours');
        const windowEnd = moment().subtract(i * 10, 'hours');
        
        const windowAppointments = await Appointment.countDocuments({
          ...baseQuery,
          createdAt: { $gte: windowStart.toDate(), $lte: windowEnd.toDate() }
        });
        
        activityChart.unshift(windowAppointments);
      }

      return {
        window: 'Last 48 hours',
        newAppointments,
        patientsClosed,
        activityChart
      };

    } catch (error) {
      console.error('Error in getRealTimeData:', error);
      throw error;
    }
  }

  // Get analytics for a single doctor
  async getSingleDoctorAnalytics(req, res) {
    try {
      const { doctorId, location, selectedMonth, previousMonth } = req.params;

      if (!doctorId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Doctor ID is required' 
        });
      }

      // Validate doctor exists
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ 
          success: false, 
          message: 'Doctor not found' 
        });
      }

      // Check if the user has access to this doctor
      const adminDoctorIds = await getDoctorIdsByAdmin(req.user.id);
      if (!adminDoctorIds.includes(doctorId)) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied to this doctor' 
        });
      }

      // Temporarily override the getDoctorIdsByAdmin function for this request
      const originalGetDoctorIdsByAdmin = getDoctorIdsByAdmin;
      const mockGetDoctorIdsByAdmin = async () => [doctorId];
      
      // Create a new request object with the parameters
      const newReq = {
        ...req,
        params: { location, selectedMonth, previousMonth },
        user: req.user
      };

      // Temporarily replace the function
      require.cache[require.resolve("../utils/doctorIds")].exports.getDoctorIdsByAdmin = mockGetDoctorIdsByAdmin;
      
      const result = await this.getDoctorAnalytics(newReq, res);
      
      // Restore the original function
      require.cache[require.resolve("../utils/doctorIds")].exports.getDoctorIdsByAdmin = originalGetDoctorIdsByAdmin;
      
      return result;

    } catch (error) {
      console.error('Error in getSingleDoctorAnalytics:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error.message 
      });
    }
  }

  // Get doctor performance comparison
  async getDoctorComparison(req, res) {
    try {
      const { selectedMonth } = req.params;
      const doctorIds = await getDoctorIdsByAdmin(req.user.id);
      if (!doctorIds || !Array.isArray(doctorIds) || doctorIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Doctor IDs array is required' 
        });
      }

      const currentMonth = selectedMonth || moment().format('MMMM');
      const currentYear = moment().year();
      const monthStart = moment().month(moment().month(currentMonth).month()).year(currentYear).startOf('month');
      const monthEnd = moment().month(moment().month(currentMonth).month()).year(currentYear).endOf('month');

      const comparison = await Promise.all(
        doctorIds.map(async (doctorId) => {
          const doctor = await Doctor.findById(doctorId);
          
          const appointments = await Appointment.countDocuments({
            doctor: doctorId,
            date: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() }
          });

          const patients = await Appointment.distinct('patient', {
            doctor: doctorId,
            date: { $gte: monthStart.toDate(), $lte: monthEnd.toDate() }
          });

          const avgRating = await Appointment.aggregate([
            {
              $match: {
                doctor: doctorId,
                'review.rating': { $exists: true }
              }
            },
            {
              $group: {
                _id: null,
                avgRating: { $avg: '$review.rating' },
                totalReviews: { $sum: 1 }
              }
            }
          ]);

          return {
            doctorId,
            doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : 'Unknown',
            appointments,
            uniquePatients: patients.length,
            averageRating: avgRating.length > 0 ? avgRating[0].avgRating : 0,
            totalReviews: avgRating.length > 0 ? avgRating[0].totalReviews : 0
          };
        })
      );

      res.status(200).json({
        success: true,
        data: {
          selectedMonth: currentMonth,
          comparison
        }
      });

    } catch (error) {
      console.error('Error in getDoctorComparison:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error.message 
      });
    }
  }
}

// Export a single instance
module.exports = { doctorAnalyticsController: new DoctorAnalyticsController() };