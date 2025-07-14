const Doctor = require("../models/Doctor.js");

const getDoctorIdsByAdmin = async(adminId) => {
    try {
        const doctorIds = await Doctor.find({ "verifiedByAdmin.admin": adminId }).select("_id");
        return doctorIds;
    } catch (error) {
        console.log("Error in the getDoctorIdsByAdmin: ", error);
        return [];
    }
}

module.exports = { getDoctorIdsByAdmin }
