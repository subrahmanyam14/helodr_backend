const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");

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




module.exports = {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransactionStatus,
  getTransactionStats
};