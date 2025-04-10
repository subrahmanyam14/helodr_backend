const multer = require("multer");
const path = require("path");

const configureFileUpload = (fieldName) => {
  // Configure multer memory storage
  const storage = multer.memoryStorage();

  // Define allowed file types (images and PDF)
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf"
  ];

  // Configure multer instance with file validation
  const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
      console.log(file.mimetype);
      
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only images (JPEG, PNG, WEBP) and PDF files are allowed"), false);
      }
    },
    limits: {
      fileSize: 5 * 1024 * 1024 // 5MB file size limit
    }
  });

  // Return middleware for single file upload
  return upload.single(fieldName);
};

module.exports = configureFileUpload;