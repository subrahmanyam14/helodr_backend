// ============================================
// FILE: controllers/doctorController.js
// ============================================

const Doctor = require('../models/Doctor');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const Hospital = require('../models/Hospital');
const Cluster = require('../models/Cluster');

/**
 * @desc    Get all doctors with enriched statistics
 * @route   GET /api/doctors
 * @access  Private/Admin
 */
exports.getAllDoctors = async (req, res) => {
  try {
    const {
      search,
      hospital,
      specialty,
      status,
      isActive,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const adminId = req.user._id;

    // Step 1: Find cluster managed by this admin
    const cluster = await Cluster.findOne({ user: adminId }).populate('hospitals');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No cluster found for this admin'
      });
    }

    // Step 2: Get hospital IDs from the cluster
    const hospitalIds = cluster.hospitals.map(h => h._id);

    // Step 3: Also get doctors from hospitals verified by this admin
    const verifiedHospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });

    const verifiedHospitalIds = verifiedHospitals.map(h => h._id);

    // Combine hospital IDs (cluster + verified)
    const allHospitalIds = [...new Set([
      ...hospitalIds.map(id => id.toString()),
      ...verifiedHospitalIds.map(id => id.toString())
    ])];

    // Build base query for doctors
    let doctorQuery = {
      'hospitalAffiliations.hospital': { $in: allHospitalIds }
    };

    // Apply filters to the database query for better performance
    if (specialty && specialty !== 'All') {
      doctorQuery.specializations = specialty;
    }

    if (isActive !== undefined) {
      doctorQuery.isActive = isActive === 'true';
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination info
    const totalDoctors = await Doctor.countDocuments(doctorQuery);

    // Get paginated doctors
    const doctors = await Doctor.find(doctorQuery)
      .populate('user', 'fullName email phoneNumber profilePicture')
      .populate('hospitalAffiliations.hospital', 'name type address')
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Apply search filter after query if needed (since search might involve multiple fields)
    let filteredDoctors = doctors;

    if (search) {
      const searchLower = search.toLowerCase();
      filteredDoctors = doctors.filter(doctor =>
        doctor.fullName?.toLowerCase().includes(searchLower) ||
        doctor.user?.fullName?.toLowerCase().includes(searchLower) ||
        doctor.specializations?.some(s => s?.toLowerCase().includes(searchLower)) ||
        doctor.registrationNumber?.toLowerCase().includes(searchLower)
      );
    }

    // Enrich with statistics
    const enrichedDoctors = await Promise.all(
      filteredDoctors.map(async (doctor) => {
        const doctorObj = doctor.toObject();

        // Get appointments for this doctor
        const appointments = await Appointment.find({
          doctor: doctor._id
        });

        const totalAppointments = appointments.length;

        // Calculate appointment breakdown
        const completed = appointments.filter(a => a.status === 'completed').length;
        const upcoming = appointments.filter(a =>
          a.status === 'pending' || a.status === 'confirmed'
        ).length;
        const cancelled = appointments.filter(a => a.status === 'cancelled').length;
        const noshow = appointments.filter(a => a.status === 'no_show').length;

        // Calculate revenue from completed appointments
        const completedAppointments = appointments.filter(a => a.status === 'completed');
        let totalRevenue = 0;

        for (const apt of completedAppointments) {
          const payment = await Payment.findOne({
            appointment: apt._id,
            status: 'captured'
          });
          if (payment) {
            totalRevenue += payment.amount || 0;
          }
        }

        // Determine primary hospital
        const currentAffiliation = doctorObj.hospitalAffiliations?.find(
          aff => aff.currentlyWorking
        );
        const hospitalName = currentAffiliation?.hospital?.name || 'Independent Practice';

        // Determine status based on isActive and recent activity
        let doctorStatus = 'pending';
        if (doctorObj.isActive) {
          doctorStatus = 'active';
          // Check if doctor has recent appointments
          const recentAppointments = appointments.filter(a => {
            const appointmentDate = new Date(a.date);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return appointmentDate >= thirtyDaysAgo;
          });

          if (recentAppointments.length === 0 && totalAppointments > 0) {
            doctorStatus = 'on leave';
          }
        }

        return {
          id: doctorObj._id.toString(),
          name: doctorObj.fullName || doctorObj.user?.fullName || 'N/A',
          specialty: doctorObj.specializations?.[0] || 'General Medicine',
          specializations: doctorObj.specializations || [],
          hospital: hospitalName,
          status: doctorStatus,
          appointments: totalAppointments,
          appointmentsBreakdown: {
            completed,
            upcoming,
            cancelled,
            noshow
          },
          revenue: totalRevenue,
          rating: doctorObj.averageRating || 0,
          totalRatings: doctorObj.totalRatings || 0,
          experience: doctorObj.experience || 0,
          registrationNumber: doctorObj.registrationNumber || 'N/A',
          imageUrl: doctorObj.user?.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(doctorObj.fullName || 'Doctor')}&background=00B5A3&color=fff`,
          isActive: doctorObj.isActive,
          email: doctorObj.user?.email || '',
          phone: doctorObj.user?.phoneNumber || '',
          qualifications: doctorObj.qualifications || [],
          languages: doctorObj.languages || [],
          bio: doctorObj.bio || '',
          clinicConsultationFee: doctorObj.clinicConsultationFee?.consultationFee || 0,
          onlineConsultationFee: doctorObj.onlineConsultation?.consultationFee || 0,
          meetingLink: doctorObj.meetingLink || '',
          createdAt: doctorObj.createdAt,
          updatedAt: doctorObj.updatedAt
        };
      })
    );

    // Apply hospital name and status filters after enrichment
    let finalDoctors = enrichedDoctors;

    if (hospital && hospital !== 'All') {
      finalDoctors = enrichedDoctors.filter(d => d.hospital === hospital);
    }

    if (status && status !== 'All') {
      finalDoctors = finalDoctors.filter(d => d.status === status);
    }

    // Calculate final pagination info
    const finalCount = finalDoctors.length;
    const totalPages = Math.ceil(totalDoctors / limitNum);
    const currentPage = pageNum;
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    res.status(200).json({
      success: true,
      data: {
        doctors: finalDoctors,
        pagination: {
          totalDoctors: totalDoctors,
          currentPage,
          totalPages,
          hasNextPage,
          hasPrevPage,
          limit: limitNum
        }
      }
    });

  } catch (error) {
    console.error('Get all doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching doctors',
      error: error.message
    });
  }
};

/**
 * @desc    Get single doctor by ID with full details
 * @route   GET /api/doctors/:id
 * @access  Private/Admin
 */
exports.getDoctorById = async (req, res) => {
  try {
    const adminId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    // Step 1: Find cluster managed by this admin
    const cluster = await Cluster.findOne({ user: adminId }).populate('hospitals');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No cluster found for this admin'
      });
    }

    // Step 2: Get hospital IDs from cluster
    const hospitalIds = cluster.hospitals.map(h => h._id);

    // Step 3: Get hospitals verified by this admin
    const verifiedHospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });

    const verifiedHospitalIds = verifiedHospitals.map(h => h._id);

    // Combine hospital IDs
    const allHospitalIds = [...new Set([...hospitalIds.map(id => id.toString()), ...verifiedHospitalIds.map(id => id.toString())])];

    // Step 4: Find the doctor
    const doctor = await Doctor.findById(req.params.id)
      .populate('user', 'fullName email phoneNumber profilePicture dateOfBirth gender')
      .populate('hospitalAffiliations.hospital', 'name type address contact');

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Step 5: Check if doctor is affiliated with any hospital under admin's control
    const doctorHospitalIds = doctor.hospitalAffiliations
      .map(aff => aff.hospital?._id?.toString())
      .filter(id => id);

    const hasAccess = doctorHospitalIds.some(hospitalId =>
      allHospitalIds.includes(hospitalId)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this doctor. Doctor is not affiliated with any hospital in your cluster or verified by you.'
      });
    }

    const doctorObj = doctor.toObject();

    // Get appointments with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const appointments = await Appointment.find({ doctor: doctor._id })
      .populate('patient', 'fullName email phoneNumber profilePicture')
      .populate('payment')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalAppointments = await Appointment.countDocuments({ doctor: doctor._id });

    // Get appointment statistics
    const allAppointments = await Appointment.find({ doctor: doctor._id }).lean();
    const completed = allAppointments.filter(a => a.status === 'completed').length;
    const confirmed = allAppointments.filter(a => a.status === 'confirmed').length;
    const upcoming = allAppointments.filter(a =>
      a.status === 'pending' || a.status === 'confirmed'
    ).length;
    const cancelled = allAppointments.filter(a => a.status === 'cancelled').length;
    const noshow = allAppointments.filter(a => a.status === 'no_show').length;

    // Calculate revenue
    const completedAppointments = allAppointments.filter(a => a.status === 'completed');
    let totalRevenue = 0;
    for (const apt of completedAppointments) {
      const payment = await Payment.findOne({
        appointment: apt._id,
        status: 'captured'
      });
      if (payment) {
        totalRevenue += payment.amount || 0;
      }
    }

    // Calculate monthly appointments (last 6 months)
    const monthlyAppointments = [];
    const monthlyRevenue = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = monthDate.toLocaleString('en-US', { month: 'short' });

      const monthAppts = allAppointments.filter(a => {
        const apptDate = new Date(a.date);
        return apptDate >= monthDate && apptDate < nextMonth;
      });

      monthlyAppointments.push({
        month: monthName,
        count: monthAppts.length
      });

      let monthRevenue = 0;
      for (const apt of monthAppts.filter(a => a.status === 'completed')) {
        const payment = await Payment.findOne({
          appointment: apt._id,
          status: 'captured'
        });
        if (payment) {
          monthRevenue += payment.amount || 0;
        }
      }

      monthlyRevenue.push({
        month: monthName,
        amount: monthRevenue
      });
    }

    // Count unique patients
    const uniquePatients = new Set(allAppointments.map(a => a.patient?.toString())).size;

    // Calculate patient satisfaction (based on ratings >= 4)
    const ratedAppointments = allAppointments.filter(a => a.review && a.review.rating);
    const satisfiedCount = ratedAppointments.filter(a => a.review.rating >= 4).length;
    const patientSatisfaction = ratedAppointments.length > 0
      ? Math.round((satisfiedCount / ratedAppointments.length) * 100)
      : 0;

    // Format current affiliation
    const currentAffiliation = doctorObj.hospitalAffiliations?.find(
      aff => aff.currentlyWorking
    );

    // Format hospital affiliations for UI
    const formattedAffiliations = (doctorObj.hospitalAffiliations || []).map(aff => ({
      hospitalName: aff.hospital?.name || aff.hospitalName || '-',
      department: aff.department || 'General Medicine',
      position: aff.position || 'Consultant',
      currentlyWorking: aff.currentlyWorking || false
    }));

    // Format documents (ensure all required documents are present)
    const documentTypes = [
      { id: "medicalDegree", label: "Medical Degree Certificate", required: true },
      { id: "internship", label: "Internship Completion Certificate", required: true },
      { id: "registrationCertificate", label: "Registration Certificate (NMC/State)", required: true },
      { id: "idProof", label: "Government ID (Aadhaar/PAN)", required: true },
      { id: "affiliationProof", label: "Hospital Affiliation/Clinic Establishment Proof", required: true }
    ];

    const documents = documentTypes.map(docType => {
      const existingDoc = doctorObj.documents?.find(d => d.id === docType.id || d.type === docType.id);
      return {
        id: docType.id,
        label: docType.label,
        required: docType.required,
        filename: existingDoc?.filename || existingDoc?.name || null,
        sizeKB: existingDoc?.size ? Math.round(existingDoc.size / 1024) : null,
        type: existingDoc?.mimetype || existingDoc?.type || null,
        verified: existingDoc?.verified || false
      };
    });

    // Format appointments for UI
    const formattedAppointments = appointments.map(a => ({
      id: a._id.toString(),
      patient: {
        fullName: a.patient?.fullName || '-'
      },
      appointmentType: a.appointmentType,
      date: a.date,
      slot: {
        startTime: a.slot?.startTime || '--',
        endTime: a.slot?.endTime || '--'
      },
      status: a.status,
      review: a.review ? {
        rating: a.review.rating
      } : null,
      payment: {
        amount: a.payment?.amount || 0,
        status: a.payment?.status || 'pending'
      }
    }));

    // Build enriched doctor profile
    const enrichedDoctor = {
      id: doctorObj._id.toString(),
      title: doctorObj.title || 'Dr.',
      fullName: doctorObj.fullName || doctorObj.user?.fullName || '-',
      specialty: doctorObj.specializations?.[0] || doctorObj.specialization || 'General Medicine',
      specializations: doctorObj.specializations?.[0] || doctorObj.specialization || 'General Medicine',
      registrationNumber: doctorObj.registrationNumber || '-',
      experience: doctorObj.experience || 0,

      // Hospital affiliations
      hospitalAffiliations: formattedAffiliations,

      // Address
      address: {
        city: doctorObj.address?.city || '-',
        state: doctorObj.address?.state || '-',
        country: doctorObj.address?.country || 'India',
        pincode: doctorObj.address?.pincode || doctorObj.address?.zipCode || '-'
      },

      // Contact
      contact: {
        phone: doctorObj.user?.phoneNumber || doctorObj.phoneNumber || '-',
        email: doctorObj.user?.email || doctorObj.email || '-'
      },

      // User details
      user: {
        dateOfBirth: doctorObj.user?.dateOfBirth || null,
        gender: doctorObj.user?.gender || doctorObj.gender || null
      },

      // Statistics
      stats: {
        totalAppointments: totalAppointments,
        totalPatients: uniquePatients,
        totalRevenue: totalRevenue,
        averageRating: doctorObj.review?.averageRating || doctorObj.averageRating || 0,
        patientSatisfaction: patientSatisfaction,
        monthlyAppointments: monthlyAppointments,
        monthlyRevenue: monthlyRevenue,
        breakdown: {
          completed: completed,
          confirmed: confirmed,
          cancelled: cancelled,
          noshow: noshow,
          upcoming: upcoming
        }
      },

      // Verification details
      verification: {
        personalVerified: doctorObj.verification?.personalVerified || false,
        regNumberVerified: doctorObj.verification?.regNumberVerified || false,
        experienceVerified: doctorObj.verification?.experienceVerified || false,
        status: doctorObj.verification?.status || doctorObj.status || 'pending',
        reviewer: doctorObj.verification?.reviewer || null,
        lastReviewedAt: doctorObj.verification?.lastReviewedAt || null,
        rejectionReason: doctorObj.verification?.rejectionReason || ''
      },

      // Documents
      documents: documents,

      // Assignments
      assignments: {
        scheduler: doctorObj.assignments?.scheduler || null,
        reviewer: doctorObj.assignments?.reviewer || null,
        relationshipManager: doctorObj.assignments?.relationshipManager || null
      },

      // Image
      imageUrl: doctorObj.user?.profilePicture || doctorObj.profilePicture ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(doctorObj.fullName || 'Doctor')}&background=00B5A3&color=fff`,

      // Status
      status: doctorObj.isActive ? 'active' : (doctorObj.status || 'pending'),
      isActive: doctorObj.isActive,

      // Audit trail
      audit: {
        createdAt: doctorObj.createdAt,
        updatedAt: doctorObj.updatedAt,
        createdBy: doctorObj.createdBy || 'system',
        updatedBy: doctorObj.updatedBy || 'system'
      },

      // Additional fields
      qualifications: doctorObj.qualifications || [],
      languages: doctorObj.languages || [],
      bio: doctorObj.bio || '',
      clinicConsultationFee: doctorObj.clinicConsultationFee?.consultationFee || 0,
      onlineConsultationFee: doctorObj.onlineConsultation?.consultationFee || 0,
      meetingLink: doctorObj.meetingLink || null
    };

    res.status(200).json({
      success: true,
      data: enrichedDoctor,
      appointments: formattedAppointments,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalAppointments / parseInt(limit)),
        totalAppointments: totalAppointments,
        limit: parseInt(limit),
        hasNextPage: skip + appointments.length < totalAppointments,
        hasPrevPage: parseInt(page) > 1
      }
    });

  } catch (error) {
    console.error('Get doctor by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching doctor',
      error: error.message
    });
  }
};

/**
 * @desc    Create new doctor
 * @route   POST /api/doctors
 * @access  Private/Admin
 */
exports.createDoctor = async (req, res) => {
  try {
    const {
      userId,
      firstName,
      lastName,
      email,
      mobileNumber,
      specialization,
      experience,
      registrationNumber,
      clinicType,
      hospitalName,
      clinicName,
      qualifications,
      languages,
      bio,
      clinicConsultationFee,
      onlineConsultationFee,
      meetingLink
    } = req.body;

    // Check if user exists or create new user
    let user;
    if (userId) {
      user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    } else {
      // Create new user for the doctor
      user = await User.create({
        fullName: `${firstName} ${lastName}`,
        email: email,
        phoneNumber: mobileNumber,
        role: 'doctor',
        password: Math.random().toString(36).slice(-8) // Generate temporary password
      });
    }

    // Check if doctor already exists for this user
    const existingDoctor = await Doctor.findOne({ user: user._id });
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: 'Doctor profile already exists for this user'
      });
    }

    // Find hospital if hospital type
    let hospitalAffiliations = [];
    if (clinicType === 'hospital' && hospitalName) {
      const hospital = await Hospital.findOne({
        name: new RegExp(hospitalName, 'i')
      });

      if (hospital) {
        hospitalAffiliations.push({
          hospital: hospital._id,
          position: 'Consultant',
          currentlyWorking: true,
          from: new Date()
        });
      }
    }

    const doctorData = {
      user: user._id,
      fullName: `${firstName} ${lastName}`,
      specializations: [specialization],
      registrationNumber,
      experience: experience || 0,
      qualifications: qualifications || [],
      languages: languages || ['English'],
      bio: bio || '',
      clinicConsultationFee: {
        consultationFee: clinicConsultationFee || 0
      },
      onlineConsultation: {
        consultationFee: onlineConsultationFee || 0
      },
      hospitalAffiliations,
      meetingLink: meetingLink || `https://meet.example.com/${user._id}`,
      isActive: false // Requires verification
    };

    const doctor = await Doctor.create(doctorData);

    // Update user role
    await User.findByIdAndUpdate(user._id, { role: 'doctor' });

    res.status(201).json({
      success: true,
      message: 'Doctor created successfully',
      data: {
        id: doctor._id,
        name: doctor.fullName,
        specialty: doctor.specializations[0],
        registrationNumber: doctor.registrationNumber,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Create doctor error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Doctor with this registration number already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating doctor',
      error: error.message
    });
  }
};

/**
 * @desc    Update doctor
 * @route   PUT /api/doctors/:id
 * @access  Private/Admin
 */
exports.updateDoctor = async (req, res) => {
  try {
    const adminId = req.user._id;

    // Step 1: Find cluster and verify access
    const cluster = await Cluster.findOne({ user: adminId }).populate('hospitals');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No cluster found for this admin'
      });
    }

    const hospitalIds = cluster.hospitals.map(h => h._id);

    // Get hospitals verified by this admin
    const verifiedHospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });

    const verifiedHospitalIds = verifiedHospitals.map(h => h._id);
    const allHospitalIds = [...new Set([...hospitalIds.map(id => id.toString()), ...verifiedHospitalIds.map(id => id.toString())])];

    // Step 2: Find the doctor
    let doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Step 3: Verify access
    const doctorHospitalIds = doctor.hospitalAffiliations
      .map(aff => aff.hospital?.toString())
      .filter(id => id);

    const hasAccess = doctorHospitalIds.some(hospitalId =>
      allHospitalIds.includes(hospitalId)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to update this doctor'
      });
    }

    const updateData = { ...req.body };

    // Handle specialization update
    if (req.body.specialization && !req.body.specializations) {
      updateData.specializations = [req.body.specialization];
    }

    doctor = await Doctor.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    ).populate('user', 'fullName email phoneNumber');

    res.status(200).json({
      success: true,
      message: 'Doctor updated successfully',
      data: {
        id: doctor._id,
        name: doctor.fullName,
        specialty: doctor.specializations[0],
        isActive: doctor.isActive
      }
    });

  } catch (error) {
    console.error('Update doctor error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating doctor',
      error: error.message
    });
  }
};

/**
 * @desc    Verify/Approve doctor
 * @route   POST /api/doctors/:id/verify
 * @access  Private/Admin
 */
exports.verifyDoctor = async (req, res) => {
  try {
    const { status, reason } = req.body;
    const adminId = req.user._id;

    // Step 1: Verify admin access
    const cluster = await Cluster.findOne({ user: adminId }).populate('hospitals');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No cluster found for this admin'
      });
    }

    const hospitalIds = cluster.hospitals.map(h => h._id);

    const verifiedHospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });

    const verifiedHospitalIds = verifiedHospitals.map(h => h._id);
    const allHospitalIds = [...new Set([...hospitalIds.map(id => id.toString()), ...verifiedHospitalIds.map(id => id.toString())])];

    // Step 2: Find doctor
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Step 3: Verify access
    const doctorHospitalIds = doctor.hospitalAffiliations
      .map(aff => aff.hospital?.toString())
      .filter(id => id);

    const hasAccess = doctorHospitalIds.some(hospitalId =>
      allHospitalIds.includes(hospitalId)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to verify this doctor'
      });
    }

    if (status === 'approved') {
      doctor.isActive = true;
      await doctor.save();

      res.status(200).json({
        success: true,
        message: 'Doctor approved successfully',
        data: {
          id: doctor._id,
          name: doctor.fullName,
          status: 'active'
        }
      });
    } else if (status === 'rejected') {
      doctor.isActive = false;
      await doctor.save();

      // TODO: Send notification to doctor about rejection with reason

      res.status(200).json({
        success: true,
        message: 'Doctor verification rejected',
        data: {
          id: doctor._id,
          name: doctor.fullName,
          status: 'pending',
          reason: reason || 'Verification requirements not met'
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification status'
      });
    }

  } catch (error) {
    console.error('Verify doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying doctor',
      error: error.message
    });
  }
};

/**
 * @desc    Delete doctor
 * @route   DELETE /api/doctors/:id
 * @access  Private/Admin
 */
exports.deleteDoctor = async (req, res) => {
  try {
    const adminId = req.user._id;

    // Step 1: Verify admin access
    const cluster = await Cluster.findOne({ user: adminId }).populate('hospitals');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No cluster found for this admin'
      });
    }

    const hospitalIds = cluster.hospitals.map(h => h._id);

    const verifiedHospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });

    const verifiedHospitalIds = verifiedHospitals.map(h => h._id);
    const allHospitalIds = [...new Set([...hospitalIds.map(id => id.toString()), ...verifiedHospitalIds.map(id => id.toString())])];

    // Step 2: Find doctor
    const doctor = await Doctor.findById(req.params.id);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    // Step 3: Verify access
    const doctorHospitalIds = doctor.hospitalAffiliations
      .map(aff => aff.hospital?.toString())
      .filter(id => id);

    const hasAccess = doctorHospitalIds.some(hospitalId =>
      allHospitalIds.includes(hospitalId)
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to delete this doctor'
      });
    }

    // Check for active appointments
    const activeAppointments = await Appointment.countDocuments({
      doctor: doctor._id,
      status: { $in: ['pending', 'confirmed'] }
    });

    if (activeAppointments > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete doctor with active appointments'
      });
    }

    await doctor.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Doctor deleted successfully'
    });

  } catch (error) {
    console.error('Delete doctor error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting doctor',
      error: error.message
    });
  }
};

/**
 * @desc    Get doctor statistics/analytics
 * @route   GET /api/doctors/analytics/stats
 * @access  Private/Admin
 */
exports.getDoctorStats = async (req, res) => {
  try {
    const adminId = req.user._id;

    // Step 1: Get cluster owned by this admin
    const cluster = await Cluster.findOne({ user: adminId }).populate('hospitals');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No cluster found for this admin'
      });
    }

    const hospitalIds = cluster.hospitals.map(h => h._id);

    // Get verified hospitals under this admin
    const verifiedHospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });

    const verifiedHospitalIds = verifiedHospitals.map(h => h._id);
    const allHospitalIds = [...new Set([
      ...hospitalIds.map(id => id.toString()),
      ...verifiedHospitalIds.map(id => id.toString())
    ])];

    // Step 2: Get doctors affiliated with these hospitals
    const doctors = await Doctor.find({
      'hospitalAffiliations.hospital': { $in: allHospitalIds }
    });

    const totalDoctors = doctors.length;
    const activeDoctors = doctors.filter(d => d.isActive).length;
    const pendingDoctors = totalDoctors - activeDoctors;

    // Specialty distribution
    const specialtyCount = {};
    doctors.forEach(doc => {
      const specialty = doc.specializations?.[0] || 'General Medicine';
      specialtyCount[specialty] = (specialtyCount[specialty] || 0) + 1;
    });

    // Step 3: Revenue & appointments logic
    const doctorIds = doctors.map(d => d._id);

    // Get all appointments including completed and canceled
    const appointments = await Appointment.find({
      doctor: { $in: doctorIds },
      status: { $in: ['completed', 'cancelled'] } // Include both completed and cancelled
    }).populate('payment');

    let totalRevenue = 0;
    let totalAppointments = 0;
    let completedAppointments = 0;
    let cancelledAppointments = 0;
    let totalFee = 0;
    let platformFee = 0;
    let gstAmount = 0;
    let originalFee = 0;
    let refundAmount = 0;

    for (const apt of appointments) {
      let paymentData = apt.payment;

      // Fallback if not populated
      if (!paymentData) {
        paymentData = await Payment.findOne({ appointment: apt._id });
      }

      if (paymentData) {
        if (apt.status === 'completed' && paymentData.status === 'captured') {
          totalAppointments++;
          completedAppointments++;

          const amount = paymentData.amount || 0;
          const gstAmountValue = paymentData.gstamount || 0;
          const totalAmount = paymentData.totalamount || (amount + gstAmountValue);

          // Calculate 20% platform fee
          const currentPlatformFee = totalAmount * 0.2;

          totalFee += totalAmount;
          gstAmount += gstAmountValue;
          originalFee += amount;
          platformFee += currentPlatformFee;
          totalRevenue += currentPlatformFee; // use platform fee as revenue
        }
        else if (apt.status === 'cancelled') {
          cancelledAppointments++;

          // Add cancellation refund data if available
          if (apt.cancellation && apt.cancellation.refundAmount) {
            refundAmount += apt.cancellation.refundAmount;
          }
        }
      }
    }

    // Step 4: Send aggregated results
    res.status(200).json({
      success: true,
      data: {
        totalDoctors,
        activeDoctors,
        pendingDoctors,
        totalAppointments: completedAppointments + cancelledAppointments,
        completedAppointments,
        cancelledAppointments,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalFee: parseFloat(totalFee.toFixed(2)),
        platformFee: parseFloat(platformFee.toFixed(2)),
        gstAmount: parseFloat(gstAmount.toFixed(2)),
        originalFee: parseFloat(originalFee.toFixed(2)),
        refundAmount: parseFloat(refundAmount.toFixed(2)),
        netRevenue: parseFloat((totalRevenue - refundAmount).toFixed(2)), // Net revenue after refunds
        specialtyDistribution: specialtyCount,
        cluster: cluster.clusterName,
        currency: "INR"
      }
    });

  } catch (error) {
    console.error('Get doctor stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching doctor statistics',
      error: error.message
    });
  }
};


exports.getAllDoctorsForadmin = async (req, res) => {
  try {
    const { 
      search, 
      hospital, 
      specialty, 
      status,
      isActive,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const adminId = req.user._id;

    // Step 1: Find cluster managed by this admin
    const cluster = await Cluster.findOne({ user: adminId }).populate('hospitals');

    if (!cluster) {
      return res.status(404).json({
        success: false,
        message: 'No cluster found for this admin'
      });
    }

    // Step 2: Get hospital IDs from the cluster
    const hospitalIds = cluster.hospitals.map(h => h._id);

    // Step 3: Also get doctors from hospitals verified by this admin
    const verifiedHospitals = await Hospital.find({
      'verification.verifiedBy': adminId,
      'verification.status': 'verified'
    });

    const verifiedHospitalIds = verifiedHospitals.map(h => h._id);
    
    // Combine hospital IDs (cluster + verified)
    const allHospitalIds = [...new Set([
      ...hospitalIds.map(id => id.toString()), 
      ...verifiedHospitalIds.map(id => id.toString())
    ])];

    // Build base query for doctors
    let doctorQuery = {
      'hospitalAffiliations.hospital': { $in: allHospitalIds }
    };

    // Apply filters to the database query for better performance
    if (specialty && specialty !== 'All') {
      doctorQuery.specializations = specialty;
    }

    if (isActive !== undefined) {
      doctorQuery.isActive = isActive === 'true';
    }

    // Calculate pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sort configuration
    const sortConfig = {};
    sortConfig[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination info
    const totalDoctors = await Doctor.countDocuments(doctorQuery);

    // Get paginated doctors with only essential fields populated
    const doctors = await Doctor.find(doctorQuery)
      .populate('user', 'fullName email phoneNumber profilePicture')
      .populate('hospitalAffiliations.hospital', 'name') // Only populate name field for hospital
      .select('_id fullName hospitalAffiliations user') // Removed unnecessary fields
      .sort(sortConfig)
      .skip(skip)
      .limit(limitNum);

    // Apply search filter after query if needed (since search might involve multiple fields)
    let filteredDoctors = doctors;
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredDoctors = doctors.filter(doctor => 
        doctor.fullName?.toLowerCase().includes(searchLower) ||
        doctor.user?.fullName?.toLowerCase().includes(searchLower) ||
        doctor.specializations?.some(s => s?.toLowerCase().includes(searchLower)) ||
        doctor.registrationNumber?.toLowerCase().includes(searchLower)
      );
    }

    // Simplified enrichment focusing on name, _id, and hospital details
    const enrichedDoctors = filteredDoctors.map((doctor) => {
      const doctorObj = doctor.toObject();

      // Determine primary hospital details
      const currentAffiliation = doctorObj.hospitalAffiliations?.find(
        aff => aff.currentlyWorking
      );
      
      const hospitalDetails = currentAffiliation?.hospital ? {
        _id: currentAffiliation.hospital._id,
        name: currentAffiliation.hospital.name
      } : null;

      // Get all hospital affiliations with only ID and name
      const allHospitalDetails = doctorObj.hospitalAffiliations?.map(aff => ({
        _id: aff.hospital?._id,
        name: aff.hospital?.name,
        currentlyWorking: aff.currentlyWorking,
        joiningDate: aff.joiningDate,
        leavingDate: aff.leavingDate
      })) || [];

      return {
        _id: doctorObj._id,
        name: doctorObj.fullName || doctorObj.user?.fullName || 'N/A',
        // Include user details if needed
        user: doctorObj.user ? {
          _id: doctorObj.user._id,
          fullName: doctorObj.user.fullName,
          email: doctorObj.user.email,
          phoneNumber: doctorObj.user.phoneNumber,
          profilePicture: doctorObj.user.profilePicture
        } : null,
        // Primary hospital (currently working)
        primaryHospital: hospitalDetails,
        // All hospital affiliations with only ID and name
        hospitalAffiliations: allHospitalDetails
        // Removed unnecessary fields: specializations, registrationNumber, isActive, experience, averageRating, totalRatings
      };
    });

    // Apply hospital name and status filters after enrichment
    let finalDoctors = enrichedDoctors;
    
    if (hospital && hospital !== 'All') {
      finalDoctors = enrichedDoctors.filter(d => 
        d.primaryHospital?.name === hospital || 
        d.hospitalAffiliations.some(aff => aff.name === hospital)
      );
    }

    if (status && status !== 'All') {
      finalDoctors = finalDoctors.filter(d => {
        if (status === 'active') return d.isActive;
        if (status === 'inactive') return !d.isActive;
        return true;
      });
    }

    // Calculate final pagination info
    const finalCount = finalDoctors.length;
    const totalPages = Math.ceil(totalDoctors / limitNum);
    const currentPage = pageNum;
    const hasNextPage = currentPage < totalPages;
    const hasPrevPage = currentPage > 1;

    res.status(200).json({
      success: true,
      data: {
        doctors: finalDoctors,
        pagination: {
          totalDoctors: totalDoctors,
          currentPage,
          totalPages,
          hasNextPage,
          hasPrevPage,
          limit: limitNum
        }
      }
    });

  } catch (error) {
    console.error('Get all doctors error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching doctors',
      error: error.message
    });
  }
};