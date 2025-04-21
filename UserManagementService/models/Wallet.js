
// Wallet.js
const mongoose = require("mongoose");
const Transaction = require("./Transaction");

const WalletSchema = new mongoose.Schema({
    doctor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Doctor",
        required: true,
        unique: true
    },
    current_balance: {
        type: Number,
        default: 0
    },
    total_earned: {
        type: Number,
        default: 0
    },
    total_withdrawn: {
        type: Number,
        default: 0
    },
    total_spent: {
        type: Number,
        default: 0
    },
    commission_rate: {
        type: Number,
        default: 20 // Default commission rate of 20%
    },
    last_payment_date: Date,
    last_withdrawal_date: Date
}, {
    timestamps: true
});

// Add method to update wallet balance
WalletSchema.methods.addFunds = async function(amount, source, description, referenceId, session = null) {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }

    // Update wallet balance
    this.current_balance += amount;
    this.total_earned += amount;
    this.last_payment_date = new Date();
    
    const options = session ? { session } : {};
    await this.save(options);
    
    // Create a transaction record
    await Transaction.createTransaction({
        user: this.doctor,
        type: "doctor_credit",
        amount: amount,
        referenceId: referenceId,
        referenceType: source === 'appointment' ? "Appointment" : "Payment",
        status: "completed",
        notes: description
    }, options);

    return this;
};

// Add method to withdraw funds
WalletSchema.methods.requestWithdrawal = async function(amount, description) {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }
    
    if (amount > this.current_balance) {
        throw new Error('Insufficient balance');
    }

    // Create withdrawal transaction (pending status)
    const transaction = await Transaction.createTransaction({
        user: this.doctor,
        type: "withdrawal_request",
        amount: amount,
        referenceType: "Withdrawal",
        status: "pending",
        notes: description || "Withdrawal request"
    });

    return transaction;
};

// Method to process approved withdrawal
WalletSchema.methods.processWithdrawal = async function(transactionId, adminNotes) {
    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction || transaction.type !== "withdrawal_request" || transaction.status !== "pending") {
        throw new Error('Invalid or already processed withdrawal transaction');
    }
    
    // Check balance again at time of processing
    if (transaction.amount > this.current_balance) {
        transaction.status = "failed";
        transaction.notes += " | Failed: Insufficient balance";
        await transaction.save();
        throw new Error('Insufficient balance');
    }
    
    // Update wallet
    this.current_balance -= transaction.amount;
    this.total_withdrawn += transaction.amount;
    this.last_withdrawal_date = new Date();
    await this.save();
    
    // Update transaction status
    transaction.status = "completed";
    transaction.notes += adminNotes ? ` | ${adminNotes}` : " | Processed successfully";
    await transaction.save();
    
    // Create a processed transaction record
    await Transaction.createTransaction({
        user: this.doctor,
        type: "withdrawal_processed",
        amount: transaction.amount,
        referenceId: transaction._id,
        referenceType: "Withdrawal",
        status: "completed",
        notes: `Withdrawal processed. Reference: ${transaction._id}`
    });
    
    return transaction;
};

module.exports = mongoose.model("Wallet", WalletSchema);