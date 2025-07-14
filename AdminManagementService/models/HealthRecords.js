const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const healthRecordSchema = new Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true, 
        ref: 'User' 
    },
    record_type: { 
        type: String, 
    },
    file_urls: { 
        type: [String]
     },
    date: {
        type: Date 
    },
    description: { 
        type: String, 
    }
}, { timestamps: true });

module.exports = mongoose.model('HealthRecord', healthRecordSchema);