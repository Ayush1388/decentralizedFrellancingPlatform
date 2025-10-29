import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import passport from "./config/passport.js";
import authRoutes from "./routes/auth.js";
import developerRoutes from "./routes/Developers.js";

const app = express();
app.use(cors());
app.use(express.json());

// Initialize passport
app.use(passport.initialize());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/developers", developerRoutes);
app.use("/uploads", express.static("uploads")); // serve profile images

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("✅ MongoDB connected");

    app.listen(3001, () => {
      console.log("🚀 Server listening on port 3001");
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
}

main();
