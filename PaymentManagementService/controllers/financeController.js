// controllers/financeController.js

const Transaction = require("../models/Transaction");
const Payment = require("../models/Payment");
const UpcomingEarnings = require("../models/UpcomingEarnings");
const Wallet = require("../models/Wallet");
const User = require("../models/User");
const Cluster = require("../models/Cluster");
const Hospital = require("../models/Hospital");
const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");

// Helper function to get admin's cluster and doctors
const getAdminClusterDoctors = async (adminId) => {
  try {
    // Get admin's cluster
    const cluster = await Cluster.findOne({ user: adminId })
      .populate({
        path: 'hospitals',
        populate: {
          path: 'doctors',
          model: 'Doctor'
        }
      });

    if (!cluster) {
      throw new Error('Cluster not found for admin');
    }

    // Extract all doctors from all hospitals in the cluster
    const doctors = cluster.hospitals.flatMap(hospital => hospital.doctors || []);
    const doctorIds = doctors.map(doctor => doctor._id);

    return {
      cluster,
      hospitals: cluster.hospitals,
      doctors,
      doctorIds
    };
  } catch (error) {
    console.error('Error getting admin cluster doctors:', error);
    throw error;
  }
};

// Get finance overview data for admin's cluster
exports.getFinanceOverview = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    // Get admin's cluster and doctors
    const { cluster, hospitals, doctors, doctorIds } = await getAdminClusterDoctors(adminId);

    if (doctorIds.length === 0) {
      return res.json({
        totalRevenue: 0,
        pendingPayments: 0,
        recentSettlements: 0,
        projectedRevenue: 0,
        refundsIssued: 0,
        expenseTotal: 0,
        targetRevenue: 0,
        currentRevenue: 0,
        targetPercentage: 0,
        divisionRevenue: 0,
        divisionTarget: 0,
        divisionPercentage: 0,
        channelRevenue: 0,
        channelTarget: 0,
        channelPercentage: 0,
        pipelinePercentage: 0,
        locations: [],
        paymentMethods: [],
        monthlyTarget: [],
        revenueSources: []
      });
    }

    // Calculate total revenue (sum of all captured payments for cluster doctors)
    const totalRevenueResult = await Payment.aggregate([
      { 
        $match: { 
          status: "captured",
          doctor: { $in: doctorIds }
        } 
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalRevenue = totalRevenueResult[0]?.total || 0;

    // Calculate pending payments (sum of upcoming earnings for cluster doctors)
    const pendingPaymentsResult = await UpcomingEarnings.aggregate([
      { 
        $match: { 
          status: "pending",
          doctor: { $in: doctorIds }
        } 
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const pendingPayments = pendingPaymentsResult[0]?.total || 0;

    // Calculate recent settlements (processed earnings in last 30 days for cluster doctors)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentSettlementsResult = await UpcomingEarnings.aggregate([
      { 
        $match: { 
          status: "processed",
          doctor: { $in: doctorIds },
          processedAt: { $gte: thirtyDaysAgo }
        } 
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const recentSettlements = recentSettlementsResult[0]?.total || 0;

    // Calculate refunds issued for cluster doctors' appointments
    const refundsResult = await Transaction.aggregate([
      { 
        $match: { 
          type: "refund",
          status: "completed"
        } 
      },
      {
        $lookup: {
          from: "payments",
          localField: "referenceId",
          foreignField: "_id",
          as: "paymentInfo"
        }
      },
      { $unwind: "$paymentInfo" },
      {
        $match: {
          "paymentInfo.doctor": { $in: doctorIds }
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const refundsIssued = Math.abs(refundsResult[0]?.total || 0);

    // Calculate expense total (sum of withdrawal requests for cluster doctors)
    const expenseResult = await Transaction.aggregate([
      { 
        $match: { 
          type: "withdrawal_processed",
          user: { $in: doctors.map(d => d.user) }
        } 
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const expenseTotal = expenseResult[0]?.total || 0;

    // Projected revenue (total revenue + pending payments)
    const projectedRevenue = totalRevenue + pendingPayments;

    // Dynamic target calculation based on cluster performance
    const targetRevenue = await calculateClusterTarget(cluster, doctors);
    const targetPercentage = targetRevenue > 0 ? Math.round((totalRevenue / targetRevenue) * 100) : 0;

    // Division data (cluster performance)
    const divisionRevenue = totalRevenue;
    const divisionTarget = targetRevenue;
    const divisionPercentage = targetRevenue > 0 ? Math.round((totalRevenue / targetRevenue) * 100) : 0;

    // Channel revenue (online vs clinic appointments)
    const channelData = await getChannelRevenue(doctorIds);
    const channelRevenue = channelData.total;
    const channelTarget = targetRevenue * 0.7; // 70% of total target for channels
    const channelPercentage = channelTarget > 0 ? Math.round((channelRevenue / channelTarget) * 100) : 0;

    // Get location-wise revenue (group by hospital locations)
    const locationRevenue = await Payment.aggregate([
      { 
        $match: { 
          status: "captured",
          doctor: { $in: doctorIds }
        } 
      },
      {
        $lookup: {
          from: "doctors",
          localField: "doctor",
          foreignField: "_id",
          as: "doctorInfo"
        }
      },
      { $unwind: "$doctorInfo" },
      {
        $lookup: {
          from: "hospitals",
          localField: "doctorInfo.hospitalAffiliations.hospital",
          foreignField: "_id",
          as: "hospitalInfo"
        }
      },
      { $unwind: { path: "$hospitalInfo", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: "$hospitalInfo.name" || "$doctorInfo.address.city" || "Unknown Location",
          revenue: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // Format locations data
    const locations = locationRevenue.map(loc => ({
      name: loc._id,
      revenue: loc.revenue,
      growth: calculateGrowth(loc._id, loc.revenue),
      expenses: Math.round(loc.revenue * 0.4)
    }));

    // Get payment methods distribution for cluster doctors
    const paymentMethodsResult = await Payment.aggregate([
      { 
        $match: { 
          status: "captured",
          doctor: { $in: doctorIds }
        } 
      },
      {
        $group: {
          _id: "$paymentMethod",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalPaymentAmount = paymentMethodsResult.reduce((sum, method) => sum + method.total, 0);
    
    const paymentMethods = paymentMethodsResult.map(method => {
      const percentage = totalPaymentAmount > 0 ? Math.round((method.total / totalPaymentAmount) * 100) : 0;
      return {
        method: method._id ? method._id.toUpperCase().replace('_', ' ') : 'UNKNOWN',
        percentage: percentage,
        amount: method.total
      };
    });

    // Get monthly target data (last 6 months) for cluster
    const monthlyTarget = await getMonthlyTargetData(doctorIds);

    // Get revenue sources (by appointment types) for cluster doctors
    const revenueSourcesResult = await Payment.aggregate([
      { 
        $match: { 
          status: "captured",
          doctor: { $in: doctorIds }
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
      { $unwind: "$appointmentInfo" },
      {
        $group: {
          _id: "$appointmentInfo.appointmentType",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const revenueSources = revenueSourcesResult.map(source => ({
      name: source._id ? source._id.charAt(0).toUpperCase() + source._id.slice(1) + ' Consultations' : 'General',
      value: totalRevenue > 0 ? Math.round((source.total / totalRevenue) * 100) : 0,
      amount: source.total
    }));

    // Calculate pipeline percentage (completed vs total appointments)
    const pipelineData = await Appointment.aggregate([
      {
        $match: {
          doctor: { $in: doctorIds },
          createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    const completedAppointments = pipelineData.find(d => d._id === 'completed')?.count || 0;
    const totalAppointments = pipelineData.reduce((sum, d) => sum + d.count, 0);
    const pipelinePercentage = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;

    // Prepare response in exact UI structure
    const response = {
      totalRevenue,
      pendingPayments,
      recentSettlements,
      projectedRevenue,
      refundsIssued,
      expenseTotal,
      targetRevenue,
      currentRevenue: totalRevenue,
      targetPercentage,
      divisionRevenue,
      divisionTarget,
      divisionPercentage,
      channelRevenue,
      channelTarget,
      channelPercentage,
      pipelinePercentage,
      locations,
      paymentMethods,
      monthlyTarget,
      revenueSources
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching finance overview:", error);
    res.status(500).json({ error: "Failed to fetch finance data" });
  }
};

// Helper function to calculate cluster target
async function calculateClusterTarget(cluster, doctors) {
  const baseTarget = 1000000;
  const doctorMultiplier = doctors.length * 50000;
  const hospitalMultiplier = cluster.hospitals.length * 100000;
  
  return baseTarget + doctorMultiplier + hospitalMultiplier;
}

// Helper function to get channel revenue (online vs clinic)
async function getChannelRevenue(doctorIds) {
  const channelResult = await Payment.aggregate([
    { 
      $match: { 
        status: "captured",
        doctor: { $in: doctorIds }
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
    { $unwind: "$appointmentInfo" },
    {
      $group: {
        _id: "$appointmentInfo.appointmentType",
        total: { $sum: "$amount" }
      }
    }
  ]);

  const total = channelResult.reduce((sum, channel) => sum + channel.total, 0);
  
  return {
    total,
    breakdown: channelResult
  };
}

// Helper function to get monthly target data
async function getMonthlyTargetData(doctorIds) {
  const monthlyTarget = [];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    
    const monthlyRevenue = await Payment.aggregate([
      {
        $match: {
          status: "captured",
          doctor: { $in: doctorIds },
          createdAt: { $gte: monthStart, $lte: monthEnd }
        }
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    
    const baseTarget = 180000;
    const seasonalAdjustment = date.getMonth() >= 10 || date.getMonth() <= 3 ? 1.2 : 0.9;
    const target = Math.round(baseTarget * seasonalAdjustment);
    
    monthlyTarget.push({
      month: months[date.getMonth()],
      target: target,
      actual: monthlyRevenue[0]?.total || 0
    });
  }

  return monthlyTarget;
}

// Helper function to calculate growth
function calculateGrowth(locationName, currentRevenue) {
  const growthRates = {
    'Vijayawada': '+12%',
    'Guntur': '+8%',
    'Nellore': '+5%',
    'Tirupati': '+15%'
  };
  
  return growthRates[locationName] || '+10%';
}

// Get transactions data for admin's cluster
exports.getTransactions = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { 
      page = 1,
      limit = 10,
      dateRange = 'all', 
      type = 'all', 
      person = '', 
      amount = 'all', 
      search = '',
      sortField = 'date',
      sortDirection = 'desc'
    } = req.query;

    // Convert page and limit to numbers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get admin's cluster doctors
    const { doctorIds, doctors } = await getAdminClusterDoctors(adminId);
    const doctorUserIds = doctors.map(d => d.user);

    // Build match query
    const matchQuery = {
      $or: [
        { user: { $in: doctorUserIds } },
        { 
          type: "appointment_payment"
        }
      ]
    };

    // Date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate;

      switch (dateRange) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0));
          matchQuery.createdAt = { $gte: startDate };
          break;
        case 'week':
          startDate = new Date(now.setDate(now.getDate() - 7));
          matchQuery.createdAt = { $gte: startDate };
          break;
        case 'month':
          startDate = new Date(now.setMonth(now.getMonth() - 1));
          matchQuery.createdAt = { $gte: startDate };
          break;
      }
    }

    // Type filter
    if (type !== 'all') {
      if (type === 'sent') {
        matchQuery.type = { 
          $in: ["withdrawal_processed", "service_payment", "coin_purchase"] 
        };
      } else if (type === 'received') {
        matchQuery.type = { 
          $in: ["doctor_credit", "appointment_payment"] 
        };
      }
    }

    // Build aggregation pipeline for counting total documents
    const countPipeline = [
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo"
        }
      },
      { $unwind: "$userInfo" },
      { $match: matchQuery },
      {
        $lookup: {
          from: "payments",
          localField: "referenceId",
          foreignField: "_id",
          as: "paymentInfo"
        }
      },
      {
        $addFields: {
          isClusterDoctorTx: { $in: ["$user", doctorUserIds] },
          isClusterAppointmentTx: {
            $and: [
              { $eq: ["$type", "appointment_payment"] },
              { $in: [{ $arrayElemAt: ["$paymentInfo.doctor", 0] }, doctorIds] }
            ]
          }
        }
      },
      {
        $match: {
          $or: [
            { isClusterDoctorTx: true },
            { isClusterAppointmentTx: true }
          ]
        }
      }
    ];

    // Build main aggregation pipeline
    const pipeline = [
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo"
        }
      },
      { $unwind: "$userInfo" },
      { $match: matchQuery },
      {
        $lookup: {
          from: "payments",
          localField: "referenceId",
          foreignField: "_id",
          as: "paymentInfo"
        }
      },
      {
        $addFields: {
          isClusterDoctorTx: { $in: ["$user", doctorUserIds] },
          isClusterAppointmentTx: {
            $and: [
              { $eq: ["$type", "appointment_payment"] },
              { $in: [{ $arrayElemAt: ["$paymentInfo.doctor", 0] }, doctorIds] }
            ]
          }
        }
      },
      {
        $match: {
          $or: [
            { isClusterDoctorTx: true },
            { isClusterAppointmentTx: true }
          ]
        }
      },
      {
        $project: {
          id: "$_id",
          type: {
            $switch: {
              branches: [
                { 
                  case: { $in: ["$type", ["withdrawal_processed", "service_payment", "coin_purchase"]] }, 
                  then: "sent" 
                },
                { 
                  case: { $in: ["$type", ["doctor_credit", "appointment_payment"]] }, 
                  then: "received" 
                }
              ],
              default: "sent"
            }
          },
          amount: {
            $concat: [
              { $toString: { $round: ["$amount", 2] } },
              " INR"
            ]
          },
          amountValue: "$amount",
          paymentMethod: {
            $switch: {
              branches: [
                { case: { $eq: ["$type", "appointment_payment"] }, then: "Credit Card" },
                { case: { $eq: ["$type", "doctor_credit"] }, then: "Bank Transfer" },
                { case: { $eq: ["$type", "withdrawal_processed"] }, then: "Wire Transfer" },
                { case: { $eq: ["$type", "coin_purchase"] }, then: "UPI" }
              ],
              default: "Bank Transfer"
            }
          },
          status: {
            $switch: {
              branches: [
                { case: { $eq: ["$status", "completed"] }, then: "Success" },
                { case: { $eq: ["$status", "processing"] }, then: "Pending" },
                { case: { $eq: ["$status", "failed"] }, then: "Failed" }
              ],
              default: "Pending"
            }
          },
          activity: "$notes",
          person: "$userInfo.name",
          category: "$userInfo.role",
          date: {
            $dateToString: {
              format: "%Y-%m-%d %H:%M",
              date: "$createdAt"
            }
          },
          timestamp: { $toLong: "$createdAt" }
        }
      }
    ];

    // Apply search filter to both pipelines
    const searchMatchStage = {
      $match: {
        $or: [
          { notes: { $regex: search, $options: 'i' } },
          { person: { $regex: search, $options: 'i' } },
          { activity: { $regex: search, $options: 'i' } }
        ]
      }
    };

    if (search) {
      pipeline.push(searchMatchStage);
      countPipeline.push(searchMatchStage);
    }

    // Add sorting to main pipeline
    let sortStage = {};
    switch (sortField) {
      case 'amount':
        sortStage = { amountValue: sortDirection === 'asc' ? 1 : -1 };
        break;
      case 'date':
        sortStage = { timestamp: sortDirection === 'asc' ? 1 : -1 };
        break;
      case 'person':
        sortStage = { person: sortDirection === 'asc' ? 1 : -1 };
        break;
      case 'status':
        sortStage = { status: sortDirection === 'asc' ? 1 : -1 };
        break;
      case 'type':
        sortStage = { type: sortDirection === 'asc' ? 1 : -1 };
        break;
      default:
        sortStage = { timestamp: -1 };
    }
    pipeline.push({ $sort: sortStage });

    // Get total count for pagination
    const totalCountResult = await Transaction.aggregate([
      ...countPipeline,
      { $count: "totalCount" }
    ]);
    const totalCount = totalCountResult.length > 0 ? totalCountResult[0].totalCount : 0;

    // Apply pagination to main pipeline
    pipeline.push(
      { $skip: skip },
      { $limit: limitNum }
    );

    const transactions = await Transaction.aggregate(pipeline);

    // Format the date to match the expected frontend format
    const formattedTransactions = transactions.map(tx => ({
      ...tx,
      date: formatDateForFrontend(tx.date)
    }));

    // Apply amount filter (client-side as it depends on amountValue)
    let filteredTransactions = formattedTransactions;
    if (amount !== 'all') {
      filteredTransactions = formattedTransactions.filter(tx => {
        switch (amount) {
          case 'high':
            return tx.amountValue >= 100000;
          case 'medium':
            return tx.amountValue >= 10000 && tx.amountValue < 100000;
          case 'low':
            return tx.amountValue < 10000;
          default:
            return true;
        }
      });
    }

    // Apply person filter (client-side)
    if (person) {
      filteredTransactions = filteredTransactions.filter(tx =>
        tx.person.toLowerCase().includes(person.toLowerCase())
      );
    }

    // Calculate pagination info based on filtered results
    const filteredCount = filteredTransactions.length;
    const totalPages = Math.ceil(totalCount / limitNum);
    const currentPage = pageNum;

    res.json({
      transactions: filteredTransactions,
      pagination: {
        currentPage,
        totalPages,
        totalCount,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
};
// Helper function to format date for frontend
function formatDateForFrontend(dateString) {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    return dateString;
  }
}

// Get transaction summary for admin's cluster dashboard
exports.getTransactionSummary = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { doctorIds, doctors } = await getAdminClusterDoctors(adminId);
    const doctorUserIds = doctors.map(d => d.user);

    // Total transactions for cluster
    const total = await Transaction.countDocuments({
      $or: [
        { user: { $in: doctorUserIds } },
        { 
          type: "appointment_payment"
        }
      ]
    });

    // Sent transactions
    const sent = await Transaction.countDocuments({
      user: { $in: doctorUserIds },
      type: { $in: ["withdrawal_processed", "service_payment", "coin_purchase"] }
    });

    // Received transactions
    const received = await Transaction.countDocuments({
      $or: [
        {
          user: { $in: doctorUserIds },
          type: { $in: ["doctor_credit"] }
        },
        {
          type: "appointment_payment"
        }
      ]
    });

    // Pending transactions
    const pending = await Transaction.countDocuments({
      status: "pending",
      $or: [
        { user: { $in: doctorUserIds } },
        { 
          type: "appointment_payment"
        }
      ]
    });

    res.json({
      total,
      sent,
      received,
      pending
    });
  } catch (error) {
    console.error("Error fetching transaction summary:", error);
    res.status(500).json({ error: "Failed to fetch transaction summary" });
  }
};