// Importing required libraries
const express = require('express');
const mongoose = require("mongoose");
const cors = require('cors');
require('dotenv').config();

// Creating express app and setting up the port
const app = express();
const PORT = process.env.PORT || 5000;

// Setting up the middleware
app.use(cors());
app.use(express.json());

const entryRoutes = require("./routes/entries");
app.use("/api/entries", entryRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI,{
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
// if successful , logs a confirmation message
// if not, logs an error message
.then(() => console.log("Connected to MongoDB"))
.catch((err) => console.error("MongoDB connection error:", err));

// Basic route to check if the server is running
app.get("/", (req, res)=>{
  res.send("MindMirror backend running...");
});


// starting the server
app.listen(PORT, () =>{
  console.log(`Server is running on http://localhost:${PORT}}`);
})

