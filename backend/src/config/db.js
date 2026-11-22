const mongoose = require("mongoose");
const env = require("./env");

mongoose.set("strictQuery", true);

// Make sure every model is registered (so indexes get built on connect)
require("../models");

async function connectDB() {
  await mongoose.connect(env.mongodbUri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });

  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));

  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err.message);
});

module.exports = { mongoose, connectDB, disconnectDB };
