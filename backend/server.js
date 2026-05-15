require("dotenv").config();
require("./db");

const express = require("express");
const cors = require("cors");

const userRoutes = require("./routes/users");
const companyRoutes = require("./routes/companyRoutes");
const posRoutes = require("./routes/posRoutes");

const app = express();

app.use(cors());
app.use(express.json());

/* ROUTES */
app.use("/api/users", userRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/pos", posRoutes);

/* TESTING */
app.get("/", (req, res) => {
  res.send("Backend is running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
