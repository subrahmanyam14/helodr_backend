const Withdrawal = require("../models/Withdrawal");
const Transaction = require("../models/Transaction");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const Wallet = require("../models/Wallet");
const mongoose = require("mongoose");

// Doctor initiates withdrawal
exports.initiateWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionIds, paymentMethod, hospital, notes } = req.body;
    const doctorId = req.user.doctorId;

    if (!doctorId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "User is not associated with a doctor"
      });
    }

    // Validate transaction IDs belong to the doctor
    const transactions = await Transaction.find({
      _id: { $in: transactionIds },
      user: req.user._id,
      type: "doctor_credit",
      status: "completed"
    }).session(session);

    if (transactions.length !== transactionIds.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Some transactions are invalid or already withdrawn"
      });
    }

    // Calculate total amount
    const totalAmount = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);

    if (totalAmount < 100) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Minimum withdrawal amount is ₹100"
      });
    }

    // Create withdrawal request
    const withdrawal = new Withdrawal({
      doctor: doctorId,
      hospital,
      amount: totalAmount,
      transactionIds,
      paymentMethod,
      notes,
      status: "pending"
    });

    await withdrawal.save({ session });

    // Create transaction record for the withdrawal
    const withdrawalTransaction = await Transaction.createTransaction({
      user: req.user._id,
      type: "withdrawal_request",
      amount: totalAmount,
      referenceId: withdrawal._id,
      referenceType: "Withdrawal",
      status: "pending",
      metadata: {
        transactionIds,
        paymentMethod,
        hospital
      }
    });

    withdrawal.transaction = withdrawalTransaction._id;
    await withdrawal.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Withdrawal request submitted successfully",
      data: withdrawal
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("Withdrawal initiation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initiate withdrawal",
      error: error.message
    });
  }
};

// Get doctor's withdrawal history
exports.getDoctorWithdrawals = async (req, res) => {
  try {
    const doctorId = req.user.doctorId;
    const { page = 1, limit = 10, status } = req.query;

    const query = { doctor: doctorId };
    if (status) query.status = status;

    const withdrawals = await Withdrawal.find(query)
      .populate("hospital", "name")
      .populate("transactionIds", "amount createdAt")
      .populate("approvedBy", "fullName")
      .populate("verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Withdrawal.countDocuments(query);

    res.json({
      success: true,
      data: withdrawals,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error("Get withdrawals error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawals",
      error: error.message
    });
  }
};

// Admin approves withdrawal
exports.approveWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawalId } = req.params;
    const { notes } = req.body;

    const withdrawal = await Withdrawal.findById(withdrawalId).session(session);

    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found"
      });
    }

    if (withdrawal.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Withdrawal request is not in pending status"
      });
    }

    withdrawal.status = "admin_approved";
    withdrawal.approvedBy = req.user._id;
    withdrawal.approvedAt = new Date();
    withdrawal.notes = notes || withdrawal.notes;

    await withdrawal.save({ session });

    // Update transaction status
    await Transaction.findByIdAndUpdate(
      withdrawal.transaction,
      { status: "processing" },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Withdrawal approved successfully",
      data: withdrawal
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("Approve withdrawal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to approve withdrawal",
      error: error.message
    });
  }
};

// Admin rejects withdrawal
exports.rejectWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawalId } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required"
      });
    }

    const withdrawal = await Withdrawal.findById(withdrawalId).session(session);

    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found"
      });
    }

    if (withdrawal.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Withdrawal request cannot be rejected in current status"
      });
    }

    withdrawal.status = "rejected";
    withdrawal.rejectionReason = rejectionReason;
    withdrawal.approvedBy = req.user._id;
    withdrawal.approvedAt = new Date();

    await withdrawal.save({ session });

    // Update transaction status
    await Transaction.findByIdAndUpdate(
      withdrawal.transaction,
      { status: "failed", notes: `Rejected: ${rejectionReason}` },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Withdrawal rejected successfully",
      data: withdrawal
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("Reject withdrawal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reject withdrawal",
      error: error.message
    });
  }
};

// Admin records hospital transfer
exports.recordHospitalTransfer = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawalId } = req.params;
    const { paymentReference, paymentProof, notes } = req.body;

    const withdrawal = await Withdrawal.findById(withdrawalId)
      .populate('doctor')
      .session(session);

    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found"
      });
    }

    if (withdrawal.status !== "admin_approved") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Withdrawal must be approved by admin first"
      });
    }

    // Get the doctor's wallet
    const wallet = await Wallet.findOne({ doctor: withdrawal.doctor._id }).session(session);
    
    if (!wallet) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Doctor wallet not found"
      });
    }

    // Check if wallet has sufficient balance
    if (wallet.current_balance < withdrawal.amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Insufficient wallet balance for withdrawal"
      });
    }

    // Deduct the amount from doctor's wallet
    wallet.current_balance -= withdrawal.amount;
    wallet.total_withdrawn += withdrawal.amount;
    wallet.last_withdrawal_date = new Date();
    await wallet.save({ session });

    // Update withdrawal status and admin transfer details
    withdrawal.status = "hospital_payment_completed";
    withdrawal.adminToHospital = {
      paymentReference,
      paymentProof,
      transferredAt: new Date(),
      notes
    };

    // Create transaction record for the deduction
    const deductionTransaction = await Transaction.createTransaction({
      user: withdrawal.doctor.user, // Assuming doctor has a user reference
      type: "withdrawal_processed",
      amount: -withdrawal.amount, // Negative amount for deduction
      referenceId: withdrawal._id,
      referenceType: "Withdrawal",
      status: "completed",
      metadata: {
        recipient: "hospital",
        paymentReference,
        hospital: withdrawal.hospital,
        withdrawalType: "wallet_deduction"
      }
    }, { session });

    withdrawal.adminTransferTransaction = deductionTransaction._id;
    await withdrawal.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Hospital transfer recorded and wallet amount deducted successfully",
      data: {
        withdrawal,
        newBalance: wallet.current_balance,
        deductedAmount: withdrawal.amount
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("Record hospital transfer error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record hospital transfer",
      error: error.message
    });
  }
};

// Hospital admin generates OTP for doctor payment
exports.generateDoctorOTP = async (req, res) => {
  try {
    const { withdrawalId } = req.params;

    const withdrawal = await Withdrawal.findById(withdrawalId);

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found"
      });
    }

    // Check if hospital admin has access to this hospital
    if (withdrawal.hospital.toString() !== req.user.hospitalId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this withdrawal"
      });
    }

    if (withdrawal.status !== "hospital_payment_completed") {
      return res.status(400).json({
        success: false,
        message: "Withdrawal must have hospital payment completed first"
      });
    }

    const otp = withdrawal.generateDoctorOTP();
    await withdrawal.save();

    // In production, send OTP via SMS/Email to doctor
    console.log(`OTP for withdrawal ${withdrawalId}: ${otp}`);

    res.json({
      success: true,
      message: "OTP generated successfully",
      data: {
        withdrawalId: withdrawal._id,
        expiresAt: withdrawal.hospitalToDoctor.otp.expiresAt
      }
    });

  } catch (error) {
    console.error("Generate OTP error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate OTP",
      error: error.message
    });
  }
};

// Hospital admin records doctor payment with OTP verification
exports.recordDoctorPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawalId } = req.params;
    const { otp, paymentReference, paymentProof, notes } = req.body;
    if (!otp || !paymentReference || !paymentProof ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "OTP and payment reference are required"
      });
    }

    const withdrawal = await Withdrawal.findById(withdrawalId).session(session);

    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found"
      });
    }

    // Check hospital admin access
    if (withdrawal.hospital.toString() !== req.user.hospitalId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: "Access denied to this withdrawal"
      });
    }

    if (withdrawal.status !== "hospital_payment_completed") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal status for payment"
      });
    }

    // Verify OTP
    const otpVerification = withdrawal.verifyDoctorOTP(otp);
    if (!otpVerification.success) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: otpVerification.message
      });
    }

    // Record payment to doctor
    withdrawal.status = "doctor_otp_verified";
    withdrawal.hospitalToDoctor.paymentReference = paymentReference;
    withdrawal.hospitalToDoctor.paymentProof = paymentProof;
    withdrawal.hospitalToDoctor.settledAt = new Date();
    withdrawal.hospitalToDoctor.settledBy = req.user._id;
    withdrawal.hospitalToDoctor.notes = notes;

    await withdrawal.save({ session });

    // Update main withdrawal transaction
    await Transaction.findByIdAndUpdate(
      withdrawal.transaction,
      { status: "completed" },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Doctor payment recorded successfully",
      data: withdrawal
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("Record doctor payment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to record doctor payment",
      error: error.message
    });
  }
};

// Doctor verifies receipt from hospital
exports.verifyDoctorReceipt = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { withdrawalId } = req.params;

    const withdrawal = await Withdrawal.findById(withdrawalId).session(session);

    if (!withdrawal) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found"
      });
    }

    // Check doctor access
    if (withdrawal.doctor.toString() !== req.user.doctorId.toString()) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        success: false,
        message: "Access denied to this withdrawal"
      });
    }

    if (withdrawal.status !== "doctor_otp_verified") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Withdrawal must have OTP verified first"
      });
    }

    withdrawal.status = "completed";
    withdrawal.verifiedBy = req.user._id;
    withdrawal.verifiedAt = new Date();

    await withdrawal.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Payment receipt verified successfully",
      data: withdrawal
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    
    console.error("Verify receipt error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify receipt",
      error: error.message
    });
  }
};

// Get all withdrawals for admin
exports.getAllWithdrawals = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, hospital, doctor } = req.query;

    const query = {};
    if (status) query.status = status;
    if (hospital) query.hospital = hospital;
    if (doctor) query.doctor = doctor;

    const withdrawals = await Withdrawal.find(query)
      .populate("doctor", "fullName registrationNumber")
      .populate("hospital", "name")
      .populate("transactionIds", "amount createdAt")
      .populate("approvedBy", "fullName")
      .populate("verifiedBy", "fullName")
      .populate("hospitalToDoctor.settledBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Withdrawal.countDocuments(query);

    res.json({
      success: true,
      data: withdrawals,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error("Get all withdrawals error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawals",
      error: error.message
    });
  }
};

// Get hospital's withdrawal requests
exports.getHospitalWithdrawals = async (req, res) => {
  try {
    const hospitalId = req.user.hospitalId;
    const { page = 1, limit = 10, status } = req.query;

    const query = { hospital: hospitalId };
    if (status) query.status = status;

    const withdrawals = await Withdrawal.find(query)
      .populate("doctor", "fullName registrationNumber")
      .populate("transactionIds", "amount createdAt")
      .populate("approvedBy", "fullName")
      .populate("verifiedBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Withdrawal.countDocuments(query);

    res.json({
      success: true,
      data: withdrawals,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });

  } catch (error) {
    console.error("Get hospital withdrawals error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch hospital withdrawals",
      error: error.message
    });
  }
};