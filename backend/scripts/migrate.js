// MongoDB creates collections automatically; this just (re)builds indexes.
const { connectDB, disconnectDB } = require("../src/config/db");
const { mongoose } = require("../src/config/db");

(async () => {
  try {
    await connectDB();
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    console.log("✅ Indexes synced.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
})();
