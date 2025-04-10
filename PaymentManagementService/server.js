const express = require("express");
const cors = require('cors');
const dotenv  = require('dotenv');
const connectDB = require('./config/db.js');



const port = process.env.DB_PORT || 5002;  

dotenv.config();

const app = express();

app.use(cors({ origin: "http://localhost:3000" }));


app.use(express.json({ limit: '10mb' }));


app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 413) {
    res.status(413).send({ error: 'Payload too large!' });
  } else {
    next(err);
  }
});



app.get("/", (req, res) => {
  res.status(200).send(`Server running upon the port : ${port}`);
});



app.listen(port, async () => {
  console.log(`Server Started on port ${port}`);
  await connectDB();
  const currentDate = new Date();
  currentDate.setMinutes(currentDate.getMinutes() + 5);
  console.log(currentDate);
});
