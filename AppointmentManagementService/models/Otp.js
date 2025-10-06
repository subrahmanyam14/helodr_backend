const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const otpSchema = new Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    otp_code: {
        type: String,
    },
    expires_at: {
        type: Date
    },
}, { timestamps: true });

module.exports = mongoose.model('Otp', otpSchema);