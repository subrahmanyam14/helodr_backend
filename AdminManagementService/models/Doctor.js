const mongoose = require('mongoose');
const User = require('./User'); 


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

const doctorSchema = new mongoose.Schema({
  // Basic Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  fullName: {
    type: String
  },
  title: {
    type: String,
    enum: ["Dr.", "Prof.", "Mr.", "Mrs.", "Ms.", null],
    default: "Dr."
  },
  specializations: [{
    type: String,
    required: [true, "Specialization is required"],
    enum: specializationEnum,
    index: true
  }],
  registrationNumber: {
    type: String,
    required: true,
    unique: true
  },

  // Professional Details
  qualifications: [{
    degree: String,
    college: String,
    year: Number,
    certificateUrl: String
  }],
  experience: {
    type: Number,
    min: 0,
    default: 0
  },
  languages: [String],
  bio: {
    type: String,
    maxlength: 2000
  },

  // Practice Information
  clinicConsultationFee: {
    isAvailable: {
      type: Boolean,
      default: false
    },
    consultationFee: {
      type: Number,
      min: 0,
      default: 0
    },
    followUpFee: {
      type: Number,
      min: 0
    },
  },
  // Online Consultation
  onlineConsultation: {
    isAvailable: {
      type: Boolean,
      default: false
    },
    consultationFee: {
      type: Number,
      min: 0,
      default: 0
    },
    followUpFee: {
      type: Number,
      min: 0
    }
  },
  services: [String],

  // Hospital Affiliations
  hospitalAffiliations: [{
    hospital: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital"
    },
    department: String,
    position: String,
    from: Date,
    to: Date,
    currentlyWorking: {type: Boolean, default: false}
  }],

  address: {
    street: String,
    city: String,
    state: String,
    country: {
      type: String,
      default: "India"
    },
    pinCode: String,
    coordinates: {
      type: [Number], // [longitude, latitude]
      index: "2dsphere"
    }
  },
  // Verification
  verification: {
    status: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending"
    },
    documents: [String],
    verifiedAt: Date
  },

  verifiedByAdmin: {
    admin:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: Date,
    comments: String
  },//todo-add verified by hospitaladmin

  verifiedBySuperAdmin: {
    superAdmin:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: Date,
    comments: String
  },   //pikey

  isActive: {
    type: Boolean,
    default: false
  },

  averageRating: {
    type: Number,
    default: 0
  },

  totalRatings: {
    type: Number,
    default: 0
  },
  meetingLink: {
    type: String,
    required: true
  }
});

doctorSchema.pre('save', async function (next) {
  if (this.isNew || this.isModified('user')) {
    try {
      const user = await mongoose.model('User').findById(this.user);
      if (user) {
        this.fullName = user.fullName; 
      }
    } catch (err) {
      return next(err);
    }
  }
  next();
});

const Doctor = mongoose.model("Doctor", doctorSchema);

module.exports = Doctor;
