const express = require('express');
const app = express();
const connectDB = require('./config/db');
require("dotenv").config();
const  {startNotificationListener}  = require("./controller/NotificationController");

app.use(express.json());
const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
  startNotificationListener();
});