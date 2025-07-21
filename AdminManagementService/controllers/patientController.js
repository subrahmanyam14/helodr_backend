const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const { getDoctorIdsByAdmin } = require("../utils/doctorIds");

const getPatientList = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            searchQuery = '',
            sortBy = 'Most Cancelled Appointments',
            hospitalFilter = 'All Hospitals',
            doctorFilter = 'All Doctors',
            appointmentStatus = 'All Statuses'
        } = req.query;

        // Get doctor IDs from admin
        const doctorIds = await getDoctorIdsByAdmin(req.user.id);

        if (!doctorIds || !Array.isArray(doctorIds)) {
            return res.status(400).json({
                success: false,
                message: "Doctor IDs are required"
            });
        }

        // Convert to ObjectIds
        const doctorObjectIds = doctorIds.map(id => new mongoose.Types.ObjectId(id));

        // Build match conditions for appointments
        const appointmentMatch = {
            doctor: { $in: doctorObjectIds }
        };

        // Add appointment status filter if specified
        if (appointmentStatus !== 'All Statuses') {
            appointmentMatch.status = appointmentStatus.toLowerCase();
        }

        // Build aggregation pipeline
        const pipeline = [
            {
                $match: appointmentMatch
            },
            {
                $lookup: {
                    from: "users",
                    localField: "patient",
                    foreignField: "_id",
                    as: "patientInfo"
                }
            },
            {
                $unwind: "$patientInfo"
            },
            {
                $lookup: {
                    from: "doctors",
                    localField: "doctor",
                    foreignField: "_id",
                    as: "doctorInfo"
                }
            },
            {
                $unwind: "$doctorInfo"
            },
            {
                $lookup: {
                    from: "hospitals",
                    localField: "doctorInfo.hospitalAffiliations.hospital",
                    foreignField: "_id",
                    as: "hospitalInfo"
                }
            },
            {
                $lookup: {
                    from: "payments",
                    localField: "_id",
                    foreignField: "appointment",
                    as: "paymentInfo"
                }
            },
            {
                $group: {
                    _id: "$patient",
                    patientInfo: { $first: "$patientInfo" },
                    lastDoctorInfo: { $first: "$doctorInfo" },
                    lastHospitalInfo: { $first: "$hospitalInfo" },
                    totalAppointments: { $sum: 1 },
                    completedAppointments: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
                        }
                    },
                    cancelledAppointments: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0]
                        }
                    },
                    pendingAppointments: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$status", "completed"] },
                                        { $ne: ["$status", "cancelled"] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                    totalPurchases: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$paymentInfo", []] },
                                        { $eq: [{ $arrayElemAt: ["$paymentInfo.status", 0] }, "captured"] }
                                    ]
                                },
                                { $ifNull: [{ $arrayElemAt: ["$paymentInfo.totalamount", 0] }, 0] },
                                0
                            ]
                        }
                    },
                    allAppointments: {
                        $push: {
                            status: "$status",
                            date: "$date",
                            payment: "$paymentInfo"
                        }
                    }
                }
            },
            {
                $project: {
                    id: { $toString: "$_id" },
                    name: "$patientInfo.fullName",
                    gender: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$patientInfo.gender", "male"] }, then: "Male" },
                                { case: { $eq: ["$patientInfo.gender", "female"] }, then: "Female" },
                                { case: { $eq: ["$patientInfo.gender", "other"] }, then: "Other" }
                            ],
                            default: "Prefer not to say"
                        }
                    },
                    age: {
                        $cond: [
                            { $ne: ["$patientInfo.dateOfBirth", null] },
                            {
                                $subtract: [
                                    { $year: new Date() },
                                    { $year: "$patientInfo.dateOfBirth" }
                                ]
                            },
                            null
                        ]
                    },
                    bloodGroup: {
                        $ifNull: ["$patientInfo.bloodGroup", "Not specified"]
                    },
                    email: "$patientInfo.email",
                    phone: {
                        $concat: [
                            { $ifNull: ["$patientInfo.countryCode", "+91"] },
                            " ",
                            "$patientInfo.mobileNumber"
                        ]
                    },
                    registrationDate: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$patientInfo.createdAt"
                        }
                    },
                    appointments: {
                        completed: "$completedAppointments",
                        cancelled: "$cancelledAppointments",
                        pending: "$pendingAppointments",
                        total: "$totalAppointments"
                    },
                    purchases: "$totalPurchases",
                    doctor: {
                        $cond: [
                            { $regexMatch: { input: "$lastDoctorInfo.fullName", regex: /^dr\.? /i } },
                            "$lastDoctorInfo.fullName",
                            { $concat: ["Dr. ", "$lastDoctorInfo.fullName"] }
                        ]
                    },
                    hospital: {
                        $ifNull: [
                            { $arrayElemAt: ["$lastHospitalInfo.name", 0] },
                            "Not specified"
                        ]
                    },
                    status: "Active"
                }
            }
        ];

        // Add search filter if provided
        if (searchQuery) {
            pipeline.push({
                $match: {
                    $or: [
                        { name: { $regex: searchQuery, $options: 'i' } },
                        { email: { $regex: searchQuery, $options: 'i' } },
                        { phone: { $regex: searchQuery, $options: 'i' } }
                    ]
                }
            });
        }

        // Add hospital filter if specified
        if (hospitalFilter !== 'All Hospitals') {
            pipeline.push({
                $match: {
                    hospital: hospitalFilter
                }
            });
        }

        // Add doctor filter if specified
        if (doctorFilter !== 'All Doctors') {
            pipeline.push({
                $match: {
                    doctor: doctorFilter
                }
            });
        }

        // Add sorting
        let sortStage = {};
        switch (sortBy) {
            case 'Name (A-Z)':
                sortStage = { name: 1 };
                break;
            case 'Most Appointments':
                sortStage = { 'appointments.total': -1 };
                break;
            case 'Highest Purchase Amount':
                sortStage = { purchases: -1 };
                break;
            case 'Most Cancelled Appointments':
                sortStage = { 'appointments.cancelled': -1 };
                break;
            case 'Recent Registration':
                sortStage = { registrationDate: -1 };
                break;
            default:
                sortStage = { 'appointments.cancelled': -1 };
        }

        pipeline.push({ $sort: sortStage });

        // Get total count for pagination
        const totalCountPipeline = [...pipeline, { $count: "total" }];
        const totalCountResult = await Appointment.aggregate(totalCountPipeline);
        const totalCount = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

        // Add pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: parseInt(limit) });

        // Execute the aggregation
        const patients = await Appointment.aggregate(pipeline);

        // Get unique doctors and hospitals for filter options
        const filterOptionsPipeline = [
            {
                $match: {
                    doctor: { $in: doctorObjectIds }
                }
            },
            {
                $lookup: {
                    from: "doctors",
                    localField: "doctor",
                    foreignField: "_id",
                    as: "doctorInfo"
                }
            },
            {
                $unwind: "$doctorInfo"
            },
            {
                $lookup: {
                    from: "hospitals",
                    localField: "doctorInfo.hospitalAffiliations.hospital",
                    foreignField: "_id",
                    as: "hospitalInfo"
                }
            },
            {
                $group: {
                    _id: null,
                    doctors: {
                        $addToSet: {
                            $concat: ["Dr. ", "$doctorInfo.fullName"]
                        }
                    },
                    hospitals: {
                        $addToSet: {
                            $arrayElemAt: ["$hospitalInfo.name", 0]
                        }
                    }
                }
            }
        ];

        const filterOptions = await Appointment.aggregate(filterOptionsPipeline);
        const availableFilters = filterOptions.length > 0 ? filterOptions[0] : { doctors: [], hospitals: [] };

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const currentPage = parseInt(page);
        const hasNextPage = currentPage < totalPages;
        const hasPrevPage = currentPage > 1;

        const response = {
            success: true,
            data: {
                filtersAndSorting: {
                    sortByOptions: [
                        "Name (A-Z)",
                        "Most Appointments",
                        "Highest Purchase Amount",
                        "Most Cancelled Appointments",
                        "Recent Registration"
                    ],
                    selectedSort: sortBy,
                    hospitalFilter: hospitalFilter,
                    doctorFilter: doctorFilter,
                    appointmentStatus: appointmentStatus,
                    availableHospitals: ["All Hospitals", ...availableFilters.hospitals.filter(h => h)],
                    availableDoctors: ["All Doctors", ...availableFilters.doctors.filter(d => d)],
                    availableStatuses: ["All Statuses", "Completed", "Cancelled", "Pending", "Confirmed"]
                },
                searchQuery: searchQuery,
                patientList: patients,
                pagination: {
                    currentPage: currentPage,
                    totalPages: totalPages,
                    totalCount: totalCount,
                    limit: parseInt(limit),
                    hasNextPage: hasNextPage,
                    hasPrevPage: hasPrevPage
                }
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error("Error fetching patient list:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};

const getPatientProfile = async (req, res) => {
    try {
        const { patientId } = req.params;

        // Validate patient ID
        if (!mongoose.Types.ObjectId.isValid(patientId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid patient ID"
            });
        }

        // Get doctor IDs from admin
        const doctorIds = await getDoctorIdsByAdmin(req.user.id);

        if (!doctorIds || !Array.isArray(doctorIds)) {
            return res.status(400).json({
                success: false,
                message: "Doctor IDs are required"
            });
        }

        // Convert to ObjectIds
        const doctorObjectIds = doctorIds.map(id => new mongoose.Types.ObjectId(id));
        const patientObjectId = new mongoose.Types.ObjectId(patientId);

        // Build aggregation pipeline for patient profile
        const pipeline = [
            {
                $match: {
                    patient: patientObjectId,
                    doctor: { $in: doctorObjectIds }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "patient",
                    foreignField: "_id",
                    as: "patientInfo"
                }
            },
            {
                $unwind: "$patientInfo"
            },
            {
                $lookup: {
                    from: "doctors",
                    localField: "doctor",
                    foreignField: "_id",
                    as: "doctorInfo"
                }
            },
            {
                $unwind: "$doctorInfo"
            },
            {
                $lookup: {
                    from: "hospitals",
                    localField: "doctorInfo.hospitalAffiliations.hospital",
                    foreignField: "_id",
                    as: "hospitalInfo"
                }
            },
            {
                $lookup: {
                    from: "payments",
                    localField: "_id",
                    foreignField: "appointment",
                    as: "paymentInfo"
                }
            },
            {
                $sort: { date: -1 }
            },
            {
                $group: {
                    _id: "$patient",
                    patientInfo: { $first: "$patientInfo" },
                    totalAppointments: { $sum: 1 },
                    completedAppointments: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "completed"] }, 1, 0]
                        }
                    },
                    cancelledAppointments: {
                        $sum: {
                            $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0]
                        }
                    },
                    totalPurchases: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $ne: ["$paymentInfo", []] },
                                        { $eq: [{ $arrayElemAt: ["$paymentInfo.status", 0] }, "captured"] }
                                    ]
                                },
                                { $ifNull: [{ $arrayElemAt: ["$paymentInfo.totalamount", 0] }, 0] },
                                0
                            ]
                        }
                    },
                    appointmentHistory: {
                        $push: {
                            date: {
                                $dateToString: {
                                    format: "%Y-%m-%d",
                                    date: "$date"
                                }
                            },
                            doctor: {
                                $cond: [
                                    { $regexMatch: { input: "$doctorInfo.fullName", regex: /^dr\.? /i } },
                                    "$doctorInfo.fullName",
                                    { $concat: ["Dr. ", "$doctorInfo.fullName"] }
                                ]
                            },
                            department: {
                                $ifNull: ["$doctorInfo.specialization", "General Medicine"]
                            },
                            hospital: {
                                $ifNull: [
                                    { $arrayElemAt: ["$hospitalInfo.name", 0] },
                                    "Not specified"
                                ]
                            },
                            status: {
                                $switch: {
                                    branches: [
                                        { case: { $eq: ["$status", "completed"] }, then: "Completed" },
                                        { case: { $eq: ["$status", "cancelled"] }, then: "Cancelled" },
                                        { case: { $eq: ["$status", "confirmed"] }, then: "Confirmed" },
                                        { case: { $eq: ["$status", "pending"] }, then: "Pending" }
                                    ],
                                    default: "Pending"
                                }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    id: { $toString: "$_id" },
                    name: "$patientInfo.fullName",
                    gender: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$patientInfo.gender", "male"] }, then: "Male" },
                                { case: { $eq: ["$patientInfo.gender", "female"] }, then: "Female" },
                                { case: { $eq: ["$patientInfo.gender", "other"] }, then: "Other" }
                            ],
                            default: "Prefer not to say"
                        }
                    },
                    age: {
                        $cond: [
                            { $ne: ["$patientInfo.dateOfBirth", null] },
                            {
                                $subtract: [
                                    { $year: new Date() },
                                    { $year: "$patientInfo.dateOfBirth" }
                                ]
                            },
                            null
                        ]
                    },
                    bloodGroup: {
                        $ifNull: ["$patientInfo.bloodGroup", "Not specified"]
                    },
                    phone: {
                        $concat: [
                            { $ifNull: ["$patientInfo.countryCode", "+91"] },
                            " ",
                            "$patientInfo.mobileNumber"
                        ]
                    },
                    email: "$patientInfo.email",
                    address: {
                        $concat: [
                            { $ifNull: ["$patientInfo.addressLine1", ""] },
                            " ",
                            { $ifNull: ["$patientInfo.addressLine2", ""] },
                            " ",
                            { $ifNull: ["$patientInfo.city", ""] },
                            ", ",
                            { $ifNull: ["$patientInfo.state", ""] },
                            ", ",
                            { $ifNull: ["$patientInfo.pinCode", ""] },
                            ", ",
                            { $ifNull: ["$patientInfo.country", ""] }
                        ]
                    },
                    registrationDate: {
                        $dateToString: {
                            format: "%Y-%m-%d",
                            date: "$patientInfo.createdAt"
                        }
                    },
                    monthsAsPatient: {
                        $divide: [
                            {
                                $subtract: [
                                    new Date(),
                                    "$patientInfo.createdAt"
                                ]
                            },
                            2629746000 // milliseconds in a month (30.44 days)
                        ]
                    },
                    appointments: {
                        completed: "$completedAppointments",
                        cancelled: "$cancelledAppointments",
                        total: "$totalAppointments"
                    },
                    totalPurchases: "$totalPurchases",
                    appointmentHistory: "$appointmentHistory"
                }
            }
        ];

        // Execute the aggregation
        const patientData = await Appointment.aggregate(pipeline);

        // Check if patient exists and has appointments with this admin's doctors
        if (!patientData || patientData.length === 0) {
            // Try to get patient basic info even if no appointments
            const patientInfo = await User.findById(patientObjectId);

            if (!patientInfo) {
                return res.status(404).json({
                    success: false,
                    message: "Patient not found"
                });
            }

            // Return basic patient info with no appointments
            const basicProfile = {
                id: patientInfo._id.toString(),
                name: patientInfo.fullName,
                gender: patientInfo.gender ?
                    patientInfo.gender.charAt(0).toUpperCase() + patientInfo.gender.slice(1) :
                    "Prefer not to say",
                age: patientInfo.dateOfBirth ?
                    new Date().getFullYear() - new Date(patientInfo.dateOfBirth).getFullYear() :
                    null,
                bloodGroup: patientInfo.bloodGroup || "Not specified",
                phone: `${patientInfo.countryCode || '+91'} ${patientInfo.mobileNumber}`,
                email: patientInfo.email,
                address: patientInfo.address || "Not specified",
                registrationDate: patientInfo.createdAt.toISOString().split('T')[0],
                monthsAsPatient: Math.floor((new Date() - new Date(patientInfo.createdAt)) / (1000 * 60 * 60 * 24 * 30.44)),
                appointments: {
                    completed: 0,
                    cancelled: 0,
                    total: 0
                },
                totalPurchases: 0,
                appointmentHistory: []
            };

            return res.status(200).json({
                success: true,
                data: {
                    patientProfile: basicProfile
                }
            });
        }

        const patient = patientData[0];

        // Calculate months as patient (rounded to nearest integer)
        patient.monthsAsPatient = Math.floor(patient.monthsAsPatient);

        const response = {
            success: true,
            data: {
                patientProfile: patient
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error("Error fetching patient profile:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};


module.exports = {
    getPatientList,
    getPatientProfile
};