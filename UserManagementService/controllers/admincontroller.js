const User = require("../models/User");
const Appointment = require("../models/Appointment");
const Payment = require("../models/Payment");
const mongoose = require("mongoose");
const Doctor = require("../models/Doctor")
const Review = require("../models/Review");
const moment = require("moment");
const Transaction = require("../models/Transaction");

exports.getDashboardData = async (req, res) => {
  try {
    const { period = 'day' } = req.query;
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));

    const [
      appointments,
      patients,
      payments,
      doctors,
      reviews
    ] = await Promise.all([
      Appointment.find().populate('doctor').populate('patient').lean(),
      User.find({ role: 'patient' }).lean(),
      Payment.find({ status: 'captured' }).lean(),
      Doctor.find().populate('user').lean(),
      Review.find().lean()
    ]);

    // Calculate metrics
    const newPatients = patients.filter(p => new Date(p.createdAt) >= thirtyDaysAgo).length;
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / (reviews.length || 1);
    
    // Process doctors data
    const processedDoctors = doctors.map(doctor => {
      const doctorAppointments = appointments.filter(a => a.doctor._id.toString() === doctor._id.toString());
      const doctorPayments = payments.filter(p => p.doctor.toString() === doctor._id.toString());
      const doctorReviews = reviews.filter(r => r.doctor.toString() === doctor._id.toString());

      return {
        id: doctor._id,
        name: `Dr. ${doctor.user.fullName}`,
        specialty: doctor.specialization,
        experience: `${doctor.experience} years experience`,
        image: doctor.user.profilePhoto,
        revenue: doctorPayments.reduce((sum, p) => sum + p.amount, 0),
        appointments: doctorAppointments.length,
        rating: doctorReviews.reduce((sum, r) => sum + r.rating, 0) / (doctorReviews.length || 1)
      };
    }).sort((a, b) => b.revenue - a.revenue).slice(0, 3);
    function calculateAppointmentFrequency(appointments) {
      const patientAppointments = {};

      // Count appointments per patient
      appointments.forEach(appointment => {
        const patientId = appointment.patient._id.toString();
        patientAppointments[patientId] = (patientAppointments[patientId] || 0) + 1;
      });

      // Group by frequency
      const frequencyCount = {
        'First Visit': 0,
        '2-3 Visits': 0,
        '4-5 Visits': 0,
        '6+ Visits': 0
      };

      Object.values(patientAppointments).forEach(count => {
        if (count === 1) frequencyCount['First Visit']++;
        else if (count >= 2 && count <= 3) frequencyCount['2-3 Visits']++;
        else if (count >= 4 && count <= 5) frequencyCount['4-5 Visits']++;
        else frequencyCount['6+ Visits']++;
      });

      const totalPatients = Object.keys(patientAppointments).length;

      // Format the data with percentages
      return Object.entries(frequencyCount).map(([frequency, count]) => ({
        frequency,
        count,
        percentage: `${Math.round((count / totalPatients) * 100)}%`
      }));
    }

    // Generate revenue data based on period
    const revenueData = await generateRevenueDataByPeriod(period, payments);

    const dashboardData = {
      metrics: {
        appointments: {
          total: appointments.length,
          pending: appointments.filter(a => a.status === 'pending').length,
          completed: appointments.filter(a => a.status === 'completed').length,
          cancelled: appointments.filter(a => a.status === 'cancelled').length,
          growth: calculateGrowth(
            appointments.filter(a => new Date(a.createdAt) >= thirtyDaysAgo).length,
            appointments.filter(a => new Date(a.createdAt) < thirtyDaysAgo).length
          )
        },
        patients: {
          total: patients.length,
          new: newPatients,
          returning: patients.length - newPatients,
          rating: avgRating,
          revisitRate: calculateRevisitRate(patients.length, newPatients),
          waitTime: await calculateAverageWaitTime(appointments)
        },
        revenue: {
          total: revenueData.totalRevenue,
          growth: revenueData.percentChange,
          chartData: {
            data: revenueData.data,
            yAxisLabels: revenueData.yAxisLabels,
            todayCutoff: period === 'day' ? (new Date().getHours() * (1000 / 24)) + 60 : null
          }
        }
      },
      topDoctors: processedDoctors,
      patientAnalytics: {
        genderDistribution: [
          { gender: 'Male', count: patients.filter(p => p.gender === 'male').length },
          { gender: 'Female', count: patients.filter(p => p.gender === 'female').length },
          { gender: 'Other', count: patients.filter(p => p.gender === 'other').length }
        ],
        demographics: [
          { age: '18-24', count: patients.filter(p => calculateAge(p.dateOfBirth) >= 18 && calculateAge(p.dateOfBirth) <= 24).length },
          { age: '25-34', count: patients.filter(p => calculateAge(p.dateOfBirth) >= 25 && calculateAge(p.dateOfBirth) <= 34).length },
          { age: '35-44', count: patients.filter(p => calculateAge(p.dateOfBirth) >= 35 && calculateAge(p.dateOfBirth) <= 44).length },
          { age: '45+', count: patients.filter(p => calculateAge(p.dateOfBirth) >= 45).length }
        ],
        patientSource: [
          { source: 'Direct', count: patients.filter(p => p.source === 'direct').length },
          { source: 'Referral', count: patients.filter(p => p.source === 'referral').length },
          { source: 'Insurance', count: patients.filter(p => p.source === 'insurance').length },
          { source: 'Online', count: patients.filter(p => p.source === 'online').length },
          { source: 'Other', count: patients.filter(p => !['direct', 'referral', 'insurance', 'online'].includes(p.source)).length }
        ],
        satisfaction: {
          overall: avgRating,
          breakdown: [
            { rating: 5, count: reviews.filter(r => r.rating === 5).length },
            { rating: 4, count: reviews.filter(r => r.rating === 4).length },
            { rating: 3, count: reviews.filter(r => r.rating === 3).length },
            { rating: 2, count: reviews.filter(r => r.rating === 2).length },
            { rating: 1, count: reviews.filter(r => r.rating === 1).length }
          ]
        },
        appointmentTrends: {
          labels: generateMonthLabels(6),
          monthly: generateMonthlyAppointments(appointments, 6)
        },
        patientRetention: {
          labels: generateMonthLabels(6),
          data: calculateRetentionRates(appointments, patients, 6)
        },
        commonIssues: await getCommonIssues(appointments),
        appointmentFrequency: calculateAppointmentFrequency(appointments)
      }
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Dashboard data fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
};

exports.getDashboardOverview = async (req, res) => {
  try {
    const { period = "30d", location } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    const days = parseInt(period) || 30;
    startDate.setDate(endDate.getDate() - days);

    const matchStage = {
      createdAt: { $gte: startDate, $lte: endDate }
    };

    if (location) {
      matchStage["patientDetails.city"] = location;
    }

    // Total counts
    const [totalDoctors, totalPatients, totalAppointments, totalRevenue] = await Promise.all([
      User.countDocuments({ role: "doctor" }),
      User.countDocuments({ role: "patient" }),
      Appointment.countDocuments(),
      Payment.aggregate([
        { $match: { status: "captured" } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
      ]).then(res => res[0]?.total || 0)
    ]);

    // Trends
    const appointmentTrends = await Appointment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const revenueTrends = await Payment.aggregate([
      { $match: { status: "captured", createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          amount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const patientGrowth = await User.aggregate([
      { $match: { role: "patient", createdAt: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totalDoctors,
      totalPatients,
      totalAppointments,
      totalRevenue,
      appointmentTrends: appointmentTrends.map(({ _id, count }) => ({ date: _id, count })),
      revenueTrends: revenueTrends.map(({ _id, amount }) => ({ date: _id, amount })),
      patientGrowth: patientGrowth.map(({ _id, count }) => ({ date: _id, count }))
    });
  } catch (err) {
    console.error("Error in getDashboardOverview:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.getLocationOverview = async (req, res) => {
  try {
    const { city } = req.query;
    if (!city) return res.status(400).json({ message: "City is required" });

    // Find all doctors in the city
    const doctors = await Doctor.find({ "address.city": city });
    const doctorIds = doctors.map(doc => doc._id);

    const users = await User.find({ role: "patient" });
    const userIds = users.map(user => user._id);

    // Count patients who had appointments with doctors in this city
    const appointments = await Appointment.find({ doctor: { $in: doctorIds } });

    const appointmentIds = appointments.map(app => app._id);
    const patientIdsSet = new Set(appointments.map(app => app.patient.toString()));

    const revenue = appointments.reduce((sum, app) => sum + (app.amountPaid || 0), 0);

    const reviews = await Review.find({ doctor: { $in: doctorIds }, status: "approved" });
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const averageRating = reviews.length ? (totalRating / reviews.length).toFixed(2) : null;

    const specialtiesMap = {};
    for (const doc of doctors) {
      specialtiesMap[doc.specialization] = (specialtiesMap[doc.specialization] || 0) + 1;
    }

    const topSpecialties = Object.entries(specialtiesMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Monthly trends
    const monthlyData = {};

    appointments.forEach(app => {
      const monthKey = new Date(app.date).toLocaleString('default', { month: 'short', year: 'numeric' });
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { patients: new Set(), appointments: 0, revenue: 0 };
      }
      monthlyData[monthKey].patients.add(app.patient.toString());
      monthlyData[monthKey].appointments += 1;
      monthlyData[monthKey].revenue += app.amountPaid || 0;
    });

    const monthlyTrends = Object.entries(monthlyData).map(([month, data]) => ({
      month,
      patients: data.patients.size,
      appointments: data.appointments,
      revenue: data.revenue
    }));

    res.json({
      locationName: city,
      stats: {
        doctorsCount: doctors.length,
        patientsCount: patientIdsSet.size,
        appointmentsCount: appointments.length,
        revenue,
        averageRating,
        topSpecialties
      },
      monthlyTrends
    });

  } catch (error) {
    console.error("Error in getLocationOverview:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getAdminDoctors = async (req, res) => {
  try {
    const {
      status,
      location,
      specialty,
      search,
      page = 1,
      limit = 10
    } = req.query;

    const query = {};

    if (status) query["verification.status"] = status;
    if (location) query["address.city"] = location;
    if (specialty) query.specialization = specialty;
    if (search) {
      const regex = new RegExp(search.trim().replace(/\s+/g, "\\s+"), "i");
      const users = await User.find({ fullName: { $regex: regex } }).select("_id");
      userIds = users.map(u => u._id);
      query.user = { $in: userIds };
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const totalCount = await Doctor.countDocuments(query);
    const doctors = await Doctor.find(query)
      .populate("user", "name email")
      .skip(skip)
      .limit(parseInt(limit));

    const responseDoctors = await Promise.all(
      doctors.map(async doctor => {
        const doctorId = doctor._id;

        const appointments = await Appointment.find({ doctor: doctorId });
        const revenue = appointments.reduce((sum, a) => sum + (a.amountPaid || 0), 0);

        const completed = appointments.filter(a => a.status === "completed").length;
        const upcoming = appointments.filter(a => a.status === "upcoming").length;
        const cancelled = appointments.filter(a => a.status === "cancelled").length;

        const reviews = await Review.find({ doctor: doctorId, status: "approved" });
        const avgRating =
          reviews.length > 0
            ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2)
            : null;

        const patientSatisfaction =
          reviews.length > 0
            ? (
              reviews.filter(r => r.rating >= 4).length /
              reviews.length
            ).toFixed(2)
            : null;

        return {
          id: doctor._id,
          name: doctor.user.name,
          specialty: doctor.specialization,
          location: doctor.address.city,
          status: doctor.verification.status,
          appointments: appointments.length,
          appointmentsBreakdown: { completed, upcoming, cancelled },
          revenue,
          rating: avgRating,
          patientSatisfaction,
          availability: {
            clinic: doctor.clinicConsultationFee.isAvailable,
            online: doctor.onlineConsultation.isAvailable
          }
        };
      })
    );

    res.json({
      doctors: responseDoctors,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });

  } catch (error) {
    console.error("Error in /api/admin/doctors:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.getPendingDoctors = async (req, res) => {
  try {
    const pendingDoctors = await Doctor.find({ "verification.status": "pending" })
      .populate("user", "fullName email mobileNumber")
      .select("specialization qualifications verification.userSubmittedAt");

    const formatted = pendingDoctors.map(doc => ({
      id: doc._id,
      name: doc.user?.fullName,
      email: doc.user?.email,
      phone: doc.user?.mobileNumber,
      specialty: doc.specialization,
      submitDate: doc.verification?.userSubmittedAt,
      documents: (doc.verification?.documents || []).map(d => ({
        type: d.type,
        url: d.url
      })),
      qualifications: doc.qualifications.map(q => ({
        degree: q.degree,
        college: q.college,
        year: q.year,
        certificateUrl: q.certificateUrl
      }))
    }));

    res.status(200).json({
      pendingDoctors: formatted
    });
  } catch (err) {
    console.error("Error fetching pending doctors:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.updateDoctorStatus = async (req, res) => {
  const { id } = req.params;
  const { status, remarks } = req.body;

  if (!status || !['active', 'on leave', 'suspended'].includes(status)) {
    return res.status(400).json({ message: 'Invalid status provided' });
  }

  try {
    // Find and update the doctor’s status
    const updatedDoctor = await Doctor.findByIdAndUpdate(
      id,
      {
        $set: {
          isActive: status === 'active',
          status,
          remarks
        }
      },
      { new: true } // to return the updated document
    );

    if (!updatedDoctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    res.status(200).json({
      success: true,
      updatedDoctor
    });
  } catch (err) {
    console.error("Error updating doctor status:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.getDoctorPerformance = async (req, res) => {
  const { id } = req.params;

  try {
    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found" });

    // Get all completed and cancelled appointments
    const appointments = await Appointment.find({ doctor: id });

    const appointmentsCompleted = appointments.filter(a => a.status === "completed").length;
    const appointmentsCancelled = appointments.filter(a => a.status === "cancelled").length;

    // Average consultation time from virtual field
    const completedWithDuration = appointments.filter(a => a.status === "completed" && a.slot?.startTime && a.slot?.endTime);
    const averageConsultationTime = completedWithDuration.length
      ? completedWithDuration.reduce((sum, a) => sum + a.duration, 0) / completedWithDuration.length
      : 0;

    // Revenue: sum of all linked payments (assumes populated payment with amount)
    await Appointment.populate(appointments, { path: "payment", select: "amount" });
    const revenue = appointments.reduce((sum, a) => sum + (a.payment?.amount || 0), 0);

    // Get average rating from reviews
    const reviews = await Review.find({ doctor: id, status: "approved" });
    const patientRatings = reviews.length
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

    // Trends: Monthly (last 3 months)
    const trends = await Appointment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(id),
          status: { $in: ["completed", "cancelled"] }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$date" },
            year: { $year: "$date" }
          },
          appointments: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                { $gt: ["$payment", null] },
                { $ifNull: ["$payment.amount", 0] },
                0
              ]
            }
          }
        }
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 }
      },
      {
        $limit: 3
      }
    ]);

    // Fetch ratings per month
    const ratingsPerMonth = await Review.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(id),
          status: "approved"
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          ratings: { $avg: "$rating" }
        }
      }
    ]);

    // Merge ratings into trends
    const trendsWithRatings = trends.map(t => {
      const match = ratingsPerMonth.find(r => (
        r._id.month === t._id.month && r._id.year === t._id.year
      ));

      const period = `${t._id.year}-${String(t._id.month).padStart(2, "0")}`;
      return {
        period,
        appointments: t.appointments,
        ratings: match?.ratings || 0,
        revenue: t.revenue
      };
    });

    res.json({
      doctorInfo: {
        id: doctor._id,
        name: doctor.fullName,
        specialty: doctor.specialization
      },
      metrics: {
        appointmentsCompleted,
        appointmentsCancelled,
        patientRatings: parseFloat(patientRatings.toFixed(2)),
        revenue,
        averageConsultationTime: parseFloat(averageConsultationTime.toFixed(1))
      },
      trends: trendsWithRatings.reverse()
    });

  } catch (err) {
    console.error("Error fetching doctor performance:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getPatients = async (req, res) => {
  try {
    const { location, search, page = 1, limit = 10 } = req.query;

    const match = { role: "patient" };

    if (location) match.city = location;

    if (search) {
      match.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { mobileNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const patientsAgg = await User.aggregate([
      { $match: match },
      {
        $lookup: {
          from: "appointments",
          localField: "_id",
          foreignField: "patient",
          as: "appointments"
        }
      },
      {
        $lookup: {
          from: "payments",
          localField: "_id",
          foreignField: "patient",
          as: "payments"
        }
      },
      {
        $addFields: {
          totalAppointments: {
            $size: {
              $filter: {
                input: "$appointments",
                as: "app",
                cond: { $ne: ["$$app.status", "cancelled"] }
              }
            }
          },
          lastVisit: {
            $max: "$appointments.date"
          },
          totalBilling: {
            $sum: "$payments.amount"
          },
          age: {
            $cond: [
              { $ifNull: ["$dateOfBirth", false] },
              {
                $dateDiff: {
                  startDate: "$dateOfBirth",
                  endDate: "$$NOW",
                  unit: "year"
                }
              },
              null
            ]
          }
        }
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: "$fullName",
          age: 1,
          gender: 1,
          location: "$city",
          contact: "$mobileNumber",
          lastVisit: 1,
          totalAppointments: 1,
          totalBilling: 1
        }
      },
      { $sort: { lastVisit: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    const totalCount = await User.countDocuments(match);

    return res.status(200).json({
      patients: patientsAgg,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  } catch (error) {
    console.error("Error fetching patients:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


exports.getPatientDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch patient info
    const patient = await User.findById(id).select(
      '_id name age gender contact email address medicalHistory allergies bloodGroup'
    );

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    // 2. Fetch appointment history with doctor info and billing
    const appointments = await Appointment.find({ patient: id })
      .populate({
        path: 'doctor',
        select: 'name specialization'
      })
      .populate({
        path: 'payment',
        select: 'amount status'
      })
      .sort({ date: -1 });

    const appointmentHistory = appointments.map(app => ({
      id: app._id,
      date: app.date,
      doctor: app.doctor ? {
        id: app.doctor._id,
        name: app.doctor.name,
        specialization: app.doctor.specialization
      } : null,
      diagnosis: app.prescription?.diagnosis || 'N/A',
      status: app.status,
      billingAmount: app.payment?.amount || 0
    }));

    res.json({
      patientInfo: {
        id: patient._id,
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        contact: patient.contact,
        email: patient.email,
        address: patient.address,
        medicalHistory: patient.medicalHistory,
        allergies: patient.allergies,
        bloodGroup: patient.bloodGroup
      },
      appointmentHistory
    });
  } catch (error) {
    console.error('Error fetching patient details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

exports.getFinanceOverview = async (req, res) => {
  try {
    const { period = "monthly", location } = req.query;

    // Determine date range
    let startDate, endDate = new Date();
    switch (period) {
      case "daily":
        startDate = moment().startOf("day").toDate();
        break;
      case "weekly":
        startDate = moment().startOf("week").toDate();
        break;
      case "monthly":
        startDate = moment().startOf("month").toDate();
        break;
      case "yearly":
        startDate = moment().startOf("year").toDate();
        break;
      default:
        startDate = moment().subtract(1, "month").toDate(); // Default last 30 days
    }

    const paymentQuery = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "captured"
    };

    if (location) {
      // Fetch doctor IDs by city (location)
      const doctors = await Doctor.find({ city: location }).select("_id");
      const doctorIds = doctors.map(doc => doc._id);
      paymentQuery.doctor = { $in: doctorIds };
    }

    const payments = await Payment.find(paymentQuery).populate("doctor");

    // Calculate revenue and service data
    let totalRevenue = 0;
    const revenueByService = {};
    const revenueByLocation = {};

    for (let payment of payments) {
      const amt = payment.totalamount || payment.amount;
      totalRevenue += amt;

      const service = payment.appointment ? "consultation" : "other";
      revenueByService[service] = (revenueByService[service] || 0) + amt;

      const loc = payment.doctor?.city || "Unknown";
      revenueByLocation[loc] = (revenueByLocation[loc] || 0) + amt;
    }

    // Get expenses (admin withdrawals)
    const expensesAgg = await Transaction.aggregate([
      {
        $match: {
          type: "withdrawal_processed",
          status: "completed",
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: "$amount" }
        }
      }
    ]);

    const totalExpenses = expensesAgg[0]?.totalExpenses || 0;
    const netProfit = totalRevenue - totalExpenses;

    // Revenue trends
    const groupByFormat = {
      daily: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
      weekly: { $dateToString: { format: "%Y-%U", date: "$createdAt" } },
      monthly: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
      yearly: { $dateToString: { format: "%Y", date: "$createdAt" } }
    }[period];

    const trendsAgg = await Payment.aggregate([
      { $match: paymentQuery },
      {
        $group: {
          _id: groupByFormat,
          revenue: { $sum: "$totalamount" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const expenseTrendsAgg = await Transaction.aggregate([
      {
        $match: {
          type: "withdrawal_processed",
          status: "completed",
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupByFormat,
          expenses: { $sum: "$amount" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Merge trends
    const trendMap = {};

    trendsAgg.forEach(item => {
      trendMap[item._id] = { date: item._id, revenue: item.revenue, expenses: 0 };
    });

    expenseTrendsAgg.forEach(item => {
      if (!trendMap[item._id]) trendMap[item._id] = { date: item._id, revenue: 0 };
      trendMap[item._id].expenses = item.expenses;
    });

    const trends = Object.values(trendMap).map(t => ({
      ...t,
      profit: (t.revenue || 0) - (t.expenses || 0)
    }));

    return res.json({
      totalRevenue,
      totalExpenses,
      netProfit,
      revenueByService: Object.entries(revenueByService).map(([service, amount]) => ({ service, amount })),
      revenueByLocation: Object.entries(revenueByLocation).map(([location, amount]) => ({ location, amount })),
      trends
    });

  } catch (error) {
    console.error("Finance overview error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getFinanceTransactions = async (req, res) => {
  try {
    const { type, status, startDate, endDate, page = 1, limit = 10 } = req.query;

    const query = {};

    if (type) query.type = type;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    // Fetch transactions with pagination
    const [transactions, totalCount] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Transaction.countDocuments(query)
    ]);

    // Format transactions
    const formattedTransactions = await Promise.all(transactions.map(async (txn) => {
      let patient = null;
      let doctor = null;
      let service = null;
      let paymentMethod = null;

      // Try to get payment info
      if (txn.referenceType === "Payment" && txn.referenceId) {
        const payment = await Payment.findById(txn.referenceId).lean();
        if (payment) {
          patient = await User.findById(payment.patient).select("name").lean();
          doctor = await Doctor.findById(payment.doctor).select("name").lean();
          service = "Appointment";
          paymentMethod = payment.paymentMethod;
        }
      }

      // Try to get appointment info
      if (txn.referenceType === "Appointment" && txn.referenceId) {
        const appointment = await Appointment.findById(txn.referenceId).lean();
        if (appointment) {
          patient = await User.findById(appointment.patient).select("fullName").lean();
          doctor = await Doctor.findById(appointment.doctor).select("fullName").lean();
          service = appointment.appointmentType;
        }
      }

      return {
        id: txn._id,
        date: txn.createdAt,
        patient: patient?.name || "N/A",
        doctor: doctor?.name || "N/A",
        service: service || txn.type,
        amount: txn.amount,
        paymentMethod: paymentMethod || "N/A",
        status: txn.status,
        reference: txn.referenceId
      };
    }));

    // Summary stats
    const allMatching = await Transaction.find(query).lean();
    const summary = {
      total: allMatching.reduce((sum, t) => sum + t.amount, 0),
      paid: allMatching.filter(t => t.status === "completed").reduce((sum, t) => sum + t.amount, 0),
      pending: allMatching.filter(t => t.status === "pending").reduce((sum, t) => sum + t.amount, 0),
      refunded: allMatching.filter(t => t.type === "refund").reduce((sum, t) => sum + t.amount, 0)
    };

    return res.status(200).json({
      transactions: formattedTransactions,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limit),
      summary
    });

  } catch (err) {
    console.error("Error fetching transactions:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.addSuperAdmin = async (req, res) => {
  try {
    const { fullName, mobileNumber, email, countryCode, password, promoConsent = true } = req.body;

    // Basic validation
    if (!fullName || !mobileNumber || !countryCode || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, mobile number, country code, and password'
      });
    }

    // Check if mobile number or email already exists
    const existingUser = await User.findOne({
      $or: [{ email: email }, { $and: [{ mobileNumber }, { countryCode }] }]
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number or email already registered'
      });
    }

    // Create user
    const user = await User.create({
      fullName,
      mobileNumber,
      countryCode,
      password,
      email,
      role: 'superadmin', // assuming you want the role as a string 'superadmin'
      promoConsent,
      isMobileVerified: false
    });

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    await Otp.findOneAndUpdate(
      { user_id: user._id },
      { otp_code: otp, expires_at: otpExpiry },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Send OTP via API
    try {
      const response = await axios.post(`${transportStorageServiceUrl}/sms/sendOTP`, {
        to: `${countryCode}${mobileNumber}`,
        otp
      });

      if (response.data.success !== true) {
        throw new Error(response.data.message || 'Failed to send OTP');
      }
    } catch (apiError) {
      console.error('Error sending OTP:', apiError.message || apiError.response?.data);

      // Rollback user creation if OTP fails
      await User.findByIdAndDelete(user._id);

      return res.status(500).json({
        success: false,
        message: 'Registration failed: Unable to send OTP',
        error: apiError.message || 'Unknown error while sending OTP'
      });
    }

    // Email verification
    const emailVerifyToken = jwt.sign(
      { id: user._id, email, purpose: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    try {
      const emailResponse = await axios.post(`${transportStorageServiceUrl}/mail/sendEmailVerification`, {
        fullName: user.fullName,
        email,
        token: emailVerifyToken,
        url: process.env.FRONTEND_URL
      });

      if (emailResponse.status !== 200) {
        throw new Error(emailResponse.data.message || 'Failed to send email verification');
      }
    } catch (emailError) {
      console.error('Error sending email verification:', emailError.response?.data || emailError.message);

      return res.status(500).json({
        success: false,
        message: 'Failed to send email verification. Please try again later.',
        error: emailError.message || 'Unknown error'
      });
    }

    // Temporary token for mobile verification
    const tempToken = jwt.sign(
      { id: user._id, purpose: 'mobile_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration initiated. OTP sent to mobile.',
      data: {
        verificationToken: tempToken,
        mobileNumber: user.mobileNumber,
        userId: user._id
      }
    });

  } catch (error) {
    console.error("Error in addSuperAdmin:", error);
    res.status(500).send({
      success: false,
      message: 'Something went wrong. Please try again later.',
      error: error.message || 'Unknown error'
    });
  }
};

exports.addAdmin = async (req, res) => {
  try {
    const { fullName, mobileNumber, email, countryCode, password, promoConsent = true } = req.body;

    // Basic validation
    if (!fullName || !mobileNumber || !countryCode || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide full name, mobile number, country code, and password'
      });
    }

    // Check if mobile number or email already exists
    const existingUser = await User.findOne({
      $or: [{ email: email }, { $and: [{ mobileNumber }, { countryCode }] }]
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number or email already registered'
      });
    }

    // Create user
    const user = await User.create({
      fullName,
      mobileNumber,
      countryCode,
      password,
      email,
      role: 'admin', // assuming you want the role as a string 'superadmin'
      promoConsent,
      isMobileVerified: false
    });

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    await Otp.findOneAndUpdate(
      { user_id: user._id },
      { otp_code: otp, expires_at: otpExpiry },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Send OTP via API
    try {
      const response = await axios.post(`${transportStorageServiceUrl}/sms/sendOTP`, {
        to: `${countryCode}${mobileNumber}`,
        otp
      });

      if (response.data.success !== true) {
        throw new Error(response.data.message || 'Failed to send OTP');
      }
    } catch (apiError) {
      console.error('Error sending OTP:', apiError.message || apiError.response?.data);

      // Rollback user creation if OTP fails
      await User.findByIdAndDelete(user._id);

      return res.status(500).json({
        success: false,
        message: 'Registration failed: Unable to send OTP',
        error: apiError.message || 'Unknown error while sending OTP'
      });
    }

    // Email verification
    const emailVerifyToken = jwt.sign(
      { id: user._id, email, purpose: 'email_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    try {
      const emailResponse = await axios.post(`${transportStorageServiceUrl}/mail/sendEmailVerification`, {
        fullName: user.fullName,
        email,
        token: emailVerifyToken,
        url: process.env.FRONTEND_URL
      });

      if (emailResponse.status !== 200) {
        throw new Error(emailResponse.data.message || 'Failed to send email verification');
      }
    } catch (emailError) {
      console.error('Error sending email verification:', emailError.response?.data || emailError.message);

      return res.status(500).json({
        success: false,
        message: 'Failed to send email verification. Please try again later.',
        error: emailError.message || 'Unknown error'
      });
    }

    // Temporary token for mobile verification
    const tempToken = jwt.sign(
      { id: user._id, purpose: 'mobile_verification' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration initiated. OTP sent to mobile.',
      data: {
        verificationToken: tempToken,
        mobileNumber: user.mobileNumber,
        userId: user._id
      }
    });

  } catch (error) {
    console.error("Error in addSuperAdmin:", error);
    res.status(500).send({
      success: false,
      message: 'Something went wrong. Please try again later.',
      error: error.message || 'Unknown error'
    });
  }
};

exports.defaultAdmin = async () => {
  try {
    const superAdminData = {
      fullName: "Dusanapudi Venkanna Babu",
      email: "dusanapudivenkannababu@gmail.com",
      countryCode: "+91",
      mobileNumber: "8309406070",
      password: "superadmin@123",
      isMobileVerified: true,
      isEmailVerified: true
    };

    const saveSuperAdmin = await User.findOne({ $or: [{ email: superAdminData.email }, { mobileNumber: superAdminData.mobileNumber }] });
    if (!saveSuperAdmin) {
      await User.create({ ...superAdminData });
      console.log("Default superadmin created...");
    }
    else {
      console.log("Default superAdmin already existed...");
    }

  } catch (error) {
    console.log("Error in the defaultAdmin: ", error);
  }
}

// Helper functions
function calculateGrowth(current, previous) {
  if (previous === 0) return 0;
  return Math.round(((current - previous) / previous) * 100);
}

function calculateRevisitRate(totalPatients, newPatients) {
  if (totalPatients === 0) return "0%";
  const returningPatients = totalPatients - newPatients;
  return Math.round((returningPatients / totalPatients) * 100) + "%";
}

function calculateRevenueGrowth(currentRevenue, previousRevenue) {
  if (previousRevenue === 0) return "+0%";
  const growth = ((currentRevenue - previousRevenue) / previousRevenue) * 100;
  return (growth >= 0 ? "+" : "") + Math.round(growth) + "%";
}

function calculateAge(dateOfBirth) {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function generateMonthLabels(count) {
  const months = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(date.toLocaleString('default', { month: 'short' }));
  }
  return months;
}

function generateMonthlyAppointments(appointments, count) {
  const monthlyData = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const startDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    const monthCount = appointments.filter(a => {
      const appointmentDate = new Date(a.date);
      return appointmentDate >= startDate && appointmentDate <= endDate;
    }).length;
    monthlyData.push(monthCount);
  }
  return monthlyData;
}

function calculateRetentionRates(appointments, patients, count) {
  const retentionRates = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const startDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    const monthlyPatients = appointments
      .filter(a => {
        const appointmentDate = new Date(a.date);
        return appointmentDate >= startDate && appointmentDate <= endDate;
      })
      .map(a => a.patient._id.toString());
    const uniquePatients = [...new Set(monthlyPatients)];
    const returningPatients = uniquePatients.filter(patientId => {
      const patientAppointments = appointments.filter(a =>
        a.patient._id.toString() === patientId &&
        new Date(a.date) < startDate
      );
      return patientAppointments.length > 0;
    });
    const retentionRate = (returningPatients.length / uniquePatients.length) * 100 || 0;
    retentionRates.push(Math.round(retentionRate));
  }
  return retentionRates;
}

async function getCommonIssues(appointments) {
  const issueCount = {};
  appointments.forEach(appointment => {
    if (appointment.symptoms) {
      appointment.symptoms.forEach(symptom => {
        issueCount[symptom] = (issueCount[symptom] || 0) + 1;
      });
    }
  });
  return Object.entries(issueCount)
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

async function calculateAverageWaitTime(appointments) {
  if (!appointments.length) return "0 min";
  const totalWaitTime = appointments.reduce((sum, appt) => {
    const waitTime = (new Date(appt.startTime) - new Date(appt.scheduledTime)) / (1000 * 60);
    return sum + (waitTime > 0 ? waitTime : 0);
  }, 0);
  return Math.round(totalWaitTime / appointments.length) + " min";
}

function generateRevenueDataByPeriod(period, payments) {
  const today = new Date();
  let data = [];
  let totalRevenue = 0;
  let previousPeriodRevenue = 0;

  switch (period) {
    case 'day':
      // Generate 24 hourly data points
      for (let i = 0; i < 24; i++) {
        const hourStart = new Date(today);
        hourStart.setHours(i, 0, 0, 0);
        const hourEnd = new Date(today);
        hourEnd.setHours(i, 59, 59, 999);

        const hourRevenue = payments
          .filter(p => {
            const date = new Date(p.createdAt);
            return date >= hourStart && date <= hourEnd;
          })
          .reduce((sum, p) => sum + p.amount, 0);

        data.push({
          x: i * (1000 / 24),
          value: hourRevenue,
          formattedDate: hourStart.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          index: i
        });
        totalRevenue += hourRevenue;
      }
      // Calculate previous day's revenue for percentage change
      const yesterdayStart = new Date(today);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setHours(23, 59, 59, 999);
      previousPeriodRevenue = payments
        .filter(p => new Date(p.createdAt) >= yesterdayStart && new Date(p.createdAt) <= yesterdayEnd)
        .reduce((sum, p) => sum + p.amount, 0);
      break;

    case 'week':
      // Generate 7 daily data points
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(today);
        dayStart.setDate(today.getDate() - i);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const dayRevenue = payments
          .filter(p => {
            const date = new Date(p.createdAt);
            return date >= dayStart && date <= dayEnd;
          })
          .reduce((sum, p) => sum + p.amount, 0);

        data.push({
          x: (6 - i) * (1000 / 7),
          value: dayRevenue,
          formattedDate: dayStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
          index: 6 - i
        });
        totalRevenue += dayRevenue;
      }
      // Calculate previous week's revenue
      const lastWeekStart = new Date(today);
      lastWeekStart.setDate(lastWeekStart.getDate() - 14);
      lastWeekStart.setHours(0, 0, 0, 0);
      const lastWeekEnd = new Date(lastWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
      previousPeriodRevenue = payments
        .filter(p => new Date(p.createdAt) >= lastWeekStart && new Date(p.createdAt) <= lastWeekEnd)
        .reduce((sum, p) => sum + p.amount, 0);
      break;
  }

  // Calculate percentage change
  const percentChange = previousPeriodRevenue > 0
    ? ((totalRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100
    : 0;

  // Calculate y-coordinates for the chart
  const maxValue = Math.max(...data.map(point => point.value));
  data = data.map(point => ({
    ...point,
    y: maxValue === 0 ? 150 : Math.round(270 - ((point.value / maxValue) * 240) + 30)
  }));

  // Generate y-axis labels
  const yAxisLabels = [
    { value: maxValue, y: 30 },
    { value: maxValue / 2, y: 150 },
    { value: 0, y: 270 }
  ];

  return {
    data,
    totalRevenue,
    percentChange: Math.round(percentChange),
    yAxisLabels
  };
};