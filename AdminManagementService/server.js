const express = require("express");
const cors = require('cors');
const dotenv  = require('dotenv');
const connectDB = require("./config/db");
const adminRoute = require("./routes/adminDashboardRoutes.js");
dotenv.config();
const port = process.env.PORT || 3000;  
const app = express();

app.use(cors({ origin: ["http://localhost:5000", "http://localhost:3001"] }));
app.use(express.json({ limit: '25mb' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 413) {
    res.status(413).send({ error: 'Payload too large!' });
  } else {
    next(err);
  }
});


app.use("/admin", adminRoute);


app.listen(port, async () => {
  console.log(`Server Started on port ${port}`);
  await connectDB();
  const currentDate = new Date();
  currentDate.setMinutes(currentDate.getMinutes() + 5);
  console.log(currentDate);
});