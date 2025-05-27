const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const BankDetails = require('../models/BankDetails');
const Settings = require('../models/Settings');
const Wallet = require('../models/Wallet');
const Statistics = require('../models/Statistics');
const Payment = require("../models/Payment");
const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require("../models/Transaction");
const jwt = require('jsonwebtoken');

const specializationEnum = [
  // Primary Care
  "General Medicine",
  "Family Medicine",
  "Internal Medicine",
  "Pediatrics",
  "Geriatrics",

  // Surgical Specialties
  "General Surgery",
  "Orthopedics",
  "Neurosurgery",
  "Cardiothoracic Surgery",
  "Vascular Surgery",
  "Plastic Surgery",
  "Pediatric Surgery",
  "Urology",
  "Surgical Gastroenterology",
  "Surgical Oncology",
  "Transplant Surgery",
  "Laparoscopic Surgery",
  "Bariatric Surgery",
  "ENT (Otorhinolaryngology)",

  // Internal Medicine Subspecialties
  "Cardiology",
  "Pulmonology",
  "Gastroenterology",
  "Nephrology",
  "Endocrinology",
  "Rheumatology",
  "Hematology",
  "Oncology",
  "Medical Oncology",
  "Neurology",
  "Infectious Disease",
  "Diabetology",
  "Hepatology",

  // Women's Health
  "Obstetrics & Gynecology",
  "Gynecology",
  "Obstetrics",
  "Reproductive Medicine",
  "Gynecologic Oncology",
  "Fetal Medicine",

  // Mental Health
  "Psychiatry",
  "Child Psychiatry",
  "Addiction Medicine",

  // Eye & Vision
  "Ophthalmology",
  "Retina Specialist",
  "Glaucoma Specialist",
  "Cornea Specialist",

  // Dental
  "Dentistry",
  "Orthodontics",
  "Periodontics",
  "Endodontics",
  "Prosthodontics",
  "Oral and Maxillofacial Surgery",
  "Pediatric Dentistry",

  // Skin
  "Dermatology",
  "Cosmetology",
  "Trichology",

  // Diagnostic Specialties
  "Radiology",
  "Interventional Radiology",
  "Pathology",
  "Clinical Pathology",
  "Anatomical Pathology",
  "Nuclear Medicine",

  // Rehabilitation
  "Physical Medicine and Rehabilitation",
  "Physiotherapy",
  "Occupational Therapy",
  "Speech Therapy",

  // Alternative Medicine (Recognized in India)
  "Ayurveda",
  "Homeopathy",
  "Unani",
  "Siddha",
  "Naturopathy",
  "Yoga & Naturopathy",

  // Public Health
  "Public Health",
  "Community Medicine",
  "Preventive Medicine",
  "Epidemiology",

  // Other Specialties
  "Anesthesiology",
  "Critical Care Medicine",
  "Emergency Medicine",
  "Sports Medicine",
  "Pain Management",
  "Palliative Care",
  "Sleep Medicine",
  "Immunology",
  "Allergy and Immunology",
  "Aviation Medicine",
  "Forensic Medicine",
  "Nutrition",
  "Neonatology",
  "Clinical Genetics",
  "Venereology",
  "Transfusion Medicine"
];

// Helper functions
const createDefaultWallet = async (doctorId) => {
  try {
    const newWallet = new Wallet({
      doctor: doctorId,
      current_balance: 0,
      total_earned: 0,
      total_withdrawn: 0,
      total_spent: 0,
      commission_rate: 10, // Default commission rate
      last_payment_date: null,
      last_withdrawal_date: null
    });

    await newWallet.save();

    // Also create default statistics
    const newStatistics = new Statistics({
      doctor: doctorId,
      average_rating: 0,
      total_ratings: 0,
      appointment_count: 0,
      total_earnings: 0
    });

    await newStatistics.save();

    return { wallet: newWallet, statistics: newStatistics };
  } catch (error) {
    throw new Error(`Error creating wallet: ${error.message}`);
  }
};

const calculateDistance = (coords1, coords2) => {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;

  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km

  return distance;
};


function getDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lng - coord1.lng);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const distance = R * c;
  return distance * 1000; // Convert to meters
}

function toRad(value) {
  return value * Math.PI / 180;
}


const sanitizeRegex = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const DoctorController = {
  // Register a new doctor
  registerDoctor: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        title,
        specializations,
        registrationNumber,
        qualifications,
        experience,
        languages,
        bio,
        clinicConsultationFee,
        followUpFee,
        services,
        onlineConsultation,
        latitude,
        longitude
      } = req.body;

      // Validate coordinates
      if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          success: false, 
          message: 'Valid latitude and longitude are required' 
        });
      }

      const existingUser = await User.findById(req.user.id).session(session);
      if (!existingUser) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          success: false, 
          message: 'User profile does not exist for this Doctor.' 
        });
      }

      // Create new doctor
      const newDoctor = new Doctor({
        user: req.user.id,
        title: title || 'Dr.',
        specializations: specializations || [],
        registrationNumber,
        qualifications: qualifications || [],
        experience: experience || 0,
        languages: languages || [],
        bio: bio || '',
        clinicConsultationFee: clinicConsultationFee || 0,
        followUpFee: followUpFee || 0,
        services: services || [],
        onlineConsultation: onlineConsultation || { 
          isAvailable: false, 
          consultationFee: 0 
        },
        location: {
          type: "Point",
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        verification: {
          status: 'pending',
          documents: req.files ? req.files.map(file => file.path) : [],
          verifiedAt: null
        },
        isActive: false
      });

      await newDoctor.save({ session });

      // Cluster assignment logic using geospatial query
      let assignedCluster = null;
      
      // 1. Find clusters that contain this doctor's location within their radius
      const containingClusters = await Cluster.find({
        location: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: newDoctor.location.coordinates
            },
            $maxDistance: 10000 // Search within 10km radius (adjust as needed)
          }
        },
        isActive: true
      }).session(session);

      // 2. Check which cluster actually contains the doctor (within its radius)
      for (const cluster of containingClusters) {
        const distance = getDistance(
          { 
            lat: newDoctor.location.coordinates[1], 
            lng: newDoctor.location.coordinates[0] 
          },
          { 
            lat: cluster.location.coordinates[1], 
            lng: cluster.location.coordinates[0] 
          }
        );
        
        if (distance <= cluster.radius) {
          assignedCluster = cluster;
          break;
        }
      }
      
      // 3. If not in any cluster, find nearest active cluster
      if (!assignedCluster) {
        const nearestCluster = await Cluster.findOne({
          isActive: true
        })
        .sort({
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: newDoctor.location.coordinates
              }
            }
          }
        })
        .session(session);

        if (nearestCluster) {
          assignedCluster = nearestCluster;
        }
      }
      
      // 4. Add doctor to the assigned cluster if found
      if (assignedCluster) {
        // Check if doctor already exists in cluster to prevent duplicates
        if (!assignedCluster.doctors.includes(req.user.id)) {
          assignedCluster.doctors.push(req.user.id);
          await assignedCluster.save({ session });
        }
      }

      // Create default settings for the doctor
      const newSettings = new Settings({
        user: req.user.id,
        email_notifications: true,
        sms_notifications: true,
        push_notifications: true,
        auto_withdraw: false,
        auto_withdraw_threshold: 5000,
        payment_method: 'bank_transfer'
      });

      await newSettings.save({ session });

      // Update user with doctor reference
      existingUser.doctorId = newDoctor._id;
      await existingUser.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(201).json({
        success: true,
        message: 'Doctor registered successfully',
        doctor: newDoctor,
        settings: newSettings,
        cluster: assignedCluster ? {
          id: assignedCluster._id,
          name: assignedCluster.clusterName,
          distance: assignedCluster ? getDistance(
            { 
              lat: newDoctor.location.coordinates[1], 
              lng: newDoctor.location.coordinates[0] 
            },
            { 
              lat: assignedCluster.location.coordinates[1], 
              lng: assignedCluster.location.coordinates[0] 
            }
          ) : null
        } : null
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error in registerDoctor: ", error);
      res.status(500).json({
        success: false,
        message: 'Error registering doctor',
        error: error.message
      });
    }
  },

  // Ad d or update hospital affiliations
  addHospitalAffiliation: async (req, res) => {
    try {
      const { doctorId } = req.params;
      const { hospitalId, department, position } = req.body;

      // Check if doctor exists
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Check if hospital exists
      const hospital = await Hospital.findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({ success: false, message: 'Hospital not found' });
      }

      // Add doctor to hospital's doctors array if not already added
      if (!hospital.doctors.includes(doctorId)) {
        hospital.doctors.push(doctorId);
        await hospital.save();
      }

      // Check if doctor is already affiliated with this hospital
      const existingAffiliation = doctor.hospitalAffiliations.find(
        affiliation => affiliation.hospital.toString() === hospitalId
      );

      if (existingAffiliation) {
        // Update existing affiliation
        existingAffiliation.department = department;
        existingAffiliation.position = position;
      } else {
        // Add new affiliation
        doctor.hospitalAffiliations.push({
          hospital: hospitalId,
          department,
          position
        });
      }

      await doctor.save();

      res.status(200).json({
        success: true,
        message: 'Hospital affiliation added/updated successfully',
        affiliation: doctor.hospitalAffiliations.find(a => a.hospital.toString() === hospitalId)
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error adding hospital affiliation',
        error: error.message
      });
    }
  },

  // Register a new hospital
  registerHospital: async (req, res) => {
    try {
      const {
        name,
        type,
        about,
        specialties,
        facilities,
        address,
        contact,
        services,
        featuredImage,
        photos
      } = req.body;

      // Check if hospital already exists with this name and address
      const existingHospital = await Hospital.findOne({
        name,
        'address.city': address.city,
        'address.street': address.street
      });

      if (existingHospital) {
        return res.status(400).json({
          success: false,
          message: 'Hospital already exists with this name and address',
          hospital: existingHospital
        });
      }

      // Create new hospital
      const newHospital = new Hospital({
        name,
        type: type || 'private',
        about: about || '',
        specialties: specialties || [],
        facilities: facilities || [],
        address: {
          street: address.street,
          city: address.city,
          state: address.state,
          country: address.country || 'India',
          pinCode: address.pinCode,
          coordinates: address.coordinates || undefined
        },
        contact: {
          phone: contact.phone,
          email: contact.email,
          website: contact.website
        },
        services: {
          emergency: services?.emergency || false,
          ambulance: services?.ambulance || false,
          insuranceSupport: services?.insuranceSupport || false
        },
        verification: {
          status: 'pending',
          verifiedAt: null
        },
        featuredImage: featuredImage || "",
        photos: photos || [],
        addedBy: req.user.id
      });

      await newHospital.save();
      await Doctor.findOneAndUpdate({ user: req.user.id }, {
        address: {
          street: address.street,
          city: address.city,
          state: address.state,
          country: address.country || 'India',
          pinCode: address.pinCode,
          coordinates: address.coordinates || undefined
        },
      })

      res.status(201).json({
        success: true,
        message: 'Hospital registered successfully',
        hospital: newHospital
      });
    } catch (error) {
      console.log("Error in the registerHospital: ", error);
      res.status(500).json({
        success: false,
        message: 'Error registering hospital',
        error: error.message
      });
    }
  },

  // Add bank details for a doctor
  addBankDetails: async (req, res) => {
    try {
      const { doctorId } = req.params;
      const {
        account_num,
        account_name,
        bank_name,
        IFSC_code,
        UPI_id
      } = req.body;

      // Check if doctor exists
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Check if bank details already exist for this doctor
      let bankDetails = await BankDetails.findOne({ doctor: doctorId });

      if (bankDetails) {
        // Update existing bank details
        bankDetails.account_num = account_num;
        bankDetails.account_name = account_name;
        bankDetails.bank_name = bank_name;
        bankDetails.IFSC_code = IFSC_code;
        bankDetails.UPI_id = UPI_id || bankDetails.UPI_id;
        bankDetails.is_verified = false; // Reset verification status on update
      } else {
        // Create new bank details
        bankDetails = new BankDetails({
          doctor: doctorId,
          account_num,
          account_name,
          bank_name,
          IFSC_code,
          UPI_id: UPI_id || '',
          is_verified: false
        });
      }

      await bankDetails.save();

      res.status(200).json({
        success: true,
        message: 'Bank details added/updated successfully',
        bankDetails
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error adding bank details',
        error: error.message
      });
    }
  },

  // Update doctor settings
  updateSettings: async (req, res) => {
    try {
      const { userId } = req.params;
      const {
        email_notifications,
        sms_notifications,
        push_notifications,
        auto_withdraw,
        auto_withdraw_threshold,
        payment_method
      } = req.body;

      // Find settings or create if not exists
      let settings = await Settings.findOne({ user_id: userId });

      if (!settings) {
        settings = new Settings({
          user_id: userId,
          email_notifications: true,
          sms_notifications: true,
          push_notifications: true,
          auto_withdraw: false,
          auto_withdraw_threshold: 5000,
          payment_method: 'bank_transfer'
        });
      }

      // Update settings
      if (email_notifications !== undefined) settings.email_notifications = email_notifications;
      if (sms_notifications !== undefined) settings.sms_notifications = sms_notifications;
      if (push_notifications !== undefined) settings.push_notifications = push_notifications;
      if (auto_withdraw !== undefined) settings.auto_withdraw = auto_withdraw;
      if (auto_withdraw_threshold !== undefined) settings.auto_withdraw_threshold = auto_withdraw_threshold;
      if (payment_method !== undefined) settings.payment_method = payment_method;

      await settings.save();

      res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        settings
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error updating settings',
        error: error.message
      });
    }
  },

  // Admin approval for doctor
  adminApproval: async (req, res) => {
    try {
      const { doctorId } = req.params;
      const { status, comments } = req.body;

      // Validate status
      if (status !== 'verified' && status !== 'rejected') {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Status must be either "verified" or "rejected"'
        });
      }

      // Check if doctor exists
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Update verification status
      doctor.verification.status = status;
      doctor.verification.verifiedAt = status === 'verified' ? new Date() : null;

      // Add admin verification
      doctor.verifiedByAdmin = {
        admin: req.user.id,
        verifiedAt: status === 'verified' ? new Date() : null,
        comments: comments || ''
      };

      await doctor.save();

      res.status(200).json({
        success: true,
        message: `Doctor ${status === 'verified' ? 'approved' : 'rejected'} by admin`,
        doctor
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error in admin approval process',
        error: error.message
      });
    }
  },

  // Super Admin approval for doctor
  superAdminApproval: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { doctorId } = req.params;
      const { status, comments } = req.body;

      // Validate status
      if (status !== 'verified' && status !== 'rejected') {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Status must be either "verified" or "rejected"'
        });
      }

      // Check if doctor exists
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Check if admin has already verified
      if (!doctor.verifiedByAdmin || !doctor.verifiedByAdmin.admin) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Doctor must be verified by admin first'
        });
      }

      // Update verification status
      doctor.verification.status = status;
      doctor.verification.verifiedAt = status === 'verified' ? new Date() : null;

      // Add super admin verification
      doctor.verifiedBySuperAdmin = {
        superAdmin: req.user.id,
        verifiedAt: status === 'verified' ? new Date() : null,
        comments: comments || ''
      };

      // Set doctor as active if verified
      doctor.isActive = status === 'verified';

      await doctor.save({ session });

      // If doctor is verified, create wallet and statistics
      if (status === 'verified') {
        await createDefaultWallet(doctorId);
      }

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: `Doctor ${status === 'verified' ? 'approved' : 'rejected'} by super admin`,
        doctor
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      res.status(500).json({
        success: false,
        message: 'Error in super admin approval process',
        error: error.message
      });
    }
  },

  // Get doctor profile
  getDoctorProfile: async (req, res) => {
    try {
      const { doctorId } = req.params;      

      const doctor = await Doctor.findById(doctorId)
        .populate('user', 'fullName email gender countryCode mobileNumber profilePhoto age')
        .populate('hospitalAffiliations.hospital', 'name address contact');

      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }

      // Get associated wallet, bank details, and statistics
      const [wallet, bankDetails, statistics] = await Promise.all([
        Wallet.findOne({ doctor: doctorId }),
        BankDetails.findOne({ doctor: doctorId }),
        Statistics.findOne({ doctor: doctorId })
      ]);

      res.status(200).json({
        success: true,
        doctor,
        wallet: wallet || null,
        bankDetails: bankDetails || null,
        statistics: statistics || null
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching doctor profile',
        error: error.message
      });
    }
  },

  getDoctorsBySpecializations: async (req, res) => {
    try {
      // Extract specializations array from request body 
      const { specializations } = req.body;

      // Validate specializations input
      if (!specializations || !Array.isArray(specializations) || specializations.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide at least one specialization in the specializations array'
        });
      }

      // Build base query for active doctors
      const query = {
        isActive: true,
        'verification.status': 'verified'
      };

      // Filter by specializations - doctors who have ANY of the specializations in the array
      query.specializations = { $in: specializations };

      // Execute query with population of hospital affiliations
      const doctors = await Doctor.find(query)
        .populate('user', 'fullName profilePhoto _id')
        .populate({
          path: 'hospitalAffiliations.hospital',
          model: 'Hospital',
          select: 'name type address contact services specialties featuredImage'
        })
        .sort({ experience: -1 })
        .lean();

      // Get total count
      const total = doctors.length;

      // Format the response data with hospital details
      const formattedDoctors = doctors.map(doctor => {
        // Format hospital affiliations with meaningful details
        const hospitalDetails = doctor.hospitalAffiliations.map(affiliation => {
          return {
            hospitalInfo: affiliation.hospital,
            department: affiliation.department,
            position: affiliation.position
          };
        });

        return {
          ...doctor,
          hospitalAffiliations: hospitalDetails
        };
      });

      // Return formatted response with hospital details
      res.json({
        success: true,
        data: formattedDoctors,
        total
      });

    } catch (error) {
      console.error('Get doctors by specializations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctors by specializations',
        error: error.message
      });
    }
  },

  searchDoctors: async (req, res) => {
    try {
      const {
        specialization,
        doctorName,
        hospitalName,
        page = 1,
        limit = 15,
        city,
        state,
        pinCode,
        searchType
      } = req.query;

      // Validate and parse pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(Math.max(1, parseInt(limit)), 100);

      // Build query - only active and verified doctors
      const baseQuery = {
        isActive: true,
        // 'verification.status': 'verified' // Changed from boolean to string match
      };

      // Add search filters for doctors
      let doctorQuery = { ...baseQuery };

      // Location filters for doctors
      if (city) {
        doctorQuery['address.city'] = {
          $regex: sanitizeRegex(city),
          $options: 'i'
        };
      }

      if (state) {
        doctorQuery['address.state'] = {
          $regex: sanitizeRegex(state),
          $options: 'i'
        };
      }

      if (pinCode) {
        doctorQuery['address.pinCode'] = String(pinCode).trim();
      }

      // Build hospital query
      const hospitalQuery = {};

      // Location filters for hospitals
      if (city) {
        hospitalQuery['address.city'] = {
          $regex: sanitizeRegex(city),
          $options: 'i'
        };
      }

      if (state) {
        hospitalQuery['address.state'] = {
          $regex: sanitizeRegex(state),
          $options: 'i'
        };
      }

      if (pinCode) {
        hospitalQuery['address.pinCode'] = String(pinCode).trim();
      }

      // Add specific search criteria based on searchType
      if (searchType === 'specialization' && specialization) {
        // Search for doctors who have this specialization in their array
        doctorQuery.specializations = {
          $elemMatch: {
            $regex: sanitizeRegex(specialization),
            $options: 'i'
          }
        };
      } else if (searchType === 'doctor' && doctorName) {
        // Search for doctors by name
        doctorQuery.fullName = {
          $regex: sanitizeRegex(doctorName),
          $options: 'i'
        };
      } else if (searchType === 'hospital' && hospitalName) {
        // Add hospital name to hospital query
        hospitalQuery.name = {
          $regex: sanitizeRegex(hospitalName),
          $options: 'i'
        };
      }

      let doctors = [];
      let hospitals = [];
      let totalDoctors = 0;
      let totalHospitals = 0;
      let hospitalIds = [];
      let doctorHospitalIds = new Set();

      // Skip values for pagination
      const skip = (pageNum - 1) * limitNum;

      // SEARCH FLOW 1: If searching by doctor name or specialization
      if (searchType === 'doctor' || searchType === 'specialization') {
        // First find doctors matching the criteria
        doctors = await Doctor.find(doctorQuery)
          .populate('user', 'fullName profilePhoto _id')
          .populate({
            path: 'hospitalAffiliations.hospital',
            select: 'name address type services _id',
            // Temporarily remove the match filter to see all hospitals
            // match: { isActive: true }
          })
          .sort({ experience: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean();

        totalDoctors = await Doctor.countDocuments(doctorQuery);

        // Extract hospital IDs from all doctor affiliations to find hospitals
        doctors.forEach(doctor => {
          if (doctor.hospitalAffiliations && Array.isArray(doctor.hospitalAffiliations)) {
            doctor.hospitalAffiliations.forEach(affiliation => {
              if (affiliation && affiliation.hospital && affiliation.hospital._id) {
                doctorHospitalIds.add(affiliation.hospital._id.toString());
              }
            });
          }
        });

        // Find hospitals associated with these doctors
        if (doctorHospitalIds.size > 0) {
          hospitals = await Hospital.find({
            _id: { $in: Array.from(doctorHospitalIds) }
          })
            .select('_id name address type ratings services')
            .sort({ name: 1 })
            .lean();

          totalHospitals = hospitals.length;
        }
      }
      // SEARCH FLOW 2: If searching by hospital name
      else if (searchType === 'hospital') {
        // First find hospitals matching the criteria
        hospitals = await Hospital.find(hospitalQuery)
          .select('_id name address type ratings services')
          .sort({ name: 1 })
          .skip(skip)
          .limit(limitNum)
          .lean();

        totalHospitals = await Hospital.countDocuments(hospitalQuery);

        // Extract hospital IDs
        hospitalIds = hospitals.map(h => h._id);

        // Find doctors affiliated with these hospitals
        if (hospitalIds.length > 0) {
          const affiliatedDoctorsQuery = {
            ...baseQuery,
            'hospitalAffiliations.hospital': { $in: hospitalIds }
          };

          doctors = await Doctor.find(affiliatedDoctorsQuery)
            .populate('user', 'fullName profilePhoto _id')
            .populate({
              path: 'hospitalAffiliations.hospital',
              select: 'name address type services _id',
              // Temporarily remove the match filter
              // match: { isActive: true }
            })
            .sort({ experience: -1 })
            .lean();

          totalDoctors = await Doctor.countDocuments(affiliatedDoctorsQuery);
        }
      }
      // SEARCH FLOW 3: If only location filters are provided
      else {
        // Fetch both doctors and hospitals based on location
        const [doctorsResults, hospitalsResults] = await Promise.all([
          Doctor.find(doctorQuery)
            .populate('user', 'fullName profilePhoto _id')
            .populate({
              path: 'hospitalAffiliations.hospital',
              select: 'name address type services _id',
              // Temporarily remove the match filter
              // match: { isActive: true }
            })
            .sort({ experience: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),

          Hospital.find(hospitalQuery)
            .select('_id name address type ratings services')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limitNum)
            .lean()
        ]);

        doctors = doctorsResults;
        hospitals = hospitalsResults;

        totalDoctors = await Doctor.countDocuments(doctorQuery);
        totalHospitals = await Hospital.countDocuments(hospitalQuery);
      }

      // Add direct doctor check for debugging
      if (doctors.length > 0) {
        const doctorId = doctors[0]._id;

        const directDoctorCheck = await Doctor.findById(doctorId)
          .populate({
            path: 'hospitalAffiliations.hospital',
            select: 'name address type services _id'
          })
          .lean();

      }

      // Filter out null hospital affiliations for all doctors
      const filteredDoctors = doctors.map(doctor => {
        if (doctor.hospitalAffiliations && Array.isArray(doctor.hospitalAffiliations)) {
          // Filter out affiliations with null hospitals
          doctor.hospitalAffiliations = doctor.hospitalAffiliations.filter(
            aff => aff && aff.hospital !== null
          );

          // If all affiliations were removed, provide an empty array
          if (doctor.hospitalAffiliations.length === 0) {
            doctor.hospitalAffiliations = [];
          }
        } else {
          // Ensure hospitalAffiliations is always an array
          doctor.hospitalAffiliations = [];
        }

        return doctor;
      });

      // Add associated doctors count to each hospital for display purposes
      const enhancedHospitals = hospitals.map(hospital => {
        const associatedDoctors = filteredDoctors.filter(doctor =>
          doctor.hospitalAffiliations.some(aff =>
            aff.hospital && aff.hospital._id &&
            aff.hospital._id.toString() === hospital._id.toString()
          )
        );
        return {
          ...hospital,
          doctorsCount: associatedDoctors.length
        };
      });

      // Format response
      res.json({
        success: true,
        data: {
          doctors: filteredDoctors,
          hospitals: enhancedHospitals
        },
        pagination: {
          doctors: {
            total: totalDoctors,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(totalDoctors / limitNum),
            hasNext: pageNum * limitNum < totalDoctors
          },
          hospitals: {
            total: totalHospitals,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(totalHospitals / limitNum),
            hasNext: pageNum * limitNum < totalHospitals
          }
        }
      });
    } catch (error) {
      console.error('Search doctors error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search doctors and hospitals',
        error: error.message
      });
    }
  },

  findNearbyDoctors: async (req, res) => {
    try {
      const {
        longitude,
        latitude,
        specialization,
        page = 1,
        limit = 15
      } = req.query;

      // Validate coordinates
      if (!longitude || !latitude) {
        return res.status(400).json({
          success: false,
          message: 'Longitude and latitude are required'
        });
      }

      const coords = [parseFloat(longitude), parseFloat(latitude)];
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(Math.max(1, parseInt(limit)), 100);

      // Build base query without distance restriction
      const query = {
        'address.coordinates': {
          $exists: true,
          $ne: null
        },
        isActive: true
      };

      // Add filters
      if (specialization) {
        // Changed to check in specializations array
        query.specializations = {
          $elemMatch: {
            $regex: sanitizeRegex(specialization),
            $options: 'i'
          }
        };
      }

      // First get all matching doctors
      const allDoctors = await Doctor.find(query)
        .populate('user', 'fullName profilePhoto')
        .populate('hospitalAffiliations.hospital', 'name address')
        .lean();

      // Calculate distances and add to each doctor object
      allDoctors.forEach(doctor => {
        if (doctor.address?.coordinates) {
          const distance = calculateDistance(
            coords,
            doctor.address.coordinates
          );
          doctor.distance = parseFloat(distance.toFixed(2));
        } else {
          doctor.distance = Infinity; // Handle cases where coordinates might be missing
        }
      });

      // Sort by distance (nearest first)
      allDoctors.sort((a, b) => a.distance - b.distance);

      // Apply pagination
      const total = allDoctors.length;
      const skip = (pageNum - 1) * limitNum;
      const doctors = allDoctors.slice(skip, skip + limitNum);

      // Format response
      res.json({
        success: true,
        data: doctors,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
          hasNext: skip + limitNum < total
        }
      });
    } catch (error) {
      console.error('Nearby doctors error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to find nearby doctors',
        error: error.message
      });
    }
  },

  findDoctorsByHospital: async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const {
        specialization,
        isVerified,
        isActive,
        page = 1,
        limit = 10
      } = req.query;

      // Validate hospital ID
      if (!mongoose.Types.ObjectId.isValid(hospitalId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid hospital ID'
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(Math.max(1, parseInt(limit)), 100);

      // Build query
      const query = {
        'hospitalAffiliations.hospital': hospitalId
      };

      if (specialization) {
        query.specialization = { $regex: sanitizeRegex(specialization), $options: 'i' };
      }

      if (isVerified !== undefined) {
        query['verification.status'] = isVerified === 'true' ? 'verified' : { $ne: 'verified' };
      }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      // Execute query
      const skip = (pageNum - 1) * limitNum;

      const doctors = await Doctor.find(query)
        .populate('user', 'name email profileImage phoneNumber')
        .populate('hospitalAffiliations.hospital', 'name address')
        .skip(skip)
        .limit(limitNum)
        .lean();

      const total = await Doctor.countDocuments(query);

      // Format response
      res.json({
        success: true,
        data: doctors,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          pages: Math.ceil(total / limitNum),
          hasNext: pageNum * limitNum < total
        }
      });
    } catch (error) {
      console.error('Hospital doctors error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to find hospital doctors',
        error: error.message
      });
    }
  },

  insertDummyData: async (req, res) => {
    try {
      const { user, doctor, hospital } = req.body;
      const saveUser = await User.create(user);
      const saveDoctor = await Doctor.create({ ...doctor, user: saveUser._id });
      const saveHospital = await Hospital.create({ ...hospital, doctors: [saveDoctor._id] });
      saveDoctor.address = hospital.address;
      saveDoctor.hospitalAffiliations = [
        {
          hospital: saveHospital._id,
          department: "Cardiology",
          position: "Senior Consultant"
        }
      ]
      await saveDoctor.save();

      res.status(201).send({ message: "Dummy data inserted", success: true });
    } catch (error) {
      console.log("Error in the insertDummyData, ", error);
      res.status(500).send({ error: "Internal server error...", success: false });
    }
  },

  getAllHospitals: async (req, res) => {
    try {
      const hospitals = await Hospital.find().select("name");
      res.status(200).send({ success: true, hospitals });
    } catch (error) {
      console.log("Error in the getAllHospitals, ", error);
      res.status(500).send({ error: "Internal server error...", success: false });
    }
  },

  getAllCities: async (req, res) => {
    try {
      const cities = await Hospital.distinct("address.city");
      res.status(200).send({
        success: true,
        data: cities
      });
    } catch (error) {
      console.error("Error in getAllCities:", error);
      res.status(500).send({
        error: "Internal server error",
        success: false
      });
    }
  },

  getRevenueSummary: async (req, res) => {
  const { doctorId } = req.user;

  try {
    const wallet = await Wallet.findOne({ doctor: doctorId });
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    const commissionRate = wallet.commission_rate || 20;

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const calculateRevenue = async (startDate, endDate) => {
      // Find payments for doctor in date range and status = "captured"
      const payments = await Payment.find({
        doctor: doctorId,
        status: "captured",
        createdAt: { $gte: startDate, $lt: endDate }
      }).populate({
        path: "appointment",
        select: "status",
        match: { status: "completed" }  // Only appointments that are completed
      });

      // Filter payments where appointment was completed
      const validPayments = payments.filter(p => p.appointment);

      // Sum the doctor's net revenue after commission
      const gross = validPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const net = gross * (1 - commissionRate / 100);
      return Math.round(net);
    };

    const currentRevenue = await calculateRevenue(currentMonthStart, nextMonthStart);
    const previousRevenue = await calculateRevenue(previousMonthStart, currentMonthStart);

    const growth = previousRevenue > 0
      ? parseFloat((((currentRevenue - previousRevenue) / previousRevenue) * 100).toFixed(1))
      : 0;

    return res.status(200).json({
      totalRevenue: currentRevenue,
      previousMonthRevenue: previousRevenue,
      monthlyGrowth: growth,
    });
  } catch (error) {
    console.error("Revenue summary error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
},

getCoinsCollected: async (req, res) => {
    try {
      const doctorId = req.user.doctorId;
      
      // Verify doctor exists
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json({ success: false, message: 'Doctor not found' });
      }
      
      // Get wallet data
      const wallet = await Wallet.findOne({ doctor: doctorId });
      if (!wallet) {
        return res.status(404).json({ 
          success: false, 
          message: 'Wallet not found. Please contact support.'
        });
      }
      
      // Get today's transactions to calculate daily coins
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const dailyTransactions = await Transaction.find({
        user: doctor.user,
        type: "doctor_credit",
        status: "completed",
        createdAt: { $gte: today }
      });
      
      // Calculate daily coins
      const dailyCoins = dailyTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
      
      // Default coin goal (can be customized per doctor in the future)
      const coinGoal = 150000;
      
      return res.status(200).json({
        success: true,
        totalCoins: wallet.current_balance,
        dailyCoins: dailyCoins,
        coinGoal: coinGoal,
        totalEarned: wallet.total_earned
      });
    } catch (error) {
      console.error('Error in getCoinsCollected:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'An error occurred while fetching coins data'
      });
    }
  }


};





module.exports = DoctorController;