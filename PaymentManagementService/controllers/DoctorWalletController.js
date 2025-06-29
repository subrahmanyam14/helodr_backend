const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const UpcomingEarnings = require("../models/UpcomingEarnings");
const { default: mongoose } = require("mongoose");
const Payment = require("../models/Payment");

const getDoctorRevenue = async (req, res) => {
  try {
    const doctorId = req.user.doctorId; // Assuming JWT middleware attaches doctor info to req.user

    // Fetch doctor's wallet
    const wallet = await Wallet.findOne({ doctor: doctorId });
    if (!wallet) {
      return res.status(404).json({ message: "Wallet not found" });
    }

    // Total revenue till now
    const totalRevenue = wallet.total_earned;

    // Calculate revenue for last month
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    const lastMonthTransactions = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(doctorId),
          type: "doctor_credit",
          status: "completed",
          createdAt: { $gte: oneMonthAgo }
        }
      },
      {
        $group: {
          _id: null,
          lastMonthRevenue: { $sum: "$amount" }
        }
      }
    ]);

    const lastMonthRevenue = lastMonthTransactions.length > 0
      ? lastMonthTransactions[0].lastMonthRevenue
      : 0;

    return res.status(200).json({
      totalRevenue,
      lastMonthRevenue
    });
  } catch (error) {
    console.error("Error fetching doctor revenue:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



const getWalletSummary = async (req, res) => {
  try {
    const doctorId = req.user.doctorId; // Adjust this if your auth structure differs

    if (!doctorId) {
      return res.status(400).json({ error: "Doctor ID is required" });
    }

    // Get wallet
    const wallet = await Wallet.findOne({ doctor: doctorId });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // Calculate today's collection
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayCollection = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(doctorId),
          type: "doctor_credit",
          status: "completed",
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" }
        }
      }
    ]);

    const dailyEarnings = todayCollection.length > 0 ? todayCollection[0].total : 0;

    res.status(200).json({
      success: true,
      data: {
        totalCoins: wallet.current_balance,
        dailyCollection: dailyEarnings
      }
    });

  } catch (error) {
    console.error("Error in getWalletSummary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};


const getFinancialSummary = async (req, res) => {
  try {
    const { doctorId } = req.user;

    if (!doctorId) {
      return res.status(400).json({ message: "Doctor ID is required" });
    }

    // 1. Get Wallet Balance (Account Balance)
    const wallet = await Wallet.findOne({ doctor: doctorId });
    const currentBalance = wallet ? wallet.current_balance : 0;

    // Calculate percentage change from last month (simplified example)
    // In a real app, you would compare with previous month's data
    const balancePercentageChange = 12.5; // This would be calculated from historical data

    // 2. Get Pending Payments (Upcoming Earnings)
    const pendingPayments = await UpcomingEarnings.find({
      doctor: doctorId,
      status: "pending"
    });

    const totalPendingAmount = pendingPayments.reduce(
      (sum, payment) => sum + payment.amount, 0
    );
    const pendingTransactionsCount = pendingPayments.length;

    // 3. Get Weekly Earnings (Transactions from the last week)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const weeklyTransactions = await Transaction.find({
      user: new mongoose.Types.ObjectId(doctorId),
      type: "doctor_credit",
      status: "completed",
      createdAt: { $gte: oneWeekAgo }
    });

    const weeklyEarnings = weeklyTransactions.reduce(
      (sum, transaction) => sum + transaction.amount, 0
    );

    // Calculate percentage change from last week (simplified example)
    const weeklyPercentageChange = 8.2; // This would be calculated from historical data

    // Prepare the response
    const financialSummary = {
      accountBalance: {
        amount: currentBalance,
        percentageChange: balancePercentageChange,
        trend: balancePercentageChange >= 0 ? "up" : "down"
      },
      pendingPayments: {
        amount: totalPendingAmount,
        transactionCount: pendingTransactionsCount
      },
      weeklyEarnings: {
        amount: weeklyEarnings,
        percentageChange: weeklyPercentageChange,
        trend: weeklyPercentageChange >= 0 ? "up" : "down"
      }
    };

    res.status(200).json(financialSummary);
  } catch (error) {
    console.error("Error fetching financial summary:", error);
    res.status(500).json({ message: "Error fetching financial summary" });
  }
}

const getFinancialData = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Get current month boundaries
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    // Get last month boundaries for comparison
    const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // 1. Get Wallet Information
    const wallet = await Wallet.findOne({ doctor: doctorId });

    // 2. Get Today's Transactions
    const todaysTransactions = await Transaction.find({
      user: new mongoose.Types.ObjectId(req.user.id),
      createdAt: {
        $gte: startOfDay,
        $lt: endOfDay
      }
    })
      .sort({ createdAt: -1 })
      .limit(20);

    // 3. Get Recent Transactions (Last 10)
    const recentTransactions = await Transaction.find({
      user:new mongoose.Types.ObjectId(req.user.id)
    })
      .sort({ createdAt: -1 })
      .limit(10);

    // 4. Get Today's Analytics
    const todaysAnalytics = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
          createdAt: {
            $gte: startOfDay,
            $lt: endOfDay
          }
        }
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // 5. Get Monthly Analytics
    const monthlyAnalytics = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
          createdAt: {
            $gte: startOfMonth,
            $lt: endOfMonth
          }
        }
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // 6. Get Last Month Analytics for comparison
    const lastMonthAnalytics = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(req.user.id),
          createdAt: {
            $gte: startOfLastMonth,
            $lt: endOfLastMonth
          }
        }
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // 7. Get Upcoming Earnings
    const upcomingEarnings = await UpcomingEarnings.find({
      doctor: doctorId,
      status: "pending"
    })
      .populate('appointment')
      .populate('payment')
      .sort({ scheduledDate: 1 })
      .limit(10);

    // 8. Get Total Upcoming Earnings
    const totalUpcomingEarnings = await UpcomingEarnings.getTotalUpcomingEarnings(doctorId);

    // 9. Get Payment Statistics
    const paymentStats = await Payment.aggregate([
      {
        $match: {
          doctor: new mongoose.Types.ObjectId(req.user.id),
          createdAt: {
            $gte: startOfMonth,
            $lt: endOfMonth
          }
        }
      },
      {
        $group: {
          _id: "$status",
          total: { $sum: "$totalamount" },
          count: { $sum: 1 }
        }
      }
    ]);

    // 10. Calculate Growth Percentages
    const calculateGrowth = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return ((current - previous) / previous) * 100;
    };

    // Process analytics data
    const processAnalytics = (analytics) => {
      return analytics.reduce((acc, item) => {
        acc[item._id] = {
          total: item.total,
          count: item.count
        };
        return acc;
      }, {});
    };

    const todaysData = processAnalytics(todaysAnalytics);
    const monthlyData = processAnalytics(monthlyAnalytics);
    const lastMonthData = processAnalytics(lastMonthAnalytics);

    // 11. Calculate today's totals
    const todaysTotals = {
      totalEarnings: todaysData.doctor_credit?.total || 0,
      totalTransactions: todaysTransactions.length,
      totalWithdrawals: todaysData.withdrawal_processed?.total || 0,
      totalRefunds: todaysData.refund?.total || 0
    };

    // 12. Calculate monthly totals and growth
    const monthlyTotals = {
      totalEarnings: monthlyData.doctor_credit?.total || 0,
      totalWithdrawals: monthlyData.withdrawal_processed?.total || 0,
      totalRefunds: monthlyData.refund?.total || 0,
      totalTransactions: Object.values(monthlyData).reduce((sum, item) => sum + item.count, 0)
    };

    const lastMonthTotals = {
      totalEarnings: lastMonthData.doctor_credit?.total || 0,
      totalWithdrawals: lastMonthData.withdrawal_processed?.total || 0,
      totalRefunds: lastMonthData.refund?.total || 0,
      totalTransactions: Object.values(lastMonthData).reduce((sum, item) => sum + item.count, 0)
    };

    // 13. Calculate growth percentages
    const growthMetrics = {
      earningsGrowth: calculateGrowth(monthlyTotals.totalEarnings, lastMonthTotals.totalEarnings),
      transactionsGrowth: calculateGrowth(monthlyTotals.totalTransactions, lastMonthTotals.totalTransactions),
      withdrawalsGrowth: calculateGrowth(monthlyTotals.totalWithdrawals, lastMonthTotals.totalWithdrawals)
    };

    // 14. Get Weekly Earnings Chart Data (Last 7 days)
    const weeklyEarnings = await Transaction.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(doctorId),
          type: "doctor_credit",
          createdAt: {
            $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
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
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    // 15. Response structure
    const responseData = {
      success: true,
      data: {
        // Wallet Information
        wallet: {
          currentBalance: wallet?.current_balance || 0,
          totalEarned: wallet?.total_earned || 0,
          totalWithdrawn: wallet?.total_withdrawn || 0,
          totalSpent: wallet?.total_spent || 0,
          commissionRate: wallet?.commission_rate || 20,
          lastPaymentDate: wallet?.last_payment_date,
          lastWithdrawalDate: wallet?.last_withdrawal_date
        },

        // Today's Summary
        todaysSummary: {
          ...todaysTotals,
          date: today.toISOString().split('T')[0]
        },

        // Monthly Summary with Growth
        monthlySummary: {
          ...monthlyTotals,
          ...growthMetrics,
          month: today.toISOString().substr(0, 7)
        },

        // Today's Transactions
        todaysTransactions: todaysTransactions.map(transaction => ({
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          referenceType: transaction.referenceType,
          notes: transaction.notes,
          createdAt: transaction.createdAt,
          metadata: transaction.metadata
        })),

        // Recent Transactions
        recentTransactions: recentTransactions.map(transaction => ({
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          status: transaction.status,
          referenceType: transaction.referenceType,
          notes: transaction.notes,
          createdAt: transaction.createdAt,
          metadata: transaction.metadata
        })),

        // Upcoming Earnings
        upcomingEarnings: {
          total: totalUpcomingEarnings,
          items: upcomingEarnings.map(earning => ({
            id: earning._id,
            amount: earning.amount,
            scheduledDate: earning.scheduledDate,
            status: earning.status,
            appointmentId: earning.appointment?._id,
            paymentId: earning.payment?._id,
            notes: earning.notes,
            createdAt: earning.createdAt
          }))
        },

        // Payment Statistics
        paymentStatistics: paymentStats.reduce((acc, stat) => {
          acc[stat._id] = {
            total: stat.total,
            count: stat.count
          };
          return acc;
        }, {}),

        // Weekly Earnings Chart Data
        weeklyEarningsChart: weeklyEarnings,

        // Transaction Type Breakdown
        transactionBreakdown: {
          today: todaysData,
          thisMonth: monthlyData,
          lastMonth: lastMonthData
        }
      }
    };

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Error fetching financial data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch financial data",
      error: error.message
    });
  }
};

const getTransactionHistory =
  async (req, res) => {
    try {
      const { doctorId } = req.user;

      if (!doctorId) {
        return res.status(400).json({ message: "Doctor ID is required" });
      }

      // Get all successful credit transactions
      const transactions = await Transaction.find({
        user: new mongoose.Types.ObjectId(doctorId),
        type: "doctor_credit",
        status: "completed"
      }).sort({ createdAt: -1 }); // Most recent first

      res.status(200).json(transactions);
    } catch (error) {
      console.error("Error fetching transaction history:", error);
      res.status(500).json({ message: "Error fetching transaction history" });
    }
  }

module.exports = {
  getDoctorRevenue,
  getWalletSummary,
  getFinancialSummary,
  getFinancialData
};
