const express = require('express');
const app = express();
const connectDB = require('./config/db');
const availabilityRouter = require("./routes/availabilityRoute");
const appointmentRouter = require("./routes/appointmentRoute");
const appointmentCleanup = require('./utils/appointmentCleanup');
require("dotenv").config();



// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use("/available-slots", availabilityRouter);
app.use("/appointments", appointmentRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
  appointmentCleanup.startCleanupJob();
});