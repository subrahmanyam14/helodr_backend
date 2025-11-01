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
const Appointment = require("../models/Appointment");
const UpcomingEarnings = require("../models/UpcomingEarnings");
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


// Helper function to calculate distance between two coordinates in meters
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

  return distance * 1000; // Convert to meters
};

// Alternative distance calculation function (Haversine formula)
function getDistance(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(coord2.lat - coord1.lat);
  const dLon = toRad(coord2.lng - coord1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1.lat)) * Math.cos(toRad(coord2.lat)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
        onlineConsultation
      } = req.body;

      // Check if doctor already exists for this user
      const existingDoctor = await Doctor.findOne({ user: req.user.id });
      if (existingDoctor) {
        return res.status(400).json({
          success: false,
          message: 'Doctor profile already exists for this user',
          data: existingDoctor
        });
      }

      const existingUser = await User.findById(req.user.id);
      if (!existingUser) {
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
        isActive: true
      });

      await newDoctor.save();

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

      await newSettings.save();

      // Update user with doctor reference
      existingUser.doctorId = newDoctor._id;
      await existingUser.save();

      res.status(201).json({
        success: true,
        message: 'Doctor registered successfully',
        doctor: newDoctor,
        settings: newSettings
      });

    } catch (error) {
      console.error("Error in registerDoctor: ", error);

      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Doctor profile already exists for this user'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Error registering doctor',
        error: error.message
      });
    }
  },

  updateDoctorBio: async (req, res) => {
    try {
      const userId = req.user.id;

      const doctor = await Doctor.findOne({ user: userId });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor profile not found'
        });
      }

      const {
        fullName,
        title,
        specializations,
        qualifications,
        experience,
        languages,
        bio,
        address
      } = req.body;

      // Update User's fullName if provided
      if (fullName !== undefined) {
        const user = await User.findById(userId);
        if (user) {
          user.fullName = fullName;
          await user.save();
          doctor.fullName = fullName; // Update doctor's fullName too
        }
      }

      // Update other bio fields
      if (title !== undefined) doctor.title = title;
      if (specializations !== undefined) doctor.specializations = specializations;
      if (qualifications !== undefined) doctor.qualifications = qualifications;
      if (experience !== undefined) doctor.experience = experience;
      if (languages !== undefined) doctor.languages = languages;
      if (bio !== undefined) doctor.bio = bio;

      // Update address
      if (address) {
        doctor.address = {
          street: address.street !== undefined ? address.street : doctor.address.street,
          city: address.city !== undefined ? address.city : doctor.address.city,
          state: address.state !== undefined ? address.state : doctor.address.state,
          country: address.country !== undefined ? address.country : doctor.address.country,
          pinCode: address.pinCode !== undefined ? address.pinCode : doctor.address.pinCode
        };
      }

      await doctor.save();
      await doctor.populate('user', 'fullName email phone');

      res.status(200).json({
        success: true,
        message: 'Doctor bio updated successfully',
        data: doctor
      });

    } catch (error) {
      console.error('Error updating doctor bio:', error);

      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors
        });
      }

      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        return res.status(400).json({
          success: false,
          message: `${field} already exists`
        });
      }

      res.status(500).json({
        success: false,
        message: 'Server error while updating doctor bio',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  updateConsultationFees: async (req, res) => {
    try {
      const userId = req.user.id;

      const doctor = await Doctor.findOne({ user: userId });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor profile not found'
        });
      }

      const { clinicConsultationFee, onlineConsultation } = req.body;

      // Update clinic consultation fees
      if (clinicConsultationFee) {
        if (clinicConsultationFee.consultationFee !== undefined) {
          doctor.clinicConsultationFee.consultationFee = clinicConsultationFee.consultationFee;
        }
        if (clinicConsultationFee.followUpFee !== undefined) {
          doctor.clinicConsultationFee.followUpFee = clinicConsultationFee.followUpFee;
        }
      }

      // Update online consultation fees
      if (onlineConsultation) {
        if (onlineConsultation.consultationFee !== undefined) {
          doctor.onlineConsultation.consultationFee = onlineConsultation.consultationFee;
        }
        if (onlineConsultation.followUpFee !== undefined) {
          doctor.onlineConsultation.followUpFee = onlineConsultation.followUpFee;
        }
      }

      await doctor.save();
      await doctor.populate('user', 'fullName email phone');

      res.status(200).json({
        success: true,
        message: 'Consultation fees updated successfully',
        data: {
          clinicConsultationFee: doctor.clinicConsultationFee,
          onlineConsultation: doctor.onlineConsultation
        }
      });

    } catch (error) {
      console.error('Error updating consultation fees:', error);

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
        message: 'Server error while updating consultation fees',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  endHospitalAffiliation: async (req, res) => {
    try {
      const userId = req.user.id;
      const { affiliationId } = req.params;

      const doctor = await Doctor.findOne({ user: userId });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor profile not found'
        });
      }

      // Find the affiliation
      const affiliation = doctor.hospitalAffiliations.id(affiliationId);

      if (!affiliation) {
        return res.status(404).json({
          success: false,
          message: 'Hospital affiliation not found'
        });
      }

      // Update status to false and set end date from server
      affiliation.currentlyWorking = false;
      affiliation.to = new Date(); // Server date

      await doctor.save();
      await doctor.populate('hospitalAffiliations.hospital', 'name address');

      res.status(200).json({
        success: true,
        message: 'Hospital affiliation ended successfully',
        data: affiliation
      });

    } catch (error) {
      console.error('Error ending hospital affiliation:', error);

      if (error.name === 'CastError') {
        return res.status(400).json({
          success: false,
          message: 'Invalid affiliation ID format'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Server error while updating hospital affiliation',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  updateMeetingLink: async (req, res) => {
    try {
      const userId = req.user.id;
      const { meetingLink } = req.body;

      if (!meetingLink) {
        return res.status(400).json({
          success: false,
          message: 'Meeting link is required'
        });
      }

      // Basic URL validation
      const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
      if (!urlPattern.test(meetingLink)) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid meeting link URL'
        });
      }

      const doctor = await Doctor.findOne({ user: userId });

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor profile not found'
        });
      }

      doctor.meetingLink = meetingLink;
      await doctor.save();
      await doctor.populate('user', 'fullName email phone');

      res.status(200).json({
        success: true,
        message: 'Meeting link updated successfully',
        data: {
          meetingLink: doctor.meetingLink
        }
      });

    } catch (error) {
      console.error('Error updating meeting link:', error);

      res.status(500).json({
        success: false,
        message: 'Server error while updating meeting link',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getMyDoctorProfile: async (req, res) => {
    try {
      const userId = req.user.id;

      const doctor = await Doctor.findOne({ user: userId })
        .populate('user', 'fullName email phone profilePicture')
        .populate('hospitalAffiliations.hospital', 'name address contactNumber');

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor profile not found'
        });
      }

      res.status(200).json({
        success: true,
        data: doctor
      });

    } catch (error) {
      console.error('Error fetching doctor profile:', error);

      res.status(500).json({
        success: false,
        message: 'Server error while fetching doctor profile',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    const session = await mongoose.startSession();
    session.startTransaction();

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

      // Validate coordinates if provided
      if (address.coordinates && (!Array.isArray(address.coordinates) || address.coordinates.length !== 2)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Valid coordinates array [longitude, latitude] is required'
        });
      }

      // Check if hospital already exists with this name and address
      const existingHospital = await Hospital.findOne({
        name,
        'address.city': address.city,
        'address.street': address.street
      }).session(session);

      if (existingHospital) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Hospital already exists with this name and address',
          hospital: existingHospital
        });
      }

      // Check if hospitalAdmin already exists for this user
      const existingHospitalAdmin = await Hospital.findOne({ addedBy: req.user.id }).session(session);
      if (existingHospitalAdmin) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'Hospital profile already exists for this user',
          data: existingHospitalAdmin
        });
      }

      const existingUser = await User.findById(req.user.id).session(session);
      if (!existingUser) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: 'User profile does not exist for this Hospital.'
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
        addedBy: req.user.id,
        clusters: [] // Initialize empty clusters array
      });

      await newHospital.save({ session });

      // CLUSTER ASSIGNMENT LOGIC
      let assignedClusters = [];

      // Only assign to clusters if coordinates are provided
      if (address.coordinates && address.coordinates.length === 2) {
        // 1. Find clusters that contain this hospital's location within their radius
        const containingClusters = await Cluster.find({
          location: {
            $near: {
              $geometry: {
                type: "Point",
                coordinates: newHospital.address.coordinates
              },
              $maxDistance: 100000 // Search within 100km radius for hospitals
            }
          },
          isActive: true
        }).session(session);

        // 2. Check which clusters actually contain the hospital (within their radius)
        for (const cluster of containingClusters) {
          const distance = calculateDistance(
            newHospital.address.coordinates,
            cluster.location.coordinates
          );

          if (distance <= cluster.radius) {
            // Check if hospital limit is not exceeded
            if (cluster.hospitals.length < 50) {
              assignedClusters.push(cluster);
            }
          }
        }

        // 3. If not in any cluster, find nearest active cluster within reasonable distance
        if (assignedClusters.length === 0) {
          const nearestCluster = await Cluster.findOne({
            isActive: true
          })
            .sort({
              location: {
                $near: {
                  $geometry: {
                    type: "Point",
                    coordinates: newHospital.address.coordinates
                  }
                }
              }
            })
            .session(session);

          if (nearestCluster) {
            const distanceToNearest = calculateDistance(
              newHospital.address.coordinates,
              nearestCluster.location.coordinates
            );

            // Only assign if within 200km of nearest cluster
            if (distanceToNearest <= 200000 && nearestCluster.hospitals.length < 50) {
              assignedClusters.push(nearestCluster);
            }
          }
        }

        // 4. Add hospital to the assigned clusters
        for (const cluster of assignedClusters) {
          // Check if hospital already exists in cluster to prevent duplicates
          if (!cluster.hospitals.includes(newHospital._id)) {
            cluster.hospitals.push(newHospital._id);
            await cluster.save({ session });

            // Add cluster to hospital's clusters array
            newHospital.clusters.push(cluster._id);
          }
        }

        // Save hospital with updated clusters
        if (assignedClusters.length > 0) {
          await newHospital.save({ session });
        }
      }

      // Update user with hospital reference
      existingUser.hospitalId = newHospital._id;
      await existingUser.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Populate cluster details for response
      const populatedHospital = await Hospital.findById(newHospital._id)
        .populate('clusters', 'clusterName location radius');

      res.status(201).json({
        success: true,
        message: `Hospital registered successfully${assignedClusters.length > 0 ? ` and assigned to ${assignedClusters.length} cluster(s)` : ''}`,
        hospital: populatedHospital,
        clusterAssignment: {
          assignedCount: assignedClusters.length,
          clusterNames: assignedClusters.map(cluster => cluster.clusterName)
        }
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.log("Error in registerHospital: ", error);
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
        currentlyWorking,
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

      // First, get hospital details once
      const hospital = await Hospital.findById(hospitalId)
        .select('name type address contact services statistics photos featuredImage specialties facilities about')
        .lean();

      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Build query for doctors - correct way to query array of objects
      const query = {
        'hospitalAffiliations.hospital': hospitalId
      };

      if (specialization) {
        query.specializations = { $regex: sanitizeRegex(specialization), $options: 'i' };
      }

      // if (isVerified !== undefined) {
      //   query['verification.status'] = isVerified === 'true' ? 'verified' : { $ne: 'verified' };
      // }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (currentlyWorking !== undefined) {
        query['hospitalAffiliations.currentlyWorking'] = currentlyWorking === 'true';
      }

      // Execute query with optimized field selection
      const skip = (pageNum - 1) * limitNum;

      const doctors = await Doctor.find(query)
        .select('user fullName title specializations registrationNumber qualifications experience languages bio clinicConsultationFee onlineConsultation address review meetingLink hospitalAffiliations isActive')
        .populate({
          path: 'user',
          select: 'name email profilePhoto phoneNumber',
          // match: { isActive: true }
        })
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Filter out doctors where user population failed (inactive users)
      const filteredDoctors = doctors.filter(doctor => doctor.user !== null);

      const total = await Doctor.countDocuments(query);

      // Format response - add hospital affiliation details to each doctor
      const formattedDoctors = filteredDoctors.map(doctor => {
        // Find the specific hospital affiliation for this hospital
        const hospitalAffiliation = doctor.hospitalAffiliations.find(
          affil => affil.hospital && affil.hospital.toString() === hospitalId
        );

        // Create a clean doctor object without all hospitalAffiliations
        const doctorData = {
          _id: doctor._id,
          user: doctor.user,
          fullName: doctor.fullName,
          title: doctor.title,
          specializations: doctor.specializations,
          registrationNumber: doctor.registrationNumber,
          qualifications: doctor.qualifications,
          experience: doctor.experience,
          languages: doctor.languages,
          bio: doctor.bio,
          clinicConsultationFee: doctor.clinicConsultationFee,
          onlineConsultation: doctor.onlineConsultation,
          address: doctor.address,
          isActive: doctor.isActive,
          review: doctor.review,
          meetingLink: doctor.meetingLink,
          hospitalAffiliation: hospitalAffiliation ? {
            department: hospitalAffiliation.department,
            position: hospitalAffiliation.position,
            from: hospitalAffiliation.from,
            to: hospitalAffiliation.to,
            currentlyWorking: hospitalAffiliation.currentlyWorking
          } : null
        };

        return doctorData;
      });

      res.json({
        success: true,
        data: {
          hospital: {
            _id: hospital._id,
            name: hospital.name,
            type: hospital.type,
            address: hospital.address,
            contact: hospital.contact,
            services: hospital.services,
            specialties: hospital.specialties,
            facilities: hospital.facilities,
            about: hospital.about,
            photos: hospital.photos,
            featuredImage: hospital.featuredImage,
            statistics: hospital.statistics || {
              averageRating: 0,
              totalRatings: 0
            }
          },
          doctors: formattedDoctors
        },
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
  },

  getHospitalByUserId: async (req, res) => {
    try {
      const { id } = req.user;

      // Validate user ID
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user ID'
        });
      }

      // Find hospital by addedBy field
      const hospital = await Hospital.findOne({ addedBy: id })
        .populate({
          path: 'addedBy',
          select: 'name email role profileImage'
        })
        .populate({
          path: 'doctors',
          select: 'name specialization experience rating profileImage',
          match: { isActive: true }
        });

      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'No hospital found for this user'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Hospital details fetched successfully',
        hospital: hospital
      });

    } catch (error) {
      console.error("Error in getHospitalByUserId: ", error);
      res.status(500).json({
        success: false,
        message: 'Error fetching hospital details',
        error: error.message
      });
    }
  },

  getDoctorsWithAffiliations: async (req, res) => {
    try {
      const {
        currentlyWorking,
        hospitalId,
        specialization,
        city,
        state,
        page = 1,
        limit = 10
      } = req.query;

      // Build query
      const query = {};

      // Filter by specialization
      if (specialization) {
        query.specializations = specialization;
      }

      // Filter by city
      if (city) {
        query['address.city'] = { $regex: city, $options: 'i' };
      }

      // Filter by state
      if (state) {
        query['address.state'] = { $regex: state, $options: 'i' };
      }

      // Filter by hospital affiliation
      if (hospitalId) {
        query['hospitalAffiliations.hospital'] = hospitalId;
      }

      // Filter by currently working status
      if (currentlyWorking !== undefined) {
        const isCurrentlyWorking = currentlyWorking === 'true';

        if (isCurrentlyWorking) {
          // Doctors who are currently working at any hospital
          query['hospitalAffiliations'] = {
            $elemMatch: { currentlyWorking: true }
          };
        } else {
          // Doctors who are not currently working at any hospital
          query.$or = [
            { 'hospitalAffiliations': { $size: 0 } },
            {
              'hospitalAffiliations': {
                $not: { $elemMatch: { currentlyWorking: true } }
              }
            }
          ];
        }
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const doctors = await Doctor.find(query)
        .populate('user', 'fullName email mobileNumber profilePhoto')
        .populate('hospitalAffiliations.hospital', 'name type address contact featuredImage')
        .select('-__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      // Get total count for pagination
      const totalDoctors = await Doctor.countDocuments(query);

      // Format response with affiliation status
      const formattedDoctors = doctors.map(doctor => {
        const doctorObj = doctor.toObject();

        // Separate current and past affiliations
        const currentAffiliations = doctor.hospitalAffiliations.filter(
          aff => aff.currentlyWorking
        );
        const pastAffiliations = doctor.hospitalAffiliations.filter(
          aff => !aff.currentlyWorking
        );

        return {
          ...doctorObj,
          affiliationStatus: {
            isCurrentlyWorking: currentAffiliations.length > 0,
            currentAffiliationsCount: currentAffiliations.length,
            pastAffiliationsCount: pastAffiliations.length,
            totalAffiliations: doctor.hospitalAffiliations.length
          },
          currentAffiliations,
          pastAffiliations
        };
      });

      res.status(200).json({
        success: true,
        count: doctors.length,
        totalDoctors,
        totalPages: Math.ceil(totalDoctors / parseInt(limit)),
        currentPage: parseInt(page),
        data: formattedDoctors
      });

    } catch (error) {
      console.error('Error fetching doctors with affiliations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctors',
        error: error.message
      });
    }
  },


  getDoctorsByHospitalCurrent: async (req, res) => {
    try {
      const { hospitalId } = req.params;
      const { specialization, page = 1, limit = 10 } = req.query;

      // Verify hospital exists
      const hospital = await Hospital.findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Build query
      const query = {
        'hospitalAffiliations': {
          $elemMatch: {
            hospital: hospitalId,
            currentlyWorking: true
          }
        }
      };

      // Filter by specialization if provided
      if (specialization) {
        query.specializations = specialization;
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const doctors = await Doctor.find(query)
        .populate('user', 'fullName email mobileNumber profilePhoto')
        .populate('hospitalAffiliations.hospital', 'name type address')
        .select('-__v')
        .sort({ 'review.averageRating': -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalDoctors = await Doctor.countDocuments(query);

      // Format to include only current affiliation details for this hospital
      const formattedDoctors = doctors.map(doctor => {
        const doctorObj = doctor.toObject();
        const currentAffiliation = doctor.hospitalAffiliations.find(
          aff => aff.hospital._id.toString() === hospitalId && aff.currentlyWorking
        );

        return {
          ...doctorObj,
          currentAffiliationAtThisHospital: currentAffiliation
        };
      });

      res.status(200).json({
        success: true,
        hospital: {
          id: hospital._id,
          name: hospital.name
        },
        count: doctors.length,
        totalDoctors,
        totalPages: Math.ceil(totalDoctors / parseInt(limit)),
        currentPage: parseInt(page),
        data: formattedDoctors
      });

    } catch (error) {
      console.error('Error fetching doctors by hospital:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctors',
        error: error.message
      });
    }
  },


  getAvailableDoctors: async (req, res) => {
    try {
      const {
        specialization,
        city,
        state,
        page = 1,
        limit = 10
      } = req.query;

      // Build query for doctors without current affiliations
      const query = {
        $or: [
          { 'hospitalAffiliations': { $size: 0 } },
          {
            'hospitalAffiliations': {
              $not: { $elemMatch: { currentlyWorking: true } }
            }
          }
        ]
      };

      // Additional filters
      if (specialization) {
        query.specializations = specialization;
      }

      if (city) {
        query['address.city'] = { $regex: city, $options: 'i' };
      }

      if (state) {
        query['address.state'] = { $regex: state, $options: 'i' };
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      const doctors = await Doctor.find(query)
        .populate('user', 'fullName email mobileNumber profilePhoto')
        .populate('hospitalAffiliations.hospital', 'name type')
        .select('-__v')
        .sort({ experience: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalDoctors = await Doctor.countDocuments(query);

      res.status(200).json({
        success: true,
        message: 'Doctors available for hospital affiliation',
        count: doctors.length,
        totalDoctors,
        totalPages: Math.ceil(totalDoctors / parseInt(limit)),
        currentPage: parseInt(page),
        data: doctors
      });

    } catch (error) {
      console.error('Error fetching available doctors:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch available doctors',
        error: error.message
      });
    }
  },


  getDoctorAffiliations: async (req, res) => {
    try {
      const { doctorId } = req.params;

      const doctor = await Doctor.findById(doctorId)
        .populate('user', 'fullName email mobileNumber profilePhoto')
        .populate('hospitalAffiliations.hospital', 'name type address contact photos featuredImage');

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }

      // Organize affiliations
      const currentAffiliations = doctor.hospitalAffiliations.filter(
        aff => aff.currentlyWorking
      );

      const pastAffiliations = doctor.hospitalAffiliations.filter(
        aff => !aff.currentlyWorking
      );

      // Calculate total experience from affiliations
      const totalYearsInAffiliations = doctor.hospitalAffiliations.reduce((total, aff) => {
        if (aff.from) {
          const endDate = aff.to || new Date();
          const years = (endDate - aff.from) / (1000 * 60 * 60 * 24 * 365);
          return total + years;
        }
        return total;
      }, 0);

      res.status(200).json({
        success: true,
        data: {
          doctor: {
            _id: doctor._id,
            fullName: doctor.fullName,
            title: doctor.title,
            specializations: doctor.specializations,
            registrationNumber: doctor.registrationNumber,
            qualifications: doctor.qualifications,
            experience: doctor.experience,
            languages: doctor.languages,
            bio: doctor.bio,
            address: doctor.address,
            review: doctor.review,
            user: doctor.user
          },
          affiliationSummary: {
            isCurrentlyWorking: currentAffiliations.length > 0,
            currentAffiliationsCount: currentAffiliations.length,
            pastAffiliationsCount: pastAffiliations.length,
            totalAffiliations: doctor.hospitalAffiliations.length,
            totalYearsInAffiliations: Math.round(totalYearsInAffiliations * 10) / 10
          },
          currentAffiliations: currentAffiliations.map(aff => ({
            _id: aff._id,
            hospital: aff.hospital,
            department: aff.department,
            position: aff.position,
            from: aff.from,
            duration: aff.from ?
              `${Math.round((new Date() - aff.from) / (1000 * 60 * 60 * 24 * 365 * 10)) / 10} years` :
              'N/A'
          })),
          pastAffiliations: pastAffiliations.map(aff => ({
            _id: aff._id,
            hospital: aff.hospital,
            department: aff.department,
            position: aff.position,
            from: aff.from,
            to: aff.to,
            duration: aff.from && aff.to ?
              `${Math.round((aff.to - aff.from) / (1000 * 60 * 60 * 24 * 365 * 10)) / 10} years` :
              'N/A'
          }))
        }
      });

    } catch (error) {
      console.error('Error fetching doctor affiliations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch doctor affiliations',
        error: error.message
      });
    }
  },


  getAffiliationStats: async (req, res) => {
    try {
      const totalDoctors = await Doctor.countDocuments();

      const doctorsWithCurrentAffiliations = await Doctor.countDocuments({
        'hospitalAffiliations': {
          $elemMatch: { currentlyWorking: true }
        }
      });

      const doctorsWithoutCurrentAffiliations = await Doctor.countDocuments({
        $or: [
          { 'hospitalAffiliations': { $size: 0 } },
          {
            'hospitalAffiliations': {
              $not: { $elemMatch: { currentlyWorking: true } }
            }
          }
        ]
      });

      const doctorsWithPastAffiliations = await Doctor.countDocuments({
        'hospitalAffiliations': {
          $elemMatch: { currentlyWorking: false }
        }
      });

      // Get doctors with multiple current affiliations
      const doctorsWithMultipleAffiliations = await Doctor.aggregate([
        {
          $project: {
            currentAffiliationsCount: {
              $size: {
                $filter: {
                  input: '$hospitalAffiliations',
                  as: 'aff',
                  cond: { $eq: ['$$aff.currentlyWorking', true] }
                }
              }
            }
          }
        },
        {
          $match: {
            currentAffiliationsCount: { $gte: 2 }
          }
        },
        {
          $count: 'count'
        }
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalDoctors,
          doctorsWithCurrentAffiliations,
          doctorsWithoutCurrentAffiliations,
          doctorsWithPastAffiliations,
          doctorsWithMultipleCurrentAffiliations: doctorsWithMultipleAffiliations[0]?.count || 0,
          percentageWithCurrentAffiliations: totalDoctors > 0 ?
            Math.round((doctorsWithCurrentAffiliations / totalDoctors) * 100) : 0
        }
      });

    } catch (error) {
      console.error('Error fetching affiliation stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  },

  getHospitalDoctors: async (req, res) => {
    try {
      const { hospitalId } = req.user;
      const {
        search,
        specialization,
        minExperience,
        maxExperience,
        page = 1,
        limit = 10,
        sortBy = 'experience',
        sortOrder = 'desc'
      } = req.query;

      // Validate hospitalId
      if (!hospitalId || !mongoose.Types.ObjectId.isValid(hospitalId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid hospital ID is required'
        });
      }

      // Check if hospital exists
      const hospital = await mongoose.model('Hospital').findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Build filter query
      const filterQuery = {
        $and: [
          {
            $or: [
              { 'hospitalAffiliations.hospital': hospitalId },
              { _id: { $in: hospital.doctors || [] } }
            ]
          },
          { isActive: true }
        ]
      };

      // Add search filter (search in doctor name and specializations)
      if (search) {
        const searchRegex = new RegExp(search, 'i');
        filterQuery.$and.push({
          $or: [
            { fullName: searchRegex },
            { 'user.fullName': searchRegex },
            { specializations: { $in: [searchRegex] } }
          ]
        });
      }

      // Add specialization filter
      if (specialization) {
        if (Array.isArray(specialization)) {
          // Multiple specializations provided as array
          filterQuery.$and.push({
            specializations: { $in: specialization }
          });
        } else {
          // Single specialization provided as string
          const specializationRegex = new RegExp(specialization, 'i');
          filterQuery.$and.push({
            specializations: { $in: [specializationRegex] }
          });
        }
      }

      // Add experience range filter
      if (minExperience || maxExperience) {
        const experienceFilter = {};
        if (minExperience) experienceFilter.$gte = parseInt(minExperience);
        if (maxExperience) experienceFilter.$lte = parseInt(maxExperience);
        filterQuery.$and.push({ experience: experienceFilter });
      }

      // Build sort object
      const sortOptions = {};
      switch (sortBy) {
        case 'name':
          sortOptions.fullName = sortOrder === 'desc' ? -1 : 1;
          break;
        case 'experience':
          sortOptions.experience = sortOrder === 'desc' ? -1 : 1;
          break;
        case 'registrationNumber':
          sortOptions.registrationNumber = sortOrder === 'desc' ? -1 : 1;
          break;
        default:
          sortOptions.experience = -1;
      }

      // Calculate pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // Cap at 50 per page
      const skip = (pageNum - 1) * limitNum;

      // Get doctors with filters, pagination, and sorting
      const doctors = await mongoose.model('Doctor')
        .find(filterQuery)
        .populate({
          path: 'user',
          select: 'fullName email countryCode mobileNumber',
          match: { role: 'doctor' } // Ensure we're only getting doctor users
        })
        .select('fullName specializations registrationNumber experience user')
        .skip(skip)
        .limit(limitNum)
        .sort(sortOptions)
        .lean();

      // Get total count for pagination
      const totalCount = await mongoose.model('Doctor').countDocuments(filterQuery);

      // Transform the data to match required fields
      const doctorProfiles = doctors
        .map(doctor => {
          const user = doctor.user || {};

          // Skip doctors without essential user data
          if (!user.email && !user.mobileNumber) {
            return null;
          }

          return {
            id: doctor._id,
            doctorName: doctor.fullName || user.fullName || 'Unknown',
            specializations: doctor.specializations || [],
            email: user.email || '',
            mobile: user.countryCode && user.mobileNumber
              ? `${user.countryCode}${user.mobileNumber}`
              : user.mobileNumber || '',
            registrationNumber: doctor.registrationNumber || 'Not Available',
            experience: doctor.experience || 0
          };
        })
        .filter(doctor => doctor !== null); // Remove null entries

      // Prepare response with available filters for frontend reference
      const response = {
        success: true,
        data: {
          hospital: {
            id: hospital._id,
            name: hospital.name,
            type: hospital.type
          },
          doctors: doctorProfiles,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalCount / limitNum),
            totalDoctors: totalCount,
            doctorsPerPage: limitNum,
            hasNext: pageNum < Math.ceil(totalCount / limitNum),
            hasPrev: pageNum > 1
          },
          filters: {
            search: search || '',
            specialization: specialization || '',
            minExperience: minExperience || '',
            maxExperience: maxExperience || '',
            sortBy,
            sortOrder
          }
        }
      };

      // Add available specializations if no search/filter is applied
      if (!search && !specialization) {
        const availableSpecializations = await mongoose.model('Doctor')
          .distinct('specializations', {
            $and: [
              {
                $or: [
                  { 'hospitalAffiliations.hospital': hospitalId },
                  { _id: { $in: hospital.doctors || [] } }
                ]
              },
              { isActive: true }
            ]
          });
        response.data.availableSpecializations = availableSpecializations.sort();
      }

      return res.status(200).json(response);

    } catch (error) {
      console.error('Error fetching hospital doctors:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error while fetching doctors',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }


  },


  getHospitalDoctorCounts: async (req, res) => {
    try {
      const { hospitalId } = req.user;

      // Validate hospitalId
      if (!hospitalId || !mongoose.Types.ObjectId.isValid(hospitalId)) {
        return res.status(400).json({
          success: false,
          message: 'Valid hospital ID is required'
        });
      }

      // Check if hospital exists
      const hospital = await mongoose.model('Hospital').findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Parallel execution for all counts
      const [
        affiliatedDoctorsCount,
        pendingRequestsCount,
        specializationStats
      ] = await Promise.all([
        // Count affiliated doctors
        mongoose.model('Doctor').countDocuments({
          $and: [
            {
              $or: [
                { 'hospitalAffiliations.hospital': hospitalId },
                { _id: { $in: hospital.doctors || [] } }
              ]
            },
            { isActive: true }
          ]
        }),

        // Count ONLY PENDING affiliation requests
        mongoose.model('HospitalAffiliationRequest').countDocuments({
          hospital: hospitalId,
          status: 'pending' // Only count pending requests
        }),

        // Get count for each specialization
        mongoose.model('Doctor').aggregate([
          {
            $match: {
              $and: [
                {
                  $or: [
                    { 'hospitalAffiliations.hospital': new mongoose.Types.ObjectId(hospitalId) },
                    { _id: { $in: hospital.doctors?.map(id => new mongoose.Types.ObjectId(id)) || [] } }
                  ]
                },
                { isActive: true }
              ]
            }
          },
          { $unwind: '$specializations' },
          {
            $group: {
              _id: '$specializations',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ])
      ]);

      return res.status(200).json({
        success: true,
        data: {
          hospital: {
            id: hospital._id,
            name: hospital.name
          },
          counts: {
            affiliatedDoctors: affiliatedDoctorsCount,
            pendingRequests: pendingRequestsCount, // Changed from affiliationRequestsCount to pendingRequests
            specializations: specializationStats.length, // Total unique specializations
            specializationBreakdown: specializationStats.map(stat => ({
              specialization: stat._id,
              count: stat.count
            }))
          }
        }
      });

    } catch (error) {
      console.error('Error fetching hospital doctor counts:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error while fetching counts',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getDoctorById: async (req, res) => {
    try {
      const { id } = req.params;

      // Validate ID format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid doctor ID format'
        });
      }

      // Find doctor and populate all necessary fields
      const doctor = await Doctor.findById(id)
        .populate('user', 'fullName profilePhoto email mobileNumber')
        .populate({
          path: 'hospitalAffiliations.hospital',
          select: 'name city type address contact photos statistics'
        })
        .lean(); // Convert to plain JavaScript object for better performance

      if (!doctor) {
        return res.status(404).json({
          success: false,
          message: 'Doctor not found'
        });
      }

      // Format the response to match your UI structure
      const formattedDoctor = {
        _id: doctor._id,
        user: doctor.user?._id,
        fullName: doctor.fullName || doctor.user?.fullName,
        title: doctor.title,
        specializations: doctor.specializations,
        registrationNumber: doctor.registrationNumber,
        qualifications: doctor.qualifications,
        experience: doctor.experience,
        languages: doctor.languages,
        bio: doctor.bio,
        clinicConsultationFee: doctor.clinicConsultationFee,
        onlineConsultation: doctor.onlineConsultation,
        hospitalAffiliations: doctor.hospitalAffiliations.map(affiliation => ({
          hospital: {
            _id: affiliation.hospital?._id,
            name: affiliation.hospital?.name,
            city: affiliation.hospital?.address?.city,
            type: affiliation.hospital?.type,
            contact: affiliation.hospital?.contact,
            statistics: affiliation.hospital?.statistics
          },
          department: affiliation.department,
          position: affiliation.position,
          from: affiliation.from,
          to: affiliation.to,
          currentlyWorking: affiliation.currentlyWorking
        })),
        address: doctor.address,
        isActive: doctor.isActive,
        review: {
          averageRating: doctor.review?.averageRating || 0,
          count: doctor.review?.count || 0
        },
        meetingLink: doctor.meetingLink,
        services: doctor.services || []
      };

      res.status(200).json({
        success: true,
        data: formattedDoctor
      });

    } catch (error) {
      console.error('Error fetching doctor:', error);
      res.status(500).json({
        success: false,
        message: 'Server error while fetching doctor details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  getHospitalDashboardStats: async (req, res) => {
    try {
      const { hospitalId } = req.user;

      // Validate hospital ID
      if (!hospitalId) {
        return res.status(400).json({
          success: false,
          message: 'Hospital ID is required'
        });
      }

      // Check if hospital exists
      const hospital = await Hospital.findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Get all doctors affiliated with this hospital (currently working)
      const affiliatedDoctors = await Doctor.find({
        'hospitalAffiliations.hospital': hospitalId,
        'hospitalAffiliations.currentlyWorking': true,
        isActive: true
      }).select('_id');

      const doctorIds = affiliatedDoctors.map(doc => doc._id);

      // Get total patients (unique patients who have appointments with doctors from this hospital)
      const totalPatientsResult = await Appointment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds },
            status: { $in: ['confirmed', 'completed'] }
          }
        },
        {
          $group: {
            _id: '$patient'
          }
        },
        {
          $count: 'totalPatients'
        }
      ]);

      // Get appointment statistics
      const appointmentStats = await Appointment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds }
          }
        },
        {
          $group: {
            _id: null,
            totalAppointments: { $sum: 1 },
            pendingAppointments: {
              $sum: {
                $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
              }
            },
            completedAppointments: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
              }
            }
          }
        }
      ]);

      // Get revenue statistics from payments
      const revenueStats = await Payment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds },
            status: 'captured'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount' }
          }
        }
      ]);

      // Get rating statistics from appointments with reviews
      const ratingStats = await Appointment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds },
            'review.rating': { $exists: true, $ne: null }
          }
        },
        {
          $group: {
            _id: null,
            averageRating: { $avg: '$review.rating' },
            totalReviews: { $sum: 1 }
          }
        }
      ]);

      // If no rating data found, use doctor's review data as fallback
      let doctorRatingStats = { averageRating: 0, totalReviews: 0 };
      if (doctorIds.length > 0) {
        doctorRatingStats = await Doctor.aggregate([
          {
            $match: {
              _id: { $in: doctorIds },
              'review.count': { $gt: 0 }
            }
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: '$review.averageRating' },
              totalReviews: { $sum: '$review.count' }
            }
          }
        ]);
      }

      // Prepare response data
      const dashboardData = {
        totalDoctors: doctorIds.length,
        totalPatients: totalPatientsResult.length > 0 ? totalPatientsResult[0].totalPatients : 0,
        totalAppointments: appointmentStats.length > 0 ? appointmentStats[0].totalAppointments : 0,
        totalRevenue: revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
        pendingAppointments: appointmentStats.length > 0 ? appointmentStats[0].pendingAppointments : 0,
        completedAppointments: appointmentStats.length > 0 ? appointmentStats[0].completedAppointments : 0,
        averageRating: 0,
        totalReviews: 0
      };

      // Use appointment reviews if available, otherwise use doctor reviews
      if (ratingStats.length > 0) {
        dashboardData.averageRating = parseFloat(ratingStats[0].averageRating.toFixed(2));
        dashboardData.totalReviews = ratingStats[0].totalReviews;
      } else if (doctorRatingStats.length > 0) {
        dashboardData.averageRating = parseFloat(doctorRatingStats[0].averageRating.toFixed(2));
        dashboardData.totalReviews = doctorRatingStats[0].totalReviews;
      }

      res.status(200).json({
        success: true,
        data: dashboardData,
        message: 'Hospital dashboard statistics retrieved successfully'
      });

    } catch (error) {
      console.error('Error fetching hospital dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  getHospitalDashboard: async (req, res) => {
    try {
      const { hospitalId } = req.user;

      // Verify hospital exists
      const hospital = await Hospital.findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Get doctors affiliated with this hospital
      const doctors = await Doctor.find({
        'hospitalAffiliations.hospital': hospitalId,
        isActive: true
      }).populate('user', 'fullName');

      const doctorIds = doctors.map(d => d._id);

      // Get date ranges
      const now = new Date();
      const startOfToday = new Date(now.setHours(0, 0, 0, 0));
      const endOfToday = new Date(now.setHours(23, 59, 59, 999));
      const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      // Revenue Data - Weekly
      const weeklyRevenue = await Payment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds },
            status: 'captured',
            createdAt: { $gte: startOfWeek }
          }
        },
        {
          $group: {
            _id: { $dayOfWeek: '$createdAt' },
            revenue: { $sum: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const dayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weekly = dayMap.map((day, index) => {
        const data = weeklyRevenue.find(r => r._id === index + 1);
        return { day, revenue: data ? data.revenue : 0 };
      });

      // Revenue Data - Monthly
      const monthlyRevenue = await Payment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds },
            status: 'captured',
            createdAt: { $gte: startOfYear }
          }
        },
        {
          $group: {
            _id: { $month: '$createdAt' },
            revenue: { $sum: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const monthMap = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthly = monthMap.map((month, index) => {
        const data = monthlyRevenue.find(r => r._id === index + 1);
        return { month, revenue: data ? data.revenue : 0 };
      });

      // Revenue Data - Yearly
      const yearlyRevenue = await Payment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds },
            status: 'captured'
          }
        },
        {
          $group: {
            _id: { $year: '$createdAt' },
            revenue: { $sum: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const yearly = yearlyRevenue.map(r => ({
        year: r._id.toString(),
        revenue: r.revenue
      }));

      // Specialty Distribution
      const specialtyDistribution = doctors.reduce((acc, doctor) => {
        doctor.specializations.forEach(spec => {
          const existing = acc.find(s => s.name === spec);
          if (existing) {
            existing.value++;
          } else {
            acc.push({ name: spec, value: 1 });
          }
        });
        return acc;
      }, []);

      const colors = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#6366f1', '#ef4444'];
      specialtyDistribution.forEach((item, index) => {
        item.color = colors[index % colors.length];
      });

      // Appointment Stats - Today
      const todayAppointments = await Appointment.find({
        doctor: { $in: doctorIds },
        date: { $gte: startOfToday, $lte: endOfToday }
      });

      const todayStats = {
        total: todayAppointments.length,
        completed: todayAppointments.filter(a => a.status === 'completed').length,
        pending: todayAppointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
        cancelled: todayAppointments.filter(a => a.status === 'cancelled').length
      };

      // Appointment Stats - Week
      const weekAppointments = await Appointment.find({
        doctor: { $in: doctorIds },
        date: { $gte: startOfWeek }
      });

      const weekStats = {
        total: weekAppointments.length,
        completed: weekAppointments.filter(a => a.status === 'completed').length,
        pending: weekAppointments.filter(a => a.status === 'pending' || a.status === 'confirmed').length,
        cancelled: weekAppointments.filter(a => a.status === 'cancelled').length
      };

      // Top Doctors by Revenue (Last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const doctorRevenue = await Payment.aggregate([
        {
          $match: {
            doctor: { $in: doctorIds },
            status: 'captured',
            createdAt: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: '$doctor',
            monthlyRevenue: { $sum: '$amount' }
          }
        },
        { $sort: { monthlyRevenue: -1 } },
        { $limit: 5 }
      ]);

      // If no revenue data, still show top 5 doctors by rating
      let topDoctors = [];

      if (doctorRevenue.length > 0) {
        topDoctors = doctorRevenue.map((rev) => {
          const doctor = doctors.find(d => d._id.toString() === rev._id.toString());
          if (doctor) {
            return {
              _id: doctor._id,
              fullName: doctor.fullName,
              specializations: doctor.specializations,
              averageRating: doctor.review.averageRating,
              totalRatings: doctor.review.count,
              experience: doctor.experience,
              monthlyRevenue: rev.monthlyRevenue,
              onlineConsultation: {
                isAvailable: doctor.onlineConsultation.consultationFee > 0,
                consultationFee: doctor.onlineConsultation.consultationFee
              },
              clinicConsultation: {
                isAvailable: doctor.clinicConsultationFee.consultationFee > 0,
                consultationFee: doctor.clinicConsultationFee.consultationFee
              }
            };
          }
          return null;
        }).filter(d => d !== null);
      } else {
        // Fallback: Show top 5 doctors by rating if no revenue data
        const sortedDoctors = doctors
          .sort((a, b) => b.review.averageRating - a.review.averageRating)
          .slice(0, 5);

        topDoctors = sortedDoctors.map(doctor => ({
          _id: doctor._id,
          fullName: doctor.fullName,
          specializations: doctor.specializations,
          averageRating: doctor.review.averageRating,
          totalRatings: doctor.review.count,
          experience: doctor.experience,
          monthlyRevenue: 0,
          onlineConsultation: {
            isAvailable: doctor.onlineConsultation.consultationFee > 0,
            consultationFee: doctor.onlineConsultation.consultationFee
          },
          clinicConsultation: {
            isAvailable: doctor.clinicConsultationFee.consultationFee > 0,
            consultationFee: doctor.clinicConsultationFee.consultationFee
          }
        }));
      }

      // Today's Appointments
      const todayAppointmentsList = await Appointment.find({
        doctor: { $in: doctorIds },
        date: { $gte: startOfToday, $lte: endOfToday }
      })
        .populate('patient', 'fullName')
        .populate('doctor', 'fullName specializations')
        .sort({ 'slot.startTime': 1 })
        .limit(10);

      res.status(200).json({
        success: true,
        data: {
          revenueData: {
            weekly,
            monthly,
            yearly
          },
          specialtyDistribution,
          appointmentStats: {
            today: todayStats,
            week: weekStats
          },
          topDoctors,
          todayAppointments: todayAppointmentsList
        }
      });

    } catch (error) {
      console.error('Error fetching hospital dashboard:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data',
        error: error.message
      });
    }
  },


  getHospitalPatients: async (req, res) => {
    try {
      const { hospitalId } = req.user;

      // Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Search parameter
      const search = req.query.search || '';

      // Filter parameters
      const statusFilter = req.query.status || '';
      const genderFilter = req.query.gender || '';

      // Sort parameters
      const sortField = req.query.sortField || 'fullName';
      const sortDirection = req.query.sortDirection === 'desc' ? -1 : 1;

      // Verify hospital exists
      const hospital = await Hospital.findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Get doctors affiliated with this hospital
      const doctors = await Doctor.find({
        'hospitalAffiliations.hospital': hospitalId,
        isActive: true
      });

      const doctorIds = doctors.map(d => d._id);

      // Build patient search query
      let patientQuery = {};
      if (search) {
        patientQuery.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { mobileNumber: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } }
        ];
      }

      if (genderFilter) {
        patientQuery.gender = genderFilter;
      }

      // Get all appointments for these doctors
      let appointmentQuery = { doctor: { $in: doctorIds } };

      if (statusFilter) {
        appointmentQuery.status = statusFilter;
      }

      const appointments = await Appointment.find(appointmentQuery)
        .populate('patient', 'fullName email mobileNumber gender dateOfBirth city state country')
        .populate('doctor', 'fullName specializations')
        .sort({ date: -1 });

      // Group appointments by patient
      const patientMap = new Map();

      appointments.forEach(appointment => {
        if (!appointment.patient) return;

        const patientId = appointment.patient._id.toString();

        if (!patientMap.has(patientId)) {
          patientMap.set(patientId, {
            _id: appointment.patient._id,
            fullName: appointment.patient.fullName,
            email: appointment.patient.email,
            mobileNumber: appointment.patient.mobileNumber,
            gender: appointment.patient.gender,
            dateOfBirth: appointment.patient.dateOfBirth,
            city: appointment.patient.city,
            state: appointment.patient.state,
            country: appointment.patient.country,
            appointments: []
          });
        }

        patientMap.get(patientId).appointments.push({
          _id: appointment._id,
          date: appointment.date,
          status: appointment.status,
          doctor: appointment.doctor.fullName,
          appointmentType: appointment.appointmentType,
          reason: appointment.reason,
          slot: appointment.slot
        });
      });

      // Convert map to array
      let patients = Array.from(patientMap.values());

      // Apply patient-level filters
      if (search) {
        patients = patients.filter(patient => {
          const searchLower = search.toLowerCase();
          return (
            patient.fullName?.toLowerCase().includes(searchLower) ||
            patient.email?.toLowerCase().includes(searchLower) ||
            patient.mobileNumber?.includes(search) ||
            patient.city?.toLowerCase().includes(searchLower) ||
            patient.appointments.some(apt =>
              apt.reason?.toLowerCase().includes(searchLower)
            )
          );
        });
      }

      if (genderFilter) {
        patients = patients.filter(patient => patient.gender === genderFilter);
      }

      if (statusFilter) {
        patients = patients.filter(patient =>
          patient.appointments.some(apt => apt.status === statusFilter)
        );
      }

      // Apply sorting
      patients.sort((a, b) => {
        let aValue, bValue;

        if (sortField === 'appointmentDate') {
          aValue = a.appointments[0]?.date || new Date(0);
          bValue = b.appointments[0]?.date || new Date(0);
        } else if (sortField === 'appointmentStatus') {
          aValue = a.appointments[0]?.status || '';
          bValue = b.appointments[0]?.status || '';
        } else if (sortField === 'reason') {
          aValue = a.appointments[0]?.reason || '';
          bValue = b.appointments[0]?.reason || '';
        } else {
          aValue = a[sortField] || '';
          bValue = b[sortField] || '';
        }

        if (aValue < bValue) return -1 * sortDirection;
        if (aValue > bValue) return 1 * sortDirection;
        return 0;
      });

      // Get total count before pagination
      const totalPatients = patients.length;
      const totalPages = Math.ceil(totalPatients / limit);

      // Apply pagination
      const paginatedPatients = patients.slice(skip, skip + limit);

      res.status(200).json({
        success: true,
        data: paginatedPatients,
        pagination: {
          currentPage: page,
          totalPages: totalPages,
          totalPatients: totalPatients,
          patientsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });

    } catch (error) {
      console.error('Error fetching hospital patients:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch patients data',
        error: error.message
      });
    }
  },
  getHospitalAppointments: async (req, res) => {
    try {
      const { hospitalId } = req.user;

      // Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 8;
      const skip = (page - 1) * limit;

      // Search parameter
      const search = req.query.search || '';

      // Filter parameters
      const statusFilter = req.query.status || 'all';
      const typeFilter = req.query.type || 'all';

      // Sort parameters
      const sortField = req.query.sortField || 'date';
      const sortDirection = req.query.sortDirection === 'asc' ? 1 : -1;

      // Verify hospital exists
      const hospital = await Hospital.findById(hospitalId);
      if (!hospital) {
        return res.status(404).json({
          success: false,
          message: 'Hospital not found'
        });
      }

      // Get doctors affiliated with this hospital
      const doctors = await Doctor.find({
        'hospitalAffiliations.hospital': hospitalId,
        isActive: true
      });

      const doctorIds = doctors.map(d => d._id);

      // Build query
      let query = { doctor: { $in: doctorIds } };

      // Apply status filter
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }

      // Apply type filter
      if (typeFilter !== 'all') {
        query.appointmentType = typeFilter;
      }

      // Apply search filter
      if (search) {
        const matchingPatients = await require('../models/User').find({
          $or: [
            { fullName: { $regex: search, $options: 'i' } },
            { mobileNumber: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');

        const matchingDoctors = await Doctor.find({
          fullName: { $regex: search, $options: 'i' }
        }).select('_id');

        query.$or = [
          { patient: { $in: matchingPatients.map(p => p._id) } },
          { doctor: { $in: matchingDoctors.map(d => d._id) } },
          { reason: { $regex: search, $options: 'i' } }
        ];
      }

      // Build sort object
      let sortObj = {};
      if (sortField === 'date') {
        sortObj.date = sortDirection;
      } else if (sortField === 'patient') {
        sortObj['patient.fullName'] = sortDirection;
      } else if (sortField === 'doctor') {
        sortObj['doctor.fullName'] = sortDirection;
      } else if (sortField === 'status') {
        sortObj.status = sortDirection;
      } else {
        sortObj.date = -1; // Default sort by date descending
      }

      // Get total count
      const totalAppointments = await Appointment.countDocuments(query);

      // Get appointments with pagination
      const appointments = await Appointment.find(query)
        .populate('patient', 'fullName email mobileNumber dateOfBirth bloodGroup addressLine1 city state pinCode')
        .populate('doctor', 'fullName specializations registrationNumber experience qualifications clinicConsultationFee onlineConsultation')
        .populate('payment', 'amount status')
        .sort(sortObj)
        .skip(skip)
        .limit(limit);

      // Calculate statistics for all filtered appointments (not just current page)
      const allFilteredAppointments = await Appointment.find(query);

      const stats = {
        total: allFilteredAppointments.length,
        clinic: allFilteredAppointments.filter(a => a.appointmentType === 'clinic').length,
        video: allFilteredAppointments.filter(a => a.appointmentType === 'video').length,
        pending: allFilteredAppointments.filter(a => a.status === 'pending').length,
        completed: allFilteredAppointments.filter(a => a.status === 'completed').length,
        cancelled: allFilteredAppointments.filter(a => a.status === 'cancelled').length,
        rescheduled: allFilteredAppointments.filter(a => a.status === 'rescheduled').length
      };

      // Format appointments data
      const formattedAppointments = appointments.map(appointment => ({
        _id: appointment._id,
        patient: {
          _id: appointment.patient._id,
          fullName: appointment.patient.fullName,
          email: appointment.patient.email,
          mobileNumber: appointment.patient.mobileNumber,
          dateOfBirth: appointment.patient.dateOfBirth,
          bloodGroup: appointment.patient.bloodGroup,
          addressLine1: appointment.patient.addressLine1,
          city: appointment.patient.city,
          state: appointment.patient.state,
          pinCode: appointment.patient.pinCode
        },
        doctor: {
          _id: appointment.doctor._id,
          fullName: appointment.doctor.fullName,
          specializations: appointment.doctor.specializations,
          registrationNumber: appointment.doctor.registrationNumber,
          experience: appointment.doctor.experience,
          qualifications: appointment.doctor.qualifications,
          clinicConsultationFee: appointment.doctor.clinicConsultationFee,
          onlineConsultation: appointment.doctor.onlineConsultation,
          averageRating: appointment.doctor.review?.averageRating || 0,
          totalRatings: appointment.doctor.review?.count || 0
        },
        appointmentType: appointment.appointmentType,
        date: appointment.date,
        slot: appointment.slot,
        reason: appointment.reason,
        status: appointment.status,
        payment: appointment.payment ? {
          _id: appointment.payment._id,
          amount: appointment.payment.amount,
          status: appointment.payment.status
        } : null,
        medicalRecords: appointment.medicalRecords || [],
        prescription: appointment.prescription || null,
        review: appointment.review || null
      }));

      const totalPages = Math.ceil(totalAppointments / limit);

      res.status(200).json({
        success: true,
        data: formattedAppointments,
        stats,
        pagination: {
          currentPage: page,
          totalPages,
          totalAppointments,
          appointmentsPerPage: limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      });

    } catch (error) {
      console.error('Error fetching hospital appointments:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch appointments data',
        error: error.message
      });
    }
  },

  getHospitalReviews: async (req, res) => {
    try {
      const { hospitalId } = req.user;

      // Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Search and filter parameters
      const searchTerm = req.query.search || '';
      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      // Find all doctors affiliated with this hospital
      const hospitalDoctors = await Doctor.find({
        'hospitalAffiliations.hospital': hospitalId
      }).select('_id');

      const doctorIds = hospitalDoctors.map(doc => doc._id);

      if (doctorIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            reviews: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalReviews: 0,
              limit,
              hasNextPage: false,
              hasPrevPage: false
            },
            statistics: {
              totalReviews: 0,
              averageRating: 0,
              verifiedConsultations: 0
            }
          }
        });
      }

      // Build query for appointments with reviews
      let query = {
        doctor: { $in: doctorIds },
        'review.rating': { $exists: true, $ne: null }
      };

      // Add search functionality
      if (searchTerm) {
        const searchRegex = new RegExp(searchTerm, 'i');

        // Find matching doctors or patients
        const matchingDoctors = await Doctor.find({
          _id: { $in: doctorIds },
          $or: [
            { fullName: searchRegex },
            { specializations: searchRegex }
          ]
        }).select('_id');

        const matchingPatients = await User.find({
          fullName: searchRegex
        }).select('_id');

        query.$or = [
          { doctor: { $in: matchingDoctors.map(d => d._id) } },
          { patient: { $in: matchingPatients.map(p => p._id) } },
          { 'review.feedback': searchRegex }
        ];
      }

      // Get total count for pagination
      const totalReviews = await Appointment.countDocuments(query);

      // Build sort object
      let sortObj = {};
      if (sortBy === 'rating') {
        sortObj['review.rating'] = sortOrder;
      } else if (sortBy === 'createdAt') {
        sortObj['review.createdAt'] = sortOrder;
      } else if (sortBy === 'doctor.fullName') {
        sortObj = {}; // Will handle after population
      } else if (sortBy === 'patient.fullName') {
        sortObj = {}; // Will handle after population
      } else {
        sortObj['review.createdAt'] = -1; // Default sort
      }

      // Fetch appointments with reviews
      let appointments = await Appointment.find(query)
        .populate({
          path: 'doctor',
          select: 'fullName specializations'
        })
        .populate({
          path: 'patient',
          select: 'fullName'
        })
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean();

      // Manual sorting for populated fields if needed
      if (sortBy === 'doctor.fullName' || sortBy === 'patient.fullName') {
        appointments.sort((a, b) => {
          let aVal, bVal;
          if (sortBy === 'doctor.fullName') {
            aVal = a.doctor?.fullName || '';
            bVal = b.doctor?.fullName || '';
          } else {
            aVal = a.patient?.fullName || '';
            bVal = b.patient?.fullName || '';
          }
          return sortOrder === 1
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        });
      }

      // Transform data to match frontend format
      const reviews = appointments.map(appointment => ({
        _id: appointment._id.toString(),
        appointment: appointment._id.toString(),
        patient: {
          _id: appointment.patient?._id?.toString() || '',
          fullName: appointment.patient?.fullName || 'Anonymous'
        },
        doctor: {
          _id: appointment.doctor?._id?.toString() || '',
          fullName: appointment.doctor?.fullName || 'Unknown',
          specializations: appointment.doctor?.specializations || []
        },
        rating: appointment.review.rating,
        feedback: appointment.review.feedback || '',
        aspects: {
          waitingTime: appointment.review.aspects?.waitingTime || 0,
          staffCourteousness: appointment.review.aspects?.staffCourteousness || 0,
          doctorKnowledge: appointment.review.aspects?.doctorKnowledge || 0,
          doctorFriendliness: appointment.review.aspects?.doctorFriendliness || 0,
          treatmentExplanation: appointment.review.aspects?.treatmentExplanation || 0
        },
        isVerifiedConsultation: appointment.status === 'completed',
        helpfulCount: 0, // Not in schema, placeholder
        unhelpfulCount: 0, // Not in schema, placeholder
        createdAt: appointment.review.createdAt || appointment.createdAt
      }));

      // Calculate statistics
      const allReviewsForStats = await Appointment.find({
        doctor: { $in: doctorIds },
        'review.rating': { $exists: true, $ne: null }
      }).select('review status');

      const totalReviewCount = allReviewsForStats.length;
      const averageRating = totalReviewCount > 0
        ? allReviewsForStats.reduce((sum, apt) => sum + apt.review.rating, 0) / totalReviewCount
        : 0;
      const verifiedConsultations = allReviewsForStats.filter(
        apt => apt.status === 'completed'
      ).length;

      // Pagination metadata
      const totalPages = Math.ceil(totalReviews / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          reviews,
          pagination: {
            currentPage: page,
            totalPages,
            totalReviews,
            limit,
            hasNextPage,
            hasPrevPage
          },
          statistics: {
            totalReviews: totalReviewCount,
            averageRating: parseFloat(averageRating.toFixed(1)),
            verifiedConsultations
          }
        }
      });

    } catch (error) {
      console.error('Error fetching hospital reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch hospital reviews',
        error: error.message
      });
    }
  },


  getHospitalEarnings: async (req, res) => {
    try {
      const { hospitalId } = req.user;

      // Pagination parameters
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      // Search and filter parameters
      const searchTerm = req.query.search || '';
      const statusFilter = req.query.status || 'all';
      const sortBy = req.query.sortBy || 'scheduledDate';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      // Find all doctors affiliated with this hospital
      const hospitalDoctors = await Doctor.find({
        'hospitalAffiliations.hospital': hospitalId
      }).select('_id fullName specializations');

      const doctorIds = hospitalDoctors.map(doc => doc._id);

      if (doctorIds.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            earnings: [],
            pagination: {
              currentPage: page,
              totalPages: 0,
              totalEarnings: 0,
              limit,
              hasNextPage: false,
              hasPrevPage: false
            },
            statistics: {
              totalRevenue: 0,
              pendingRevenue: 0,
              creditedRevenue: 0,
              cancelledRevenue: 0
            }
          }
        });
      }

      // Build query
      let query = {
        doctor: { $in: doctorIds }
      };

      // Add status filter
      if (statusFilter !== 'all') {
        query.status = statusFilter;
      }

      // Add search functionality
      if (searchTerm) {
        const searchRegex = new RegExp(searchTerm, 'i');

        // Find matching doctors
        const matchingDoctors = await Doctor.find({
          _id: { $in: doctorIds },
          $or: [
            { fullName: searchRegex },
            { specializations: searchRegex }
          ]
        }).select('_id');

        // Search by amount or doctor
        const amountSearch = parseFloat(searchTerm);
        if (!isNaN(amountSearch)) {
          query.$or = [
            { doctor: { $in: matchingDoctors.map(d => d._id) } },
            { amount: amountSearch }
          ];
        } else {
          query.doctor = { $in: matchingDoctors.map(d => d._id) };
        }
      }

      // Get total count for pagination
      const totalEarnings = await UpcomingEarnings.countDocuments(query);

      // Build sort object
      let sortObj = {};
      if (sortBy === 'amount') {
        sortObj.amount = sortOrder;
      } else if (sortBy === 'status') {
        sortObj.status = sortOrder;
      } else if (sortBy === 'scheduledDate') {
        sortObj.scheduledDate = sortOrder;
      } else {
        sortObj.scheduledDate = -1; // Default sort
      }

      // Fetch upcoming earnings
      let earnings = await UpcomingEarnings.find(query)
        .populate({
          path: 'doctor',
          select: 'fullName specializations'
        })
        .populate({
          path: 'appointment',
          select: 'date appointmentType'
        })
        .populate({
          path: 'payment',
          select: 'amount totalamount gateway.transactionId'
        })
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .lean();

      // Manual sorting for doctor name if needed
      if (sortBy === 'doctorInfo.fullName') {
        earnings.sort((a, b) => {
          const aVal = a.doctor?.fullName || '';
          const bVal = b.doctor?.fullName || '';
          return sortOrder === 1
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        });
      }

      // Transform data to match frontend format
      const formattedEarnings = earnings.map(earning => ({
        _id: earning._id.toString(),
        amount: earning.amount,
        status: earning.status,
        scheduledDate: earning.scheduledDate,
        doctor: earning.doctor?._id?.toString() || '',
        payment: earning.payment?._id?.toString() || '',
        appointment: earning.appointment?._id?.toString() || '',
        doctorInfo: {
          _id: earning.doctor?._id?.toString() || '',
          fullName: earning.doctor?.fullName || 'Unknown',
          specializations: earning.doctor?.specializations || []
        },
        appointmentDate: earning.appointment?.date || null,
        appointmentType: earning.appointment?.appointmentType || null,
        paymentAmount: earning.payment?.amount || 0,
        transactionId: earning.payment?.gateway?.transactionId || null,
        notes: earning.notes || ''
      }));

      // Calculate statistics for all earnings (not just current page)
      const allEarnings = await UpcomingEarnings.find({
        doctor: { $in: doctorIds }
      }).select('amount status');

      const totalRevenue = allEarnings.reduce((sum, e) => sum + e.amount, 0);
      const pendingRevenue = allEarnings
        .filter(e => e.status === 'pending')
        .reduce((sum, e) => sum + e.amount, 0);
      const creditedRevenue = allEarnings
        .filter(e => e.status === 'credited')
        .reduce((sum, e) => sum + e.amount, 0);
      const cancelledRevenue = allEarnings
        .filter(e => e.status === 'cancelled')
        .reduce((sum, e) => sum + e.amount, 0);

      // Pagination metadata
      const totalPages = Math.ceil(totalEarnings / limit);
      const hasNextPage = page < totalPages;
      const hasPrevPage = page > 1;

      res.status(200).json({
        success: true,
        data: {
          earnings: formattedEarnings,
          pagination: {
            currentPage: page,
            totalPages,
            totalEarnings,
            limit,
            hasNextPage,
            hasPrevPage
          },
          statistics: {
            totalRevenue: parseFloat(totalRevenue.toFixed(2)),
            pendingRevenue: parseFloat(pendingRevenue.toFixed(2)),
            creditedRevenue: parseFloat(creditedRevenue.toFixed(2)),
            cancelledRevenue: parseFloat(cancelledRevenue.toFixed(2))
          }
        }
      });

    } catch (error) {
      console.error('Error fetching hospital earnings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch hospital earnings',
        error: error.message
      });
    }
  },


  getEarningDetails: async (req, res) => {
    try {
      const { earningId } = req.user;

      const earning = await UpcomingEarnings.findById(earningId)
        .populate({
          path: 'doctor',
          select: 'fullName specializations registrationNumber'
        })
        .populate({
          path: 'appointment',
          select: 'date appointmentType status reason',
          populate: {
            path: 'patient',
            select: 'fullName email mobileNumber'
          }
        })
        .populate({
          path: 'payment',
          select: 'amount totalamount gstamount status paymentMethod gateway'
        })
        .lean();

      if (!earning) {
        return res.status(404).json({
          success: false,
          message: 'Earning record not found'
        });
      }

      // Format response
      const formattedEarning = {
        _id: earning._id.toString(),
        amount: earning.amount,
        status: earning.status,
        scheduledDate: earning.scheduledDate,
        notes: earning.notes,
        createdAt: earning.createdAt,
        updatedAt: earning.updatedAt,
        doctor: {
          _id: earning.doctor?._id?.toString() || '',
          fullName: earning.doctor?.fullName || 'Unknown',
          specializations: earning.doctor?.specializations || [],
          registrationNumber: earning.doctor?.registrationNumber || ''
        },
        appointment: {
          _id: earning.appointment?._id?.toString() || '',
          date: earning.appointment?.date || null,
          appointmentType: earning.appointment?.appointmentType || null,
          status: earning.appointment?.status || null,
          reason: earning.appointment?.reason || '',
          patient: {
            fullName: earning.appointment?.patient?.fullName || 'Unknown',
            email: earning.appointment?.patient?.email || '',
            mobileNumber: earning.appointment?.patient?.mobileNumber || ''
          }
        },
        payment: {
          _id: earning.payment?._id?.toString() || '',
          amount: earning.payment?.amount || 0,
          totalamount: earning.payment?.totalamount || 0,
          gstamount: earning.payment?.gstamount || 0,
          status: earning.payment?.status || '',
          paymentMethod: earning.payment?.paymentMethod || '',
          transactionId: earning.payment?.gateway?.transactionId || null,
          referenceId: earning.payment?.gateway?.referenceId || null
        }
      };

      res.status(200).json({
        success: true,
        data: formattedEarning
      });

    } catch (error) {
      console.error('Error fetching earning details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch earning details',
        error: error.message
      });
    }
  }

}





module.exports = DoctorController;