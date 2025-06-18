const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const mailRouter = require('./mailService/sendEmailVerification');
const smsRouter = require('./smsService/sendOTP');
const storageRouter = require('./storageService/uploadFileData');
dotenv.config();

const app = express();

// Serve static files from the 'uploads' directory at /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(express.json());
app.use(cors());

app.use('/mail', mailRouter);
app.use('/sms', smsRouter);
app.use('/storage', storageRouter);

app.listen(process.env.PORT || 5000, () => 
    console.log(`Transport and Storage Management Service running on port ${process.env.PORT}`)
);