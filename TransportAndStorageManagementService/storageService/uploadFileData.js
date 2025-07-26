const multer = require("multer");
const path = require("path");
const fs = require("fs");
const express = require('express');

const storageRouter = express.Router();

// Create directories if they don't exist
const createDirectories = () => {
    const dirs = ['uploads/images', 'uploads/pdfs', 'uploads/videos', 'uploads/documents'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

// Call this function to ensure directories exist
createDirectories();

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = 'uploads/';
        
        // Determine folder based on file type
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(fileExtension)) {
            uploadPath += 'images/';
        } else if (['.pdf'].includes(fileExtension)) {
            uploadPath += 'pdfs/';
        } else if (['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'].includes(fileExtension)) {
            uploadPath += 'videos/';
        } else if (['.doc', '.docx', '.txt', '.rtf'].includes(fileExtension)) {
            uploadPath += 'documents/';
        } else {
            uploadPath += 'documents/'; // Default folder for other file types
        }
        
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const fileExtension = path.extname(file.originalname);
        const fileName = file.fieldname + '-' + uniqueSuffix + fileExtension;
        cb(null, fileName);
    }
});

// File filter to validate file types
const fileFilter = (req, file, cb) => {
    const allowedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', // Images
        '.pdf', // PDFs
        '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', // Videos
        '.doc', '.docx', '.txt', '.rtf' // Documents
    ];
    
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(fileExtension)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, PDFs, videos, and documents are allowed.'), false);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

// Serve static files from uploads directory
storageRouter.use('/files', express.static('uploads'));

// Upload single file endpoint
storageRouter.post("/upload", upload.single("file"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded." });
    }
    
    const fileUrl = `${process.env.TRANSPORT_URL}/uploads/${req.file.destination.split('/')[1]}/${req.file.filename}`;
    
    res.json({ 
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
        folder: req.file.destination.split('/')[1],
        message: "File uploaded successfully!" 
    });
});

// Upload multiple files endpoint
storageRouter.post("/upload-multiple", upload.array("files", 10), (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "No files uploaded." });
    }
    
    const fileDetails = req.files.map(file => ({
        url: `${process.env.TRANSPORT_URL}/uploads/${file.destination.split('/')[1]}/${file.filename}`,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        type: file.mimetype,
        folder: file.destination.split('/')[1]
    }));
    
    res.json({ 
        files: fileDetails,
        message: "Files uploaded successfully!" 
    });
});

// Get file info endpoint
storageRouter.get("/file-info/:folder/:filename", (req, res) => {
    const { folder, filename } = req.params;
    const filePath = path.join('uploads', folder, filename);
    
    if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        res.json({
            filename: filename,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            folder: folder
        });
    } else {
        res.status(404).json({ message: "File not found." });
    }
});

// Delete file endpoint
storageRouter.delete("/delete/:folder/:filename", (req, res) => {
    const { folder, filename } = req.params;
    const filePath = path.join('uploads', folder, filename);
    
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ message: "File deleted successfully!" });
    } else {
        res.status(404).json({ message: "File not found." });
    }
});

// List files in a folder endpoint
storageRouter.get("/list/:folder", (req, res) => {
    const { folder } = req.params;
    const folderPath = path.join('uploads', folder);
    
    if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath).map(filename => {
            const filePath = path.join(folderPath, filename);
            const stats = fs.statSync(filePath);
            return {
                filename: filename,
                url: `/api/storage/files/${folder}/${filename}`,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        });
        res.json({ files: files });
    } else {
        res.status(404).json({ message: "Folder not found." });
    }
});

// Error handling middleware
storageRouter.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File size too large. Maximum size is 50MB.' });
        }
    }
    
    if (error.message === 'Invalid file type. Only images, PDFs, videos, and documents are allowed.') {
        return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Something went wrong during file upload.' });
});

module.exports = storageRouter;