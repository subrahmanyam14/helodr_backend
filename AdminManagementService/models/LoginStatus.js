const mongoose = require('mongoose');
const Schema = mongoose.Schema; 

const accountLoginStatsSchema = new Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User' 
    },
    last_login: { 
        type: Date 
    },
    ip_address: { 
        type: String
     },
    device: { 
        type: String 
    },
    account_status: { 
        type: String, 
        enum: ['active', 'inactive', 'suspended', 'banned'] 
    }
  }, { timestamps: true });
  
  module.exports = mongoose.model('AccountLoginStat', accountLoginStatsSchema);