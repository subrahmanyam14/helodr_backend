const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const express = require('express');

const storageRouter = express.Router();


// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer storage with Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "uploads", // Cloudinary folder name
        allowed_formats: ["jpeg", "png", "svg", "pdf", "docx"],
    },
});

const upload = multer({ storage: storage });

// Upload single file endpoint
storageRouter.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }
    res.json({ url: req.file.path, message: "File uploaded successfully!" });
});

// Upload multiple files endpoint
storageRouter.post("/upload-multiple", upload.array("files", 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded." });
    }
    const fileUrls = req.files.map(file => file.path);
    res.json({ urls: fileUrls, message: "Files uploaded successfully!" });
});

module.exports = storageRouter;