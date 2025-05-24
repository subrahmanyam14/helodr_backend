const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const UpcomingEarnings = require("../models/UpcomingEarnings");

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
          user: doctorId,
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
          user: doctorId,
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
      user: doctorId,
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

const getTransactionHistory = 
async (req, res) => {
  try {
    const { doctorId } = req.user;

    if (!doctorId) {
      return res.status(400).json({ message: "Doctor ID is required" });
    }

    // Get all successful credit transactions
    const transactions = await Transaction.find({
      user: doctorId,
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
  getFinancialSummary
};
