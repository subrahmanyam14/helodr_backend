const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const Hospital = require("../models/Hospital");
const Payment = require("../models/Payment");
const Appointment = require("../models/Appointment");
const { getDoctorIdsByAdmin } = require("../utils/doctorIds.js");

/**
 * Fetch doctor data with proper rating calculation
 */
const fetchDoctorData = async (req, res) => {
  try {
    const doctorIds = await getDoctorIdsByAdmin(req.user.id);
    
    if (!doctorIds || !Array.isArray(doctorIds) || doctorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Doctor IDs array is required in request body"
      });
    }

    const validIds = doctorIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid doctor IDs provided"
      });
    }

    // Fetch doctors with populated data
    const doctors = await Doctor.find({ _id: { $in: validIds } })
      .populate('user', 'fullName profileImage')
      .populate('hospitalAffiliations.hospital', 'name')
      .lean();

    if (doctors.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No doctors found with provided IDs"
      });
    }

    // Calculate actual ratings from appointments with reviews
    const doctorRatings = await Promise.all(
      doctors.map(async (doctor) => {
        const appointments = await Appointment.find({
          doctor: doctor._id,
          'review.rating': { $exists: true, $ne: null }
        }).lean();

        if (appointments.length === 0) {
          return {
            doctorId: doctor._id,
            averageRating: 0,
            totalRatings: 0
          };
        }

        const totalRating = appointments.reduce((sum, apt) => sum + (apt.review.rating || 0), 0);
        const averageRating = totalRating / appointments.length;

        return {
          doctorId: doctor._id,
          averageRating: averageRating,
          totalRatings: appointments.length
        };
      })
    );

    // Create rating lookup map
    const ratingMap = doctorRatings.reduce((acc, item) => {
      acc[item.doctorId.toString()] = {
        rating: item.averageRating,
        totalRatings: item.totalRatings
      };
      return acc;
    }, {});

    // Calculate revenue for each doctor
    const doctorRevenues = await Promise.all(
      doctors.map(async (doctor) => {
        const revenue = await Payment.aggregate([
          {
            $match: {
              doctor: new mongoose.Types.ObjectId(doctor._id),
              status: "captured"
            }
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" }
            }
          }
        ]);

        return {
          doctorId: doctor._id,
          revenue: revenue.length > 0 ? revenue[0].totalRevenue || 0 : 0
        };
      })
    );

    // Create revenue lookup map
    const revenueMap = doctorRevenues.reduce((acc, item) => {
      acc[item.doctorId.toString()] = item.revenue;
      return acc;
    }, {});

    // Get hospitals and specialties
    const hospitals = await Hospital.find({}, 'name').lean();
    const hospitalNames = hospitals.map(h => h.name || "Unknown Hospital");
    const allSpecialties = [...new Set(doctors.flatMap(doc => 
      (doc.specializations || []).length > 0 ? doc.specializations : ["General Medicine"]
    ))];

    // Calculate totals
    const totalRevenue = doctorRevenues.reduce((sum, item) => sum + item.revenue, 0);
    const activeDoctors = doctors.filter(doc => doc.isActive === true).length;

    // Format doctors data with proper rating calculation
    const formattedDoctors = doctors.map(doctor => {
      const revenue = revenueMap[doctor._id.toString()] || 0;
      const ratingData = ratingMap[doctor._id.toString()] || { rating: 0, totalRatings: 0 };
      
      // Determine status
      let status = "pending";
      if (doctor.verification && doctor.verification.status === "verified") {
        status = doctor.isActive ? "active" : "on leave";
      } else if (doctor.verification && doctor.verification.status === "rejected") {
        status = "rejected";
      }

      // Calculate rating with proper checks
      const averageRating = ratingData.rating || 0;
      const ratingPercentage = Math.round((averageRating / 5) * 100);
      const ratingText = ratingData.totalRatings > 0 
        ? `${ratingPercentage}% satisfied (${ratingData.totalRatings} reviews)`
        : "No reviews yet";

      // Get primary hospital
      const primaryHospital = doctor.hospitalAffiliations && doctor.hospitalAffiliations.length > 0 
        ? (doctor.hospitalAffiliations[0].hospital?.name || "Independent Practice")
        : "Independent Practice";

      // Get profile image
      let profileImage = `https://randomuser.me/api/portraits/men/${Math.floor(Math.random() * 99) + 1}.jpg`;
      if (doctor.user && doctor.user.profileImage) {
        profileImage = doctor.user.profileImage;
      } else if (doctor.profileImage) {
        profileImage = doctor.profileImage;
      }

      return {
        id: doctor._id.toString(),
        name: doctor.fullName || (doctor.user ? doctor.user.fullName : "Dr. Unknown"),
        experience: doctor.experience || 0,
        specialty: (doctor.specializations && doctor.specializations[0]) || "General Medicine",
        hospital: primaryHospital,
        status: status,
        revenue: revenue,
        rating: parseFloat(averageRating.toFixed(1)),
        ratingText: ratingText,
        totalRatings: ratingData.totalRatings,
        profileImage: profileImage,
        email: doctor.email || "",
        phone: doctor.phone || "",
        consultationFee: doctor.consultationFee || 0
      };
    });

    // Calculate appointment statistics
    const appointmentStats = await Appointment.aggregate([
      {
        $match: { doctor: { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) } }
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      }
    ]);

    let totalAppointments = 0;
    let upcomingAppointments = 0;
    let completedAppointments = 0;
    let cancelledAppointments = 0;

    appointmentStats.forEach(stat => {
      if (stat._id === "completed") {
        completedAppointments = stat.count;
      } else if (stat._id === "confirmed") {
        upcomingAppointments = stat.count;
      } else if (stat._id === "cancelled") {
        cancelledAppointments = stat.count;
      }
      totalAppointments += stat.count;
    });

    const response = {
      totalDoctors: doctors.length,
      activeDoctors: activeDoctors,
      totalRevenue: totalRevenue,
      totalAppointments: totalAppointments,
      upcomingAppointments: upcomingAppointments,
      completedAppointments: completedAppointments,
      cancelledAppointments: cancelledAppointments,
      hospitals: hospitalNames.slice(0, 5),
      specialties: allSpecialties.slice(0, 5),
      doctors: formattedDoctors
    };

    return res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error("Error fetching doctor data:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};

/**
 * Enhanced analytics with proper rating calculation using aggregation
 */
const fetchDoctorAnalytics = async (req, res) => {
  try {
    const doctorIds = await getDoctorIdsByAdmin(req.user.id);
    
    if (!doctorIds || !Array.isArray(doctorIds) || doctorIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Doctor IDs array is required in request body"
      });
    }

    const validIds = doctorIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid doctor IDs provided"
      });
    }

    // Enhanced aggregation pipeline with proper rating calculation
    const doctorData = await Doctor.aggregate([
      {
        $match: { _id: { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) } }
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo"
        }
      },
      { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "hospitals",
          localField: "hospitalAffiliations.hospital",
          foreignField: "_id",
          as: "hospitalInfo"
        }
      },
      { $unwind: { path: "$hospitalInfo", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "payments",
          let: { doctorId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$doctor", "$$doctorId"] },
                    { $eq: ["$status", "captured"] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                totalPayments: { $sum: 1 }
              }
            }
          ],
          as: "revenueData"
        }
      },
      { $unwind: { path: "$revenueData", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "appointments",
          let: { doctorId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$doctor", "$$doctorId"] }
              }
            },
            {
              $facet: {
                statusStats: [
                  {
                    $group: {
                      _id: "$status",
                      count: { $sum: 1 }
                    }
                  }
                ],
                ratingStats: [
                  {
                    $match: {
                      "review.rating": { $exists: true, $ne: null }
                    }
                  },
                  {
                    $group: {
                      _id: null,
                      averageRating: { $avg: "$review.rating" },
                      totalRatings: { $sum: 1 },
                      ratings: { $push: "$review.rating" }
                    }
                  }
                ]
              }
            }
          ],
          as: "appointmentData"
        }
      },
      { $unwind: { path: "$appointmentData", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          revenue: { $ifNull: ["$revenueData.totalRevenue", 0] },
          totalPayments: { $ifNull: ["$revenueData.totalPayments", 0] },
          appointmentStats: { $ifNull: ["$appointmentData.statusStats", []] },
          ratingData: { 
            $arrayElemAt: ["$appointmentData.ratingStats", 0] 
          }
        }
      },
      {
        $addFields: {
          actualAverageRating: { 
            $ifNull: ["$ratingData.averageRating", 0] 
          },
          totalRatings: { 
            $ifNull: ["$ratingData.totalRatings", 0] 
          },
          fullName: { 
            $ifNull: ["$fullName", "$userInfo.fullName", "Dr. Unknown"] 
          },
          primarySpecialty: {
            $arrayElemAt: [
              { $ifNull: ["$specializations", ["General Medicine"]] },
              0
            ]
          },
          primaryHospital: {
            $ifNull: ["$hospitalInfo.name", "Independent Practice"]
          },
          profileImage: {
            $ifNull: [
              "$userInfo.profileImage",
              "$profileImage",
              {
                $concat: [
                  "https://randomuser.me/api/portraits/men/",
                  { $toString: { $floor: { $add: [{ $multiply: [{ $rand: {} }, 99] }, 1] } } },
                  ".jpg"
                ]
              }
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          fullName: 1,
          experience: { $ifNull: ["$experience", 0] },
          primarySpecialty: 1,
          primaryHospital: 1,
          isActive: { $ifNull: ["$isActive", false] },
          verification: { $ifNull: ["$verification", { status: "pending" }] },
          revenue: 1,
          totalPayments: 1,
          actualAverageRating: 1,
          totalRatings: 1,
          profileImage: 1,
          appointmentStats: 1
        }
      }
    ]);

    // Process the data
    const hospitals = await Hospital.find({}, 'name').lean();
    const hospitalNames = hospitals.map(h => h.name || "Unknown Hospital");
    
    const allSpecialties = [...new Set(doctorData.map(doc => doc.primarySpecialty))];
    
    const totalRevenue = doctorData.reduce((sum, doc) => sum + (doc.revenue || 0), 0);
    const activeDoctors = doctorData.filter(doc => doc.isActive === true).length;

    // Format complete doctor data with proper ratings
    const formattedDoctors = doctorData.map(doctor => {
      // Determine status
      let status = "pending";
      if (doctor.verification && doctor.verification.status === "verified") {
        status = doctor.isActive ? "active" : "on leave";
      } else if (doctor.verification && doctor.verification.status === "rejected") {
        status = "rejected";
      }

      // Use actual calculated rating
      const averageRating = doctor.actualAverageRating || 0;
      const ratingPercentage = Math.round((averageRating / 5) * 100);
      const ratingText = doctor.totalRatings > 0 
        ? `${ratingPercentage}% satisfied (${doctor.totalRatings} reviews)`
        : "No reviews yet";

      // Process appointment stats
      const appointmentStats = (doctor.appointmentStats || []).reduce((acc, stat) => {
        acc[stat._id] = stat.count || 0;
        return acc;
      }, {});

      const totalAppointments = Object.values(appointmentStats).reduce((sum, count) => sum + count, 0);

      return {
        id: doctor._id.toString(),
        name: doctor.fullName,
        experience: doctor.experience,
        specialty: doctor.primarySpecialty,
        hospital: doctor.primaryHospital,
        status: status,
        revenue: doctor.revenue,
        rating: parseFloat(averageRating.toFixed(1)),
        ratingText: ratingText,
        totalRatings: doctor.totalRatings,
        profileImage: doctor.profileImage,
        totalPayments: doctor.totalPayments,
        appointmentStats: appointmentStats,
        totalAppointments: totalAppointments,
        isActive: doctor.isActive,
        verificationStatus: doctor.verification ? doctor.verification.status : "pending"
      };
    });

    // Calculate overall statistics
    const totalAppointments = formattedDoctors.reduce((sum, doc) => sum + doc.totalAppointments, 0);
    const overallAverageRating = doctorData.length > 0 
      ? doctorData.reduce((sum, doc) => sum + (doc.actualAverageRating || 0), 0) / doctorData.length
      : 0;

    const response = {
      totalDoctors: doctorData.length,
      activeDoctors: activeDoctors,
      totalRevenue: totalRevenue,
      totalAppointments: totalAppointments,
      hospitals: hospitalNames.slice(0, 5),
      specialties: allSpecialties.slice(0, 5),
      doctors: formattedDoctors,
      averageRating: parseFloat(overallAverageRating.toFixed(1)),
      averageRevenue: parseFloat((totalRevenue / (doctorData.length || 1)).toFixed(2)),
      revenueDistribution: formattedDoctors.map(doc => ({
        id: doc.id,
        name: doc.name,
        revenue: doc.revenue,
        percentage: parseFloat(((doc.revenue / (totalRevenue || 1)) * 100).toFixed(2))
      })),
      statusDistribution: {
        active: formattedDoctors.filter(doc => doc.status === "active").length,
        pending: formattedDoctors.filter(doc => doc.status === "pending").length,
        rejected: formattedDoctors.filter(doc => doc.status === "rejected").length,
        on_leave: formattedDoctors.filter(doc => doc.status === "on leave").length
      },
      ratingDistribution: {
        totalReviews: formattedDoctors.reduce((sum, doc) => sum + doc.totalRatings, 0),
        averageRating: parseFloat(overallAverageRating.toFixed(1)),
        doctorsWithReviews: formattedDoctors.filter(doc => doc.totalRatings > 0).length
      }
    };

    return res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error("Error fetching doctor analytics:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

/**
 * Utility function to recalculate and update doctor ratings
 */
const recalculateDoctorRatings = async (doctorId) => {
  try {
    const appointments = await Appointment.find({
      doctor: doctorId,
      'review.rating': { $exists: true, $ne: null }
    }).lean();

    if (appointments.length === 0) {
      await Doctor.findByIdAndUpdate(doctorId, {
        averageRating: 0,
        totalRatings: 0
      });
      return { averageRating: 0, totalRatings: 0 };
    }

    const totalRating = appointments.reduce((sum, apt) => sum + (apt.review.rating || 0), 0);
    const averageRating = totalRating / appointments.length;

    await Doctor.findByIdAndUpdate(doctorId, {
      averageRating: averageRating,
      totalRatings: appointments.length
    });

    return { averageRating, totalRatings: appointments.length };
  } catch (error) {
    console.error(`Error recalculating ratings for doctor ${doctorId}:`, error);
    throw error;
  }
};


/**
 * Get doctor profile data with statistics and recent activity
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
/**
 * Get doctor profile data with statistics and recent activity
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getDoctorProfile = async (req, res) => {
  try {
    const { doctorId } = req.params;

    // Fetch doctor with populated user and hospital data
    const doctor = await Doctor.findById(doctorId)
      .populate('user', 'fullName email countryCode mobileNumber dateOfBirth profilePhoto')
      .populate({
        path: 'hospitalAffiliations.hospital',
        select: 'name address',
        model: 'Hospital'
      })
      .lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Get current date for calculations
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    
    // Calculate age from date of birth
    const calculateAge = (dateOfBirth) => {
      if (!dateOfBirth) return null;
      const birthDate = new Date(dateOfBirth);
      const age = currentYear - birthDate.getFullYear();
      const monthDiff = currentDate.getMonth() - birthDate.getMonth();
      return monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birthDate.getDate()) 
        ? age - 1 : age;
    };

    // Get all appointments for this doctor with populated payment data
    const appointments = await Appointment.find({ doctor: doctorId })
      .populate('patient', 'fullName dateOfBirth gender')
      .populate('payment') // Populate full payment object
      .sort({ createdAt: -1 })
      .lean();

    // Calculate total statistics
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(apt => apt.status === 'completed');
    const uniquePatients = [...new Set(appointments.map(apt => apt.patient?._id?.toString()))].length;
    
    // Calculate total revenue from completed appointments with proper payment data
    const totalRevenue = completedAppointments.reduce((sum, apt) => {
      // Check if payment exists and has captured status
      if (apt.payment && apt.payment.status === 'captured') {
        return sum + (apt.payment.amount || 0);
      }
      return sum;
    }, 0);

    // Generate monthly appointments data for last 6 months
    const monthlyAppointments = [];
    const monthlyRevenue = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthName = monthNames[date.getMonth()];
      
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthAppointments = appointments.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate >= monthStart && aptDate <= monthEnd;
      });
      
      const monthCompletedAppointments = monthAppointments.filter(apt => apt.status === 'completed');
      const monthRevenue = monthCompletedAppointments.reduce((sum, apt) => {
        if (apt.payment && apt.payment.status === 'captured') {
          return sum + (apt.payment.amount || 0);
        }
        return sum;
      }, 0);
      
      monthlyAppointments.push({
        month: monthName,
        count: monthAppointments.length
      });
      
      monthlyRevenue.push({
        month: monthName,
        revenue: monthRevenue
      });
    }

    // Get recent patients (last 5 unique patients)
    const recentPatients = appointments
      .filter(apt => apt.patient && apt.status !== 'cancelled')
      .slice(0, 5)
      .map(apt => ({
        name: apt.patient?.fullName || 'Unknown',
        age: calculateAge(apt.patient?.dateOfBirth) || 0,
        gender: apt.patient?.gender || 'Unknown',
        date: apt.date ? new Date(apt.date).toISOString().split('T')[0] : null,
        diagnosis: apt.reason || 'General Consultation',
        status: apt.status === 'completed' ? 'Completed' : 
                apt.status === 'confirmed' ? 'Scheduled' : 
                apt.status === 'cancelled' ? 'Cancelled' : 'Pending'
      }));

    // Get upcoming appointments (next 3 appointments)
    const upcomingAppointments = appointments
      .filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate > currentDate && ['confirmed', 'pending'].includes(apt.status);
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 3)
      .map(apt => ({
        patientName: apt.patient?.fullName || 'Unknown',
        datetime: new Date(apt.date).toISOString(),
        type: apt.appointmentType === 'video' ? 'Video Consultation' : 
              apt.reason === 'emergency' ? 'Emergency' : 
              apt.reason === 'checkup' ? 'Regular Checkup' : 'Consultation',
        note: apt.reason && apt.reason.length > 50 ? 
              'Patient requested early appointment' : null
      }));

    // Get primary hospital affiliation
    const primaryHospital = doctor.hospitalAffiliations?.[0]?.hospital;
    
    // Determine status based on isActive and other factors
    const getStatus = () => {
      if (!doctor.isActive) return 'on leave';
      if (doctor.verification?.status === 'pending') return 'pending';
      return 'active';
    };

    // Construct phone number properly
    const getPhoneNumber = () => {
      if (doctor.user?.mobileNumber) {
        const countryCode = doctor.user?.countryCode || '+91';
        return `${countryCode}${doctor.user.mobileNumber}`;
      }
      return 'Not provided';
    };

    // Format the response data
    const doctorProfile = {
      id: doctor._id.toString(),
      name: doctor.fullName || doctor.user?.fullName || 'Unknown',
      specialty: doctor.specializations?.[0] || 'General Medicine',
      experience: doctor.experience || 0,
      status: getStatus(),
      rating: parseFloat(doctor.averageRating?.toFixed(1)) || 0,
      ratingText: doctor.totalRatings > 0 ? 
        `${Math.round((doctor.averageRating / 5) * 100)}% satisfied` : 
        'No ratings yet',
      profileImage: doctor.user?.profilePhoto || 'https://via.placeholder.com/150',
      
      hospital: primaryHospital?.name || 'Independent Practice',
      address: doctor.address ? 
        `${doctor.address.street || ''}, ${doctor.address.city || ''}, ${doctor.address.state || ''}`.replace(/^,\s*|,\s*$/g, '') : 
        'Address not available',
      phone: getPhoneNumber(),
      email: doctor.user?.email || 'Not provided',
      dob: doctor.user?.dateOfBirth ? 
        new Date(doctor.user.dateOfBirth).toISOString().split('T')[0] : null,
      age: calculateAge(doctor.user?.dateOfBirth) || 0,
      memberSince: doctor.verifiedByAdmin.verifiedAt ? 
        new Date(doctor.verifiedByAdmin.verifiedAt).toISOString().split('T')[0] : null,
      
      stats: {
        totalAppointments,
        totalPatients: uniquePatients,
        totalRevenue
      },
      
      monthlyAppointments,
      monthlyRevenue,
      recentPatients,
      upcomingAppointments
    };

    res.status(200).json({
      success: true,
      data: doctorProfile
    });

  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};




module.exports = {
  fetchDoctorData,
  fetchDoctorAnalytics,
  recalculateDoctorRatings,
  getDoctorProfile
};