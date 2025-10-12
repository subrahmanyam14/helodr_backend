const Transaction = require("../models/Transaction");

// Get doctor's wallet balance and transactions
exports.getWalletBalance = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    // Calculate current balance
    const creditTransactions = await Transaction.aggregate([
      {
        $match: {
          user: userId,
          type: "doctor_credit",
          status: "completed"
        }
      },
      {
        $group: {
          _id: null,
          totalCredits: { $sum: "$amount" }
        }
      }
    ]);

    const withdrawalTransactions = await Transaction.aggregate([
      {
        $match: {
          user: userId,
          type: { $in: ["withdrawal_request", "withdrawal_processed"] },
          status: { $in: ["completed", "processing"] }
        }
      },
      {
        $group: {
          _id: null,
          totalWithdrawals: { $sum: "$amount" }
        }
      }
    ]);

    const totalCredits = creditTransactions[0]?.totalCredits || 0;
    const totalWithdrawals = withdrawalTransactions[0]?.totalWithdrawals || 0;
    const availableBalance = totalCredits - totalWithdrawals;

    // Get transaction history
    const transactions = await Transaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select("-metadata");

    const total = await Transaction.countDocuments({ user: userId });

    res.json({
      success: true,
      data: {
        balance: {
          totalCredits,
          totalWithdrawals,
          availableBalance
        },
        transactions,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error("Get wallet balance error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch wallet balance",
      error: error.message
    });
  }
};

// Get available transactions for withdrawal
exports.getAvailableTransactions = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find completed credit transactions that haven't been withdrawn
    const withdrawnTransactionIds = await Withdrawal.aggregate([
      {
        $match: {
          doctor: req.user.doctorId,
          status: { $nin: ["rejected", "pending"] }
        }
      },
      {
        $unwind: "$transactionIds"
      },
      {
        $group: {
          _id: null,
          transactionIds: { $addToSet: "$transactionIds" }
        }
      }
    ]);

    const excludedIds = withdrawnTransactionIds[0]?.transactionIds || [];

    const availableTransactions = await Transaction.find({
      user: userId,
      type: "doctor_credit",
      status: "completed",
      _id: { $nin: excludedIds }
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: availableTransactions
    });

  } catch (error) {
    console.error("Get available transactions error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch available transactions",
      error: error.message
    });
  }
};