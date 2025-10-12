const express = require('express');
const app = express();
const connectDB = require('./config/db');
const Payment = require('./routes/PaymentRoute');
const Transaction = require("./routes/TransactionRoute");
const DoctorWallet = require("./routes/DoctorWalletRoute");
const withdrawalRoutes = require("./routes/withdrawalRoutes");
require("dotenv").config();

app.use(express.json());
app.use("/payment",Payment)
app.use("/transaction", Transaction);
app.use("/doctorwallet", DoctorWallet);
app.use("/withdrawals", withdrawalRoutes);
const PORT = process.env.PORT || 5000;
app.listen(PORT, async() => {
  console.log(`Server running on port ${PORT}`);
  await connectDB();
  
});