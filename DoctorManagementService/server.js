const express = require('express');
const app = express();
const doctorRoutes = require('./routes/doctorRoutes');
const connectDB = require('./config/db');

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount routes
app.use('/doctors', doctorRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle multer errors
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  }
  
  res.status(500).json({
    success: false,
    message: err.message || 'Something went wrong on the server'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
});