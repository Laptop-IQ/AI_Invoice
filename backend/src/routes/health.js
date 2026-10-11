const express = require("express");
const { pool } = require("../config/db");

const router = express.Router();

router.get("/", async (req, res) => {
  let db = "unknown";

  try {
    await pool.query("SELECT 1");
    db = "connected";
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
