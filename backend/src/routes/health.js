const express = require("express");
const { mongoose } = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
  let db = "disconnected";

  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.command({ ping: 1 });
      db = "connected";
    }
  } catch (err) {
    db = "disconnected";
  }

  return res.json({
    status: "ok",
    uptime: process.uptime(),
    db,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
