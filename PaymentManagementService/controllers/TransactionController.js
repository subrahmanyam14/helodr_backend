const Transaction = require("../models/Transaction");
const Payment = require("../models/Payment");
const mongoose = require("mongoose");
const UpcomingEarnings = require("../models/UpcomingEarnings");

// Create a new transaction
const createTransaction = async (req, res) => {
  try {
    const transactionData = req.body;
    const transaction = await Transaction.createTransaction(transactionData);
    
    res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      transaction
    });
  } catch (error) {
    console.error("Create Transaction Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create transaction",
      error: error.message
    });
  }
};

// Get transactions with various filters
const getTransactions = async (req, res) => {
    try {
      const {
        userId,
        type,
        status,
        referenceType,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;
  
      // Build the query object
      const query = {};
      
      if (userId) {
        query.user = new mongoose.Types.ObjectId(userId); // Fixed: Added 'new' keyword
      }
      
      if (type) {
        query.type = { $in: type.split(',') };
      }
      
      if (status) {
        query.status = { $in: status.split(',') };
      }
      
      if (referenceType) {
        query.referenceType = { $in: referenceType.split(',') };
      }
      
      if (minAmount || maxAmount) {
        query.amount = {};
        if (minAmount) query.amount.$gte = Number(minAmount);
        if (maxAmount) query.amount.$lte = Number(maxAmount);
      }
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }
  
      // If user is not admin, restrict to their own transactions
      if (req.user.role !== 'admin') {
        query.user = new mongoose.Types.ObjectId(req.user._id); // Fixed: Added 'new' keyword
      }
  
      // Sorting
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await Transaction.countDocuments(query);
  
      const transactions = await Transaction.find(query)
        .populate('user', 'fullName email role countryCode mobileNumber')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
  
      res.status(200).json({
        success: true,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        transactions
      });
    } catch (error) {
      console.error("Get Transactions Error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
        error: error.message
      });
    }
  };

// Get a single transaction by ID
const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const transaction = await Transaction.findById(id)
      .populate('user', 'name email role')
      .populate('referenceId');
      
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }
    
    res.status(200).json({
      success: true,
      transaction
    });
  } catch (error) {
    console.error("Get Transaction Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction",
      error: error.message
    });
  }
};

// Update transaction status
const updateTransactionStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const transaction = await Transaction.findByIdAndUpdate(
      id,
      { status, notes },
      { new: true, runValidators: true }
    );
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }
    
    res.status(200).json({
      success: true,
      message: "Transaction updated successfully",
      transaction
    });
  } catch (error) {
    console.error("Update Transaction Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update transaction",
      error: error.message
    });
  }
};

// Get transaction statistics
const getTransactionStats = async (req, res) => {
  try {
    const { userId, type, timeframe = 'month' } = req.query;
    
    const dateFilter = {};
    const now = new Date();
    
    // Set date range based on timeframe
    switch (timeframe) {
      case 'day':
        dateFilter.$gte = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        dateFilter.$gte = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        dateFilter.$gte = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        dateFilter.$gte = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
    }
    
    const query = { createdAt: dateFilter };
    if (userId) query.user = userId;
    if (type) query.type = type;
    
    const stats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          creditAmount: {
            $sum: {
              $cond: [{ $gt: ["$amount", 0] }, "$amount", 0]
            }
          },
          debitAmount: {
            $sum: {
              $cond: [{ $lt: ["$amount", 0] }, "$amount", 0]
            }
          },
          byType: { $push: { type: "$type", amount: "$amount" } }
        }
      },
      {
        $project: {
          _id: 0,
          totalTransactions: 1,
          totalAmount: 1,
          creditAmount: 1,
          debitAmount: 1,
          netAmount: { $add: ["$creditAmount", "$debitAmount"] }
        }
      }
    ]);
    
    // Additional aggregation for type-wise breakdown
    const typeStats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      stats: stats[0] || {
        totalTransactions: 0,
        totalAmount: 0,
        creditAmount: 0,
        debitAmount: 0,
        netAmount: 0
      },
      typeStats
    });
  } catch (error) {
    console.error("Transaction Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction statistics",
      error: error.message
    });
  }
};


const getAllTransactions = async (req, res) => {
  try {
    const { doctorId } = req.user;
    
    if (!doctorId) {
      return res.status(400).json({ message: "Doctor ID is required" });
    }

    // 1. Get transaction history (all completed transactions)
    const historyTransactions = await Transaction.find({
      user: req.user.id,
      type: "doctor_credit",
      status: "completed"
    })
    .sort({ createdAt: -1 })
    .populate({
      path: 'referenceId',
      match: { referenceType: 'Appointment' },
      populate: {
        path: 'patient',
        select: 'fullName'
      }
    });
    

    // 2. Get today's transactions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Today's completed transactions
    const completedToday = await Transaction.find({
      user: doctorId,
      type: "doctor_credit",
      status: "completed",
      createdAt: { $gte: todayStart, $lte: todayEnd }
    })
    .populate({
      path: 'referenceId',
      match: { referenceType: 'Appointment' },
      populate: {
        path: 'patient',
        select: 'fullName'
      }
    });

    // Today's processing transactions
    const processingToday = await Transaction.find({
      user: doctorId,
      type: "doctor_credit",
      status: "processing",
      createdAt: { $gte: todayStart, $lte: todayEnd }
    })
    .populate({
      path: 'referenceId',
      match: { referenceType: 'Appointment' },
      populate: {
        path: 'patient',
        select: 'fullName'
      }
    });

    // Today's upcoming earnings
    const upcomingToday = await UpcomingEarnings.find({
      doctor: doctorId,
      status: "pending",
      scheduledDate: { $gte: todayStart, $lte: todayEnd }
    })
    .populate({
      path: 'appointment',
      populate: {
        path: 'patient',
        select: 'fullName'
      }
    });

    // 3. Get all upcoming payments
    const upcomingPayments = await UpcomingEarnings.find({
      doctor: doctorId,
      status: "pending"
    })
    .populate({
      path: 'appointment',
      populate: {
        path: 'patient',
        select: 'fullName'
      }
    })
    .sort({ scheduledDate: 1 });

    // Format all responses
    const formattedHistory = historyTransactions.map(transaction => ({
      id: transaction._id,
      patient: transaction.referenceId?.patient?.fullName || "Unknown",
      date: transaction.createdAt.toISOString().split('T')[0],
      amount: transaction.amount,
      status: 'Completed'
    }));

    const formattedCompletedToday = completedToday.map(t => ({
      id: t._id,
      patient: t.referenceId?.patient?.fullName || "Unknown",
      time: t.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      amount: t.amount,
      status: 'Completed'
    }));

    const formattedProcessingToday = processingToday.map(t => ({
      id: t._id,
      patient: t.referenceId?.patient?.fullName || "Unknown",
      time: t.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      amount: t.amount,
      status: 'Processing'
    }));

    const formattedUpcomingToday = upcomingToday.map(e => ({
      id: e._id,
      patient: e.appointment?.patient?.fullName || "Unknown",
      time: e.scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      amount: e.amount,
      status: 'Upcoming'
    }));

    const todayTransactions = [
      ...formattedCompletedToday,
      ...formattedProcessingToday,
      ...formattedUpcomingToday
    ].sort((a, b) => new Date(b.time) - new Date(a.time));

    const formattedUpcomingPayments = upcomingPayments.map(payment => ({
      id: payment._id,
      patient: payment.appointment?.patient?.fullName || "Unknown",
      date: payment.scheduledDate.toISOString().split('T')[0],
      amount: payment.amount,
      status: 'Pending'
    }));

    res.status(200).json({
      history: formattedHistory,
      today: todayTransactions,
      upcoming: formattedUpcomingPayments
    });
  } catch (error) {
    console.error("Error fetching all transaction data:", error);
    res.status(500).json({ message: "Error fetching all transaction data" });
  }
}

const getWeekAndMonthEarning = async (req, res) => {
  try {
    const doctorId = req.user.id;
    
    if (!doctorId) {
      return res.status(400).json({ message: "Doctor ID is required" });
    }

    // Convert string ID to ObjectId if needed
    const doctorObjectId = mongoose.Types.ObjectId.isValid(doctorId) 
      ? new mongoose.Types.ObjectId(doctorId) 
      : doctorId;

    // Get date ranges for calculations
    const now = new Date();
    
    // Current week (last 7 days)
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(now.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    
    // Last week (14 days ago to 7 days ago)
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(now.getDate() - 14);
    twoWeeksAgo.setHours(0, 0, 0, 0);
    
    // Six months ago
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    // 1. Get current week earnings (last 7 days)
    const currentWeekEarnings = await Transaction.aggregate([
      {
        $match: {
          user: doctorObjectId,
          type: "doctor_credit",
          status: "completed",
          createdAt: { $gte: oneWeekAgo, $lte: now }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          amount: { $sum: "$amount" }
        }
      }
    ]);

    // 2. Get last week earnings (14 days ago to 7 days ago)
    const lastWeekEarnings = await Transaction.aggregate([
      {
        $match: {
          user: doctorObjectId,
          type: "doctor_credit",
          status: "completed",
          createdAt: { $gte: twoWeeksAgo, $lt: oneWeekAgo }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: "$createdAt" },
          amount: { $sum: "$amount" }
        }
      }
    ]);

    // Format weekly earnings data (MongoDB dayOfWeek: 1=Sunday, 7=Saturday)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyEarningsChart = days.map((day, index) => {
      const dayOfWeek = index + 1; // Convert to MongoDB dayOfWeek format
      const currentDay = currentWeekEarnings.find(d => d._id === dayOfWeek);
      const lastWeekDay = lastWeekEarnings.find(d => d._id === dayOfWeek);
      
      return {
        day,
        amount: currentDay ? parseFloat(currentDay.amount.toFixed(2)) : 0,
        lastWeek: lastWeekDay ? parseFloat(lastWeekDay.amount.toFixed(2)) : 0
      };
    });

    // 3. Get payment flow data (last 6 months) - Fixed to include both online and offline
    const paymentFlowData = await Transaction.aggregate([
      {
        $match: {
          user: doctorObjectId,
          type: { $in: ["doctor_credit", "appointment_payment"] }, // Include both types
          status: "completed",
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" },
            type: "$type"
          },
          amount: { $sum: "$amount" }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Format payment flow data for last 6 months
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const paymentFlowMap = new Map();

    // Initialize last 6 months with zero values
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = monthNames[date.getMonth()];
      paymentFlowMap.set(monthKey, { 
        month: monthName, 
        year: date.getFullYear(),
        online: 0, 
        offline: 0 
      });
    }

    // Populate with actual data
    paymentFlowData.forEach(item => {
      const monthKey = `${item._id.year}-${String(item._id.month).padStart(2, '0')}`;
      const type = item._id.type === "doctor_credit" ? "online" : "offline";
      
      if (paymentFlowMap.has(monthKey)) {
        paymentFlowMap.get(monthKey)[type] += parseFloat(item.amount.toFixed(2));
      }
    });

    const paymentFlow = Array.from(paymentFlowMap.values())
      .map(item => ({
        month: item.month,
        online: parseFloat(item.online.toFixed(2)),
        offline: parseFloat(item.offline.toFixed(2))
      }));

    // 4. Get additional stats
    const [totalEarningsResult, pendingWithdrawalsResult] = await Promise.all([
      Transaction.aggregate([
        {
          $match: {
            user: doctorObjectId,
            type: "doctor_credit",
            status: "completed"
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" }
          }
        }
      ]),
      Transaction.aggregate([
        {
          $match: {
            user: doctorObjectId,
            type: "withdrawal_request",
            status: "pending"
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" }
          }
        }
      ])
    ]);

    const totalEarnings = totalEarningsResult[0]?.total || 0;
    const pendingWithdrawals = pendingWithdrawalsResult[0]?.total || 0;
    const availableBalance = totalEarnings - pendingWithdrawals;

    // Format response
    const response = {
      weeklyEarningsChart,
      paymentFlow,
      stats: {
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        pendingWithdrawals: parseFloat(pendingWithdrawals.toFixed(2)),
        availableBalance: parseFloat(availableBalance.toFixed(2))
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching dashboard transactions:", error);
    
    // Send more specific error information in development
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Error fetching dashboard transactions: ${error.message}`
      : "Error fetching dashboard transactions";
      
    res.status(500).json({ 
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
};

/**
 * Get payment dashboard data for a specific user (patient)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getPaymentDashboard = async (req, res) => {
  try {
    const userId = req.user.id; // or get from req.user if using auth middleware
    const { page = 1, limit = 10 } = req.query;

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // 1. Get summary data
    const summaryAggregation = await Payment.aggregate([
      {
        $match: { patient: new mongoose.Types.ObjectId(userId) }
      },
      {
        $group: {
          _id: null,
          totalSpent: {
            $sum: {
              $cond: [
                { $in: ["$status", ["captured", "refunded", "partially_refunded"]] },
                "$totalamount",
                0
              ]
            }
          },
          totalTransactions: { $sum: 1 },
          pendingRefunds: {
            $sum: {
              $cond: [
                { $eq: ["$refund.status", "pending"] },
                "$refund.amount",
                0
              ]
            }
          },
          successfulPayments: {
            $sum: {
              $cond: [
                { $eq: ["$status", "captured"] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const summary = summaryAggregation[0] || {
      totalSpent: 0,
      totalTransactions: 0,
      pendingRefunds: 0,
      successfulPayments: 0
    };

    // 2. Get recent payments with doctor and appointment details
    const recentPayments = await Payment.find({ patient: userId })
      .populate({
        path: 'doctor',
        select: 'fullName'
      })
      .populate({
        path: 'appointment',
        select: 'date appointmentType'
      })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // 3. Get recent transactions
    const recentTransactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    // 4. Format the response data
    const formattedPayments = recentPayments.map(payment => ({
      id: payment._id.toString(),
      appointmentId: payment.appointment?._id?.toString() || null,
      doctorName: payment.doctor?.fullName || 'Unknown Doctor',
      amount: payment.amount || 0,
      gstAmount: payment.gstamount || 0,
      totalAmount: payment.totalamount || payment.amount || 0,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      gateway: {
        name: payment.gateway?.name || null,
        transactionId: payment.gateway?.transactionId || null,
        referenceId: payment.gateway?.referenceId || null
      },
      appointmentDate: payment.appointment?.date || null,
      appointmentType: payment.appointment?.appointmentType || null,
      createdAt: payment.createdAt,
      refund: payment.refund ? {
        amount: payment.refund.amount,
        reason: payment.refund.reason,
        initiatedBy: payment.refund.initiatedBy,
        status: payment.refund.status
      } : null
    }));

    const formattedTransactions = recentTransactions.map(transaction => ({
      id: transaction._id.toString(),
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      referenceId: transaction.referenceId?.toString() || null,
      referenceType: transaction.referenceType,
      notes: transaction.notes,
      createdAt: transaction.createdAt
    }));

    // 5. Return formatted response
    return res.status(200).json({
      success: true,
      data: {
        summary: {
          totalSpent: summary.totalSpent || 0,
          totalTransactions: summary.totalTransactions || 0,
          pendingRefunds: summary.pendingRefunds || 0,
          successfulPayments: summary.successfulPayments || 0
        },
        recentPayments: formattedPayments,
        transactions: formattedTransactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(summary.totalTransactions / limit),
          hasNextPage: skip + formattedPayments.length < summary.totalTransactions,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Error fetching payment dashboard data:', error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransactionStatus,
  getTransactionStats,
  getAllTransactions,
  getWeekAndMonthEarning,
  getPaymentDashboard
};