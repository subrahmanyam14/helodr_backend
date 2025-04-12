const express = require('express');
const app = express();
const connectDB = require('./config/db');
require("dotenv").config();
const  {startNotificationListener}  = require("./controller/NotificationController");
const Notification = require("./models/Notification")

app.use(express.json());

app.post("/", async( req, res) => {
  try {
    const {user, message, referenceId, type} = req.body;
    await Notification.create({user, message, referenceId, type});
    res.status(201).send({success: true, message: "Notification created."})
  } catch (error) {
    console.log("Error in the create notification, ", error);
    res.status(500).send({success: false, message: "Internal server error."});
  }
})
const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
  startNotificationListener();
});