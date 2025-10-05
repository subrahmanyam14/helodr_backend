const LoginStatus = require('../models/LoginStatus');
const HealthRecords = require('../models/HealthRecords');
const axios = require('axios');
const FormData = require('form-data');
const dotenv = require('dotenv');
dotenv.config();

const transportStorageServiceUrl = process.env.TRANSPORT_STORAGE_SERVICE_URL;

exports.getLoginStatus = async (req, res) => {
    try {
        console.log("req.user", req.user);
        const loginStatus = await LoginStatus.findOne({ user_id: req.user.id });
        res.status(200).json({
            success: true,
            message: "Login status fetched successfully",
            data: loginStatus
        });
    } catch (error) {
        console.log("error in getLoginStatus", error);
        res.status(500).json({
            success: false,
            message: "Error in getLoginStatus",
            error: error.message
        });
    }
};

exports.getHealthRecords = async (req, res) => {
    try {
        const healthRecords = await HealthRecords.find({ user_id: req.user.id });
        res.status(200).json({
            success: true,
            message: "Health records fetched successfully",
            data: healthRecords
        });
    } catch (error) {
        console.log("error in getHealthRecords", error);
        res.status(500).json({
            success: false,
            message: "Error in getHealthRecords",
            error: error.message
        });
    }
};


exports.uploadHealthRecord = async (req, res) => {
    try {
        const { record_type, description, file_urls } = req.body;

        // Validate required fields
        if (!record_type) {
            return res.status(400).json({
                success: false,
                message: "Record type is required"
            });
        }

        // Create and save health record
        const healthRecord = new HealthRecords({
            user_id: req.user.id,
            record_type,
            description,
            file_urls,
            date: new Date()
        });

        await healthRecord.save();

        res.status(201).json({
            success: true,
            message: "Health record uploaded successfully",
            data: healthRecord
        });
    } catch (error) {
        console.error("Error in uploadHealthRecord:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};


exports.deleteHealthRecord = async (req, res) => {
    try {
        const { record_id } = req.params;
        const healthRecord = await HealthRecords.findByIdAndDelete(record_id);
        if (!healthRecord) {
            return res.status(404).json({
                success: false,
                message: "Health record not found"
            });
        }
        res.status(200).json({
            success: true,
            message: "Health record deleted successfully"
        });
    } catch (error) {
        console.log("error in deleteHealthRecord", error);
        res.status(500).json({
            success: false,
            message: "Error in deleteHealthRecord",
            error: error.message
        });
    }
}

exports.updateHealthRecord = async (req, res) => {
    try {
        const { record_id } = req.params;
        const { record_type, description, file_urls } = req.body;
        // ✅ **Check if files exist before processing**
        //     let healthRecordUrl = null;
        // if (req.file && req.file.healthRecord ) {
        //     try {
        //       const formData = new FormData();

        //       // 🟢 **Check if profilePhoto is a single file**
        //       if (req.file.healthRecord) {
        //         const healthRecordFile = Array.isArray(req.file.healthRecord)
        //           ? req.file.healthRecord[0]
        //           : req.file.healthRecord; // Ensure it's an object

        //         formData.append('file', healthRecordFile.data, healthRecordFile.name);
        //       }

        //       // 🟢 **Upload files to Storage Service**
        //       const uploadResponse = await axios.post(
        //         `${transportStorageServiceUrl}/storage/upload`,
        //         formData,
        //         { headers: { ...formData.getHeaders(), 'Authorization': `Bearer ${req.token}` } }
        //       );

        //       if (uploadResponse.data.url) {
        //         healthRecordUrl = uploadResponse.data.url;
        //       }
        //     } catch (error) {
        //       console.error('File upload error:', error);
        //       return res.status(500).json({
        //         success: false,
        //         message: 'File upload failed',
        //         error: error.response ? error.response.data : error.message
        //       });
        //     }
        //   }
        const healthRecord = await HealthRecords.findByIdAndUpdate(record_id, { record_type, description, file_urls }, { new: true });
        if (!healthRecord) {
            return res.status(404).json({
                success: false,
                message: "Health record not found"
            });
        }
        res.status(200).json({
            success: true,
            message: "Health record updated successfully",
            data: healthRecord
        });
    } catch (error) {
        console.log("error in updateHealthRecord", error);
        res.status(500).json({
            success: false,
            message: "Error in updateHealthRecord",
            error: error.message
        });
    }
}


