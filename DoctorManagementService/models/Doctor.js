const mongoose = require('mongoose');

const specializationMapping = {
  "Internal Medicine": [
    "Infectious Disease",
    "Geriatric Medicine",
    "Critical Care",
    "Allergy & Immunology",
    "Rheumatology",
    "Sleep Medicine",
    "General Medicine"
  ],
  "Pediatrics": [
    "Neonatology",
    "Pediatric Cardiology",
    "Pediatric Critical Care",
    "Pediatric Neurology",
    "Pediatric Gastroenterology",
    "Pediatric Oncology",
    "Pediatric Endocrinology",
    "Developmental Pediatrics",
    "Adolescent Medicine"
  ],
  "Obstetrics & Gynecology": [
    "Maternal-Fetal Medicine",
    "Gynecologic Oncology",
    "Reproductive Endocrinology",
    "Urogynecology",
    "High-Risk Pregnancy",
    "Infertility",
    "Menopause Management"
  ],
  "Surgery": [
    "General Surgery",
    "Cardiothoracic Surgery",
    "Colorectal Surgery",
    "Pediatric Surgery",
    "Plastic Surgery",
    "Vascular Surgery",
    "Surgical Oncology",
    "Trauma Surgery",
    "Transplant Surgery",
    "Bariatric Surgery"
  ],
  "Orthopedics": [
    "Spine Surgery",
    "Joint Replacement",
    "Sports Medicine",
    "Trauma Orthopedics",
    "Pediatric Orthopedics",
    "Hand Surgery",
    "Foot & Ankle Surgery",
    "Shoulder & Elbow Surgery",
    "Arthroscopy"
  ],
  "Dermatology": [
    "Cosmetic Dermatology",
    "Pediatric Dermatology",
    "Dermatopathology",
    "Mohs Surgery",
    "Hair Transplantation",
    "Laser Treatment",
    "Vitiligo Treatment",
    "Psoriasis Treatment"
  ],
  "Ophthalmology": [
    "Cataract Surgery",
    "Glaucoma",
    "Cornea & External Diseases",
    "Retina & Vitreous",
    "Pediatric Ophthalmology",
    "Neuro-ophthalmology",
    "Oculoplasty",
    "LASIK & Refractive Surgery"
  ],
  "Psychiatry": [
    "Child & Adolescent Psychiatry",
    "Geriatric Psychiatry",
    "Addiction Psychiatry",
    "Consultation-Liaison Psychiatry",
    "Forensic Psychiatry",
    "Sleep Medicine",
    "Neuropsychiatry"
  ],
  "Neurology": [
    "Stroke",
    "Epilepsy",
    "Movement Disorders",
    "Neuro-oncology",
    "Neuromuscular Disorders",
    "Multiple Sclerosis",
    "Headache Medicine",
    "Sleep Medicine"
  ],
  "Cardiology": [
    "Interventional Cardiology",
    "Electrophysiology",
    "Heart Failure",
    "Echocardiography",
    "Nuclear Cardiology",
    "Preventive Cardiology",
    "Pediatric Cardiology",
    "Cardiac Rehabilitation"
  ],
  "ENT": [
    "Otology",
    "Rhinology",
    "Laryngology",
    "Head & Neck Surgery",
    "Facial Plastic Surgery",
    "Pediatric ENT",
    "Cochlear Implants",
    "Sleep Medicine"
  ],
  "Urology": [
    "Endourology",
    "Pediatric Urology",
    "Urologic Oncology",
    "Female Urology",
    "Andrology",
    "Reconstructive Urology",
    "Kidney Transplantation"
  ],
  "Gastroenterology": [
    "Hepatology",
    "Inflammatory Bowel Disease",
    "Therapeutic Endoscopy",
    "Pancreaticobiliary Diseases",
    "Functional GI Disorders",
    "GI Oncology",
    "Nutrition Support"
  ],
  "Pulmonology": [
    "Interventional Pulmonology",
    "Pulmonary Hypertension",
    "Lung Transplantation",
    "Sleep Medicine",
    "Critical Care",
    "Allergy & Immunology",
    "Tuberculosis & Chest Infections"
  ],
  "Endocrinology": [
    "Diabetes Management",
    "Thyroid Disorders",
    "Reproductive Endocrinology",
    "Pediatric Endocrinology",
    "Metabolic Disorders",
    "Osteoporosis",
    "Obesity Management"
  ],
  "Nephrology": [
    "Dialysis",
    "Kidney Transplantation",
    "Hypertension",
    "Glomerular Diseases",
    "Electrolyte Disorders",
    "Critical Care Nephrology"
  ],
  "Oncology": [
    "Medical Oncology",
    "Radiation Oncology",
    "Surgical Oncology",
    "Hematologic Oncology",
    "Pediatric Oncology",
    "Gynecologic Oncology",
    "Neuro-oncology",
    "Breast Cancer",
    "GI Cancer"
  ],
  "Radiology": [
    "Diagnostic Radiology",
    "Interventional Radiology",
    "Neuroradiology",
    "Pediatric Radiology",
    "Musculoskeletal Radiology",
    "Breast Imaging",
    "Nuclear Medicine"
  ],
  "Anesthesiology": [
    "Cardiac Anesthesia",
    "Neuroanesthesia",
    "Pediatric Anesthesia",
    "Obstetric Anesthesia",
    "Pain Medicine",
    "Critical Care",
    "Regional Anesthesia"
  ],
  "Dentistry": [
    "Orthodontics",
    "Endodontics",
    "Periodontics",
    "Prosthodontics",
    "Oral Surgery",
    "Pediatric Dentistry", 
    "Cosmetic Dentistry",
    "Implantology"
  ],
  "Ayurveda": [
    "Panchakarma",
    "Kayachikitsa",
    "Shalya Tantra",
    "Shalakya Tantra",
    "Kaumarbhritya",
    "Rasayana",
    "Vajikarana"
  ],
  "Homeopathy": [
    "Classical Homeopathy",
    "Constitutional Homeopathy",
    "Pediatric Homeopathy",
    "Homeopathic Dermatology",
    "Homeopathic Psychiatry"
  ],
  "Unani": [
    "Ilaj-bit-Tadbeer",
    "Moalejat",
    "Jarahiyat",
    "Ain-Uzn-Anf-Halaq"
  ],
  "Physiotherapy": [
    "Orthopedic Physiotherapy", 
    "Neurological Physiotherapy",
    "Cardiorespiratory Physiotherapy",
    "Sports Physiotherapy",
    "Pediatric Physiotherapy",
    "Geriatric Physiotherapy",
    "Women's Health"
  ],
  "Nutrition & Dietetics": [
    "Clinical Nutrition",
    "Sports Nutrition",
    "Pediatric Nutrition",
    "Diabetes Management",
    "Weight Management",
    "Renal Nutrition",
    "Oncology Nutrition"
  ]
};

const doctorSchema = new mongoose.Schema({
  // Basic Information
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  title: {
    type: String,
    enum: ["Dr.", "Prof.", "Mr.", "Mrs.", "Ms.", null],
    default: "Dr."
  },
  specialization: {
    type: String,
    required: [true, "Specialization is required"],
    enum: Object.keys(specializationMapping),
    index: true
  },
  subSpecializations: [{
    type: String,
    enum: [].concat(...Object.values(specializationMapping)),
    index: true,
    validate: {
      validator: function(value) {
        // Validate that subspecialization belongs to the doctor's specialization
        return specializationMapping[this.specialization].includes(value);
      },
      message: props => `${props.value} is not a valid subspecialization for ${this.specialization}`
    }
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
    position: String
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
  },

  verifiedBySuperAdmin: {
    superAdmin:
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    verifiedAt: Date,
    comments: String
  },

  isActive: {
    type: Boolean,
    default: false
  }
});

const Doctor = mongoose.model("Doctor", doctorSchema);

module.exports = Doctor;
