const express = require('express');
const app = express();
const connectDB = require('./config/db');
const Payment=require('./routes/PaymentRoute')
require("dotenv").config();

app.use(express.json());
app.use("/payment",Payment)
const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
  
});