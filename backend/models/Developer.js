// models/Developer.js
import mongoose from "mongoose";

const developerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    title: { type: String, required: true }, // e.g. "Full Stack Web3 Developer"
    bio: { type: String },
    hourlyRate: { type: Number, required: true },
    jobsDone: { type: Number, default: 0 },
    rating: { type: Number, default: 0 }, // ⭐ average rating
    skills: [String], // ["React", "Node.js", "Solidity"]

    // ✅ Add image field
    image: { type: String, default: null },

    // Relations
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // linked to auth user
    tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }], // assigned tasks
  },
  { timestamps: true }
);

export default mongoose.model("Developer", developerSchema);
