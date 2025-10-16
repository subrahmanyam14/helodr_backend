const Cluster = require('../models/Cluster');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');

/**
 * Get list of patients who had appointments with doctors affiliated 
 * with hospitals under the admin's cluster
 * @route GET /api/admin/patients
 * @access Private (Admin only)
 */
exports.getPatientList = async (req, res) => {
  try {
    const adminId = req.user._id;
    
    // Extract query parameters
    const {
      search = '',
      sortBy = 'totalAppointments',
      hospital = '',
      doctor = '',
      page = 1,
      limit = 50
    } = req.query;

    // Find the cluster associated with this admin
    const cluster = await Cluster.findOne({ user: adminId, isActive: true });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: "No active cluster found for this admin"
      });
    }

    // Get all hospital IDs in this cluster
    let hospitalIds = cluster.hospitals;

    if (!hospitalIds || hospitalIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No hospitals found in this cluster",
        data: {
          patients: [],
          totalCount: 0,
          currentPage: parseInt(page),
          totalPages: 0
        }
      });
    }

    // Filter by specific hospital if provided
    if (hospital && hospital !== 'all') {
      hospitalIds = [hospital];
    }

    // Find all doctors affiliated with these hospitals
    let doctorQuery = {
      'hospitalAffiliations.hospital': { $in: hospitalIds },
      isActive: true
    };

    // Filter by specific doctor if provided
    if (doctor && doctor !== 'all') {
      doctorQuery._id = doctor;
    }

    const doctors = await Doctor.find(doctorQuery).select('_id');
    const doctorIds = doctors.map(doc => doc._id);

    if (doctorIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active doctors found in cluster hospitals",
        data: {
          patients: [],
          totalCount: 0,
          currentPage: parseInt(page),
          totalPages: 0
        }
      });
    }

    // FIXED: Aggregate appointments to get patient statistics with proper payment handling
    const patientStats = await Appointment.aggregate([
      {
        $match: {
          doctor: { $in: doctorIds }
        }
      },
      {
        $lookup: {
          from: 'payments',
          localField: 'payment',
          foreignField: '_id',
          as: 'paymentDetails'
        }
      },
      {
        $unwind: {
          path: '$paymentDetails',
          preserveNullAndEmptyArrays: true // Include appointments without payments
        }
      },
      {
        $group: {
          _id: '$patient',
          totalAppointments: { $sum: 1 },
          completedAppointments: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelledAppointments: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          totalAmountSpent: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $ne: ['$paymentDetails', null] },
                    { $eq: ['$paymentDetails.status', 'captured'] } // FIXED: Changed from 'completed' to 'captured'
                  ]
                },
                { $ifNull: ['$paymentDetails.amount', 0] },
                0
              ]
            }
          }
        }
      }
    ]);

    // Get unique patient IDs
    const patientIds = patientStats.map(stat => stat._id);

    // Build search query
    let patientQuery = {
      _id: { $in: patientIds },
      role: 'patient'
    };

    // Add search functionality
    if (search) {
      patientQuery.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobileNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Fetch patient details
    const patients = await User.find(patientQuery)
      .select('fullName email mobileNumber gender dateOfBirth bloodGroup createdAt profilePhoto');

    // Combine patient details with statistics
    let patientList = patients.map(patient => {
      const stats = patientStats.find(stat => 
        stat._id.toString() === patient._id.toString()
      );

      return {
        patientId: patient._id,
        patientName: patient.fullName,
        email: patient.email,
        mobileNumber: patient.mobileNumber,
        age: patient.age,
        gender: patient.gender,
        bloodGroup: patient.bloodGroup || 'Not specified',
        registrationDate: patient.createdAt,
        profilePhoto: patient.profilePhoto,
        totalAppointments: stats?.totalAppointments || 0,
        completedAppointments: stats?.completedAppointments || 0,
        cancelledAppointments: stats?.cancelledAppointments || 0,
        totalAmountSpent: stats?.totalAmountSpent || 0
      };
    });

    // Apply sorting
    switch (sortBy) {
      case 'name':
        patientList.sort((a, b) => a.patientName.localeCompare(b.patientName));
        break;
      case 'totalAppointments':
        patientList.sort((a, b) => b.totalAppointments - a.totalAppointments);
        break;
      case 'totalAmountSpent':
        patientList.sort((a, b) => b.totalAmountSpent - a.totalAmountSpent);
        break;
      case 'cancelledAppointments':
        patientList.sort((a, b) => b.cancelledAppointments - a.cancelledAppointments);
        break;
      case 'recentRegistration':
        patientList.sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate));
        break;
      default:
        patientList.sort((a, b) => b.totalAppointments - a.totalAppointments);
    }

    // Pagination
    const totalCount = patientList.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedPatients = patientList.slice(startIndex, endIndex);

    return res.status(200).json({
      success: true,
      message: "Patient list retrieved successfully",
      data: {
        clusterName: cluster.clusterName,
        totalHospitals: cluster.hospitals.length,
        totalDoctors: doctorIds.length,
        totalPatients: totalCount,
        currentPage: parseInt(page),
        totalPages,
        patients: paginatedPatients
      }
    });

  } catch (error) {
    console.error("Error fetching patient list:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching patient list",
      error: error.message
    });
  }
};

/**
 * Get filter options (hospitals and doctors) for the admin's cluster
 * @route GET /api/admin/patients/filter-options
 * @access Private (Admin only)
 */
exports.getFilterOptions = async (req, res) => {
  try {
    const adminId = req.user._id;

    // Find the cluster associated with this admin
    const cluster = await Cluster.findOne({ user: adminId, isActive: true })
      .populate('hospitals', 'name _id');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: "No active cluster found for this admin"
      });
    }

    const hospitalIds = cluster.hospitals.map(h => h._id);

    // Get hospitals list
    const hospitals = cluster.hospitals.map(hospital => ({
      id: hospital._id,
      name: hospital.name
    }));

    // Get doctors affiliated with these hospitals
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds },
      isActive: true
    })
      .select('fullName specializations _id')
      .populate('hospitalAffiliations.hospital', 'name _id');

    const doctorsList = doctors.map(doctor => ({
      id: doctor._id,
      name: doctor.fullName,
      specializations: doctor.specializations,
      hospitals: doctor.hospitalAffiliations
        .filter(aff => hospitalIds.some(hId => hId.equals(aff.hospital._id)))
        .map(aff => ({
          id: aff.hospital._id,
          name: aff.hospital.hospitalName
        }))
    }));

    return res.status(200).json({
      success: true,
      message: "Filter options retrieved successfully",
      data: {
        hospitals: [
          { id: 'all', name: 'All Hospitals' },
          ...hospitals
        ],
        doctors: [
          { id: 'all', name: 'All Doctors' },
          ...doctorsList
        ],
        sortOptions: [
          { value: 'name', label: 'Name (A-Z)' },
          { value: 'totalAppointments', label: 'Most Appointments' },
          { value: 'totalAmountSpent', label: 'Highest Purchase Amount' },
          { value: 'cancelledAppointments', label: 'Most Cancelled Appointments' },
          { value: 'recentRegistration', label: 'Recent Registration' }
        ]
      }
    });

  } catch (error) {
    console.error("Error fetching filter options:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching filter options",
      error: error.message
    });
  }
};

/**
 * Get detailed patient information with appointment history
 * @route GET /api/admin/patients/:patientId
 * @access Private (Admin only)
 */
exports.getPatientDetails = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { patientId } = req.params;

    // Verify admin has access to this patient
    const cluster = await Cluster.findOne({ user: adminId, isActive: true });

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: "No active cluster found for this admin"
      });
    }

    const hospitalIds = cluster.hospitals;
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: hospitalIds },
      isActive: true
    }).select('_id');

    const doctorIds = doctors.map(doc => doc._id);

    // Get patient details
    const patient = await User.findOne({
      _id: patientId,
      role: 'patient'
    });

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    // Get appointment history with proper payment population
    const appointments = await Appointment.find({
      patient: patientId,
      doctor: { $in: doctorIds }
    })
      .populate('doctor', 'fullName specializations')
      .populate({
        path: 'payment',
        select: 'amount status paymentMethod transactionId'
      })
      .sort({ date: -1 })
      .limit(50);

    // Calculate statistics
    const totalAppointments = appointments.length;
    const completedAppointments = appointments.filter(apt => apt.status === 'completed').length;
    const cancelledAppointments = appointments.filter(apt => apt.status === 'cancelled').length;
    
    const totalAmountSpent = appointments.reduce((sum, apt) => {
      if (apt.payment && apt.payment.status === 'completed') {
        return sum + (apt.payment.amount || 0);
      }
      return sum;
    }, 0);

    return res.status(200).json({
      success: true,
      message: "Patient details retrieved successfully",
      data: {
        patient: {
          patientId: patient._id,
          patientName: patient.fullName,
          email: patient.email,
          mobileNumber: patient.mobileNumber,
          age: patient.age,
          gender: patient.gender,
          bloodGroup: patient.bloodGroup,
          dateOfBirth: patient.dateOfBirth,
          registrationDate: patient.createdAt,
          profilePhoto: patient.profilePhoto,
          address: {
            addressLine1: patient.addressLine1,
            addressLine2: patient.addressLine2,
            city: patient.city,
            state: patient.state,
            pinCode: patient.pinCode,
            country: patient.country
          }
        },
        statistics: {
          totalAppointments,
          completedAppointments,
          cancelledAppointments,
          totalAmountSpent
        },
        recentAppointments: appointments.map(apt => ({
          appointmentId: apt._id,
          date: apt.date,
          appointmentType: apt.appointmentType,
          status: apt.status,
          slot: apt.slot,
          reason: apt.reason,
          doctor: apt.doctor ? {
            name: apt.doctor.fullName,
            specializations: apt.doctor.specializations
          } : null,
          payment: apt.payment ? {
            amount: apt.payment.amount || 0,
            status: apt.payment.status,
            method: apt.payment.paymentMethod,
            transactionId: apt.payment.transactionId
          } : null,
          review: apt.review
        }))
      }
    });

  } catch (error) {
    console.error("Error fetching patient details:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching patient details",
      error: error.message
    });
  }
};