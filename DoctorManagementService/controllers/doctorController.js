const Doctor = require('../models/Doctor');
const Hospital = require('../models/Hospital');
const BankDetails = require('../models/BankDetails');
const Settings = require('../models/Settings');
const Wallet = require('../models/Wallet');
const Statistics = require('../models/Statistics');
const mongoose = require('mongoose');

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

const DoctorController = {
  // Register a new doctor
  registerDoctor: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const {
        title,
        specialization,
        subSpecializations,
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
      
      // Check if doctor already exists with this user ID
      const existingDoctor = await Doctor.findOne({ user: req.user.id });
      if (existingDoctor) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: 'Doctor profile already exists for this user' });
      }
      
      // Create new doctor
      const newDoctor = new Doctor({
        user: req.user.id,
        title: title || 'Dr.',
        specialization,
        subSpecializations: subSpecializations || [],
        registrationNumber,
        qualifications: qualifications || [],
        experience: experience || 0,
        languages: languages || [],
        bio: bio || '',
        clinicConsultationFee: clinicConsultationFee || 0,
        followUpFee: followUpFee || 0,
        services: services || [],
        onlineConsultation: onlineConsultation || { isAvailable: false, consultationFee: 0 },
        verification: {
          status: 'pending',
          documents: req.files ? req.files.map(file => file.path) : [],
          verifiedAt: null
        },
        isActive: false
      });
      
      await newDoctor.save({ session });
      
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
      
      await session.commitTransaction();
      session.endSession();
      
      res.status(201).json({
        success: true,
        message: 'Doctor registered successfully',
        doctor: newDoctor,
        settings: newSettings
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.log("Error in the resgisterDoctor: ", error);
      res.status(500).json({
        success: false,
        message: 'Error registering doctor',
        error: error.message
      });
    }
  },
  
  // Add or update hospital affiliations
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
      await Doctor.findOneAndUpdate({user: req.user.id}, {
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
  }
};

module.exports = DoctorController;