const Transaction = require("../models/Transaction");
const Withdrawal = require("../models/Withdrawal");
const mongoose = require("mongoose");

// Get all credited transactions for a specific doctor with balance tracking
exports.getDoctorCreditedTransactions = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const userId = req.user._id;
    const { page = 1, limit = 20, startDate, endDate } = req.query;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with a doctor"
      });
    }

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Get all completed credit transactions for the doctor
    const creditQuery = {
      user: userId,
      type: "doctor_credit",
      status: "completed",
      ...dateFilter
    };

    const creditedTransactions = await Transaction.find(creditQuery)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("referenceId", "appointmentDate patientName")
      .lean();

    const totalCredits = await Transaction.countDocuments(creditQuery);

    // Get all withdrawal transactions to identify withdrawn transaction IDs
    const withdrawalTransactions = await Withdrawal.find({
      doctor: doctorId,
      status: { $nin: ["rejected", "pending"] }
    }).select("transactionIds status");

    // Extract all withdrawn transaction IDs
    const withdrawnTransactionIds = [];
    withdrawalTransactions.forEach(withdrawal => {
      withdrawnTransactionIds.push(...withdrawal.transactionIds.map(id => id.toString()));
    });

    // Categorize transactions into credited (available) and withdrawn (balance)
    const creditedList = []; // Available for withdrawal
    const balanceList = [];  // Already withdrawn or processing

    creditedTransactions.forEach(transaction => {
      const transactionObj = {
        _id: transaction._id,
        amount: transaction.amount,
        createdAt: transaction.createdAt,
        referenceId: transaction.referenceId,
        type: transaction.type,
        status: transaction.status
      };

      if (withdrawnTransactionIds.includes(transaction._id.toString())) {
        // Find which withdrawal this transaction belongs to
        const withdrawal = withdrawalTransactions.find(w => 
          w.transactionIds.some(tid => tid.toString() === transaction._id.toString())
        );
        
        transactionObj.withdrawalStatus = withdrawal?.status;
        transactionObj.withdrawalDate = withdrawal?.createdAt;
        balanceList.push(transactionObj);
      } else {
        creditedList.push(transactionObj);
      }
    });

    // Calculate totals
    const totalCreditedAmount = creditedList.reduce((sum, t) => sum + t.amount, 0);
    const totalBalanceAmount = balanceList.reduce((sum, t) => sum + t.amount, 0);
    const totalAvailableBalance = totalCreditedAmount;

    // Get withdrawal statistics
    const withdrawalStats = await Withdrawal.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          status: { $nin: ["rejected"] }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          totalAvailableBalance,
          totalCreditedAmount,
          totalBalanceAmount,
          totalTransactions: totalCredits,
          creditedCount: creditedList.length,
          balanceCount: balanceList.length
        },
        withdrawalStats,
        transactions: {
          creditedList,    // Available for withdrawal
          balanceList      // Already in withdrawal process
        },
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(totalCredits / limit),
          total: totalCredits
        }
      }
    });

  } catch (error) {
    console.error("Get doctor credited transactions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctor transactions",
      error: error.message
    });
  }
};

// Get detailed transaction analysis for doctor
exports.getDoctorTransactionAnalysis = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const userId = req.user._id;
    const { period = "month" } = req.query; // day, week, month, year

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with a doctor"
      });
    }

    // Calculate date range based on period
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case "day":
        startDate.setDate(now.getDate() - 1);
        break;
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }

    // Get credited transactions in period
    const creditedTransactions = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: "doctor_credit",
          status: "completed",
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          transactions: { $push: "$$ROOT" }
        }
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 }
      }
    ]);

    // Get withdrawal statistics
    const withdrawalStats = await Withdrawal.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          averageAmount: { $avg: "$amount" }
        }
      }
    ]);

    // Get available vs withdrawn amounts
    const totalCredits = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          type: "doctor_credit",
          status: "completed"
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    const totalWithdrawn = await Withdrawal.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(doctorId),
          status: { $in: ["completed", "doctor_otp_verified", "hospital_payment_completed"] }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    const totalCreditsAmount = totalCredits[0]?.totalAmount || 0;
    const totalWithdrawnAmount = totalWithdrawn[0]?.totalAmount || 0;
    const availableBalance = totalCreditsAmount - totalWithdrawnAmount;

    res.json({
      success: true,
      data: {
        periodAnalysis: {
          period,
          startDate,
          endDate: now,
          creditedTransactions,
          totalTransactions: creditedTransactions.reduce((sum, item) => sum + item.count, 0),
          totalAmount: creditedTransactions.reduce((sum, item) => sum + item.totalAmount, 0)
        },
        balanceSummary: {
          totalCredits: totalCreditsAmount,
          totalWithdrawn: totalWithdrawnAmount,
          availableBalance,
          withdrawalRate: totalCreditsAmount > 0 ? (totalWithdrawnAmount / totalCreditsAmount * 100).toFixed(2) : 0
        },
        withdrawalStats,
        recentActivity: {
          lastWithdrawal: await Withdrawal.findOne({ doctor: doctorId })
            .sort({ createdAt: -1 })
            .populate("hospital", "name"),
          pendingWithdrawals: await Withdrawal.countDocuments({
            doctor: doctorId,
            status: { $in: ["pending", "admin_approved", "hospital_payment_completed"] }
          })
        }
      }
    });

  } catch (error) {
    console.error("Get doctor transaction analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction analysis",
      error: error.message
    });
  }
};

// Get transactions available for withdrawal
exports.getAvailableForWithdrawal = async (req, res) => {
  try {
    const userId = req.user._id;
    const doctorId = req.user.doctorId;
    const { minAmount = 0 } = req.query;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with a doctor"
      });
    }

    // Get all completed credit transactions
    const allCredits = await Transaction.find({
      user: userId,
      type: "doctor_credit",
      status: "completed"
    }).sort({ createdAt: -1 });

    // Get all withdrawn transaction IDs
    const withdrawnTransactions = await Withdrawal.find({
      doctor: doctorId,
      status: { $nin: ["rejected"] }
    }).select("transactionIds");

    const withdrawnTransactionIds = new Set();
    withdrawnTransactions.forEach(withdrawal => {
      withdrawal.transactionIds.forEach(tid => {
        withdrawnTransactionIds.add(tid.toString());
      });
    });

    // Filter available transactions (not in any withdrawal)
    const availableTransactions = allCredits.filter(transaction => 
      !withdrawnTransactionIds.has(transaction._id.toString())
    );

    // Filter by minimum amount if specified
    const filteredTransactions = minAmount > 0 
      ? availableTransactions.filter(t => t.amount >= minAmount)
      : availableTransactions;

    const totalAvailableAmount = filteredTransactions.reduce((sum, t) => sum + t.amount, 0);

    res.json({
      success: true,
      data: {
        availableTransactions: filteredTransactions,
        summary: {
          totalTransactions: filteredTransactions.length,
          totalAmount: totalAvailableAmount,
          meetsMinimum: totalAvailableAmount >= 100 // ₹100 minimum
        },
        filters: {
          minAmount: parseInt(minAmount)
        }
      }
    });

  } catch (error) {
    console.error("Get available for withdrawal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch available transactions",
      error: error.message
    });
  }
};

// Get transaction history with withdrawal status
exports.getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const doctorId = req.user.doctorId;
    const { page = 1, limit = 25, type, status } = req.query;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with a doctor"
      });
    }

    // Build query
    const query = { user: userId };
    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("referenceId", "appointmentDate patientName serviceType")
      .lean();

    const total = await Transaction.countDocuments(query);

    // Get withdrawal information for credit transactions
    const creditTransactionIds = transactions
      .filter(t => t.type === "doctor_credit")
      .map(t => t._id);

    if (creditTransactionIds.length > 0) {
      const withdrawals = await Withdrawal.find({
        transactionIds: { $in: creditTransactionIds }
      }).select("transactionIds status amount createdAt");

      // Map withdrawal info to transactions
      transactions.forEach(transaction => {
        if (transaction.type === "doctor_credit") {
          const withdrawal = withdrawals.find(w => 
            w.transactionIds.some(tid => tid.toString() === transaction._id.toString())
          );
          
          if (withdrawal) {
            transaction.withdrawalInfo = {
              status: withdrawal.status,
              withdrawalAmount: withdrawal.amount,
              withdrawalDate: withdrawal.createdAt,
              withdrawalId: withdrawal._id
            };
          }
        }
      });
    }

    // Calculate statistics
    const statistics = await Transaction.aggregate([
      {
        $match: { user: new mongoose.Types.ObjectId(userId) }
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          averageAmount: { $avg: "$amount" }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        statistics,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error("Get transaction history error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transaction history",
      error: error.message
    });
  }
};