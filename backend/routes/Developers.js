import express from "express";
import Developer from "../models/Developer.js";
import { upload } from "../utils/upload.js";
import { authenticateJWT } from "../utils/middleware.js"; // ✅ import JWT auth from middleware.js

const router = express.Router();

// ✅ Create developer (only one per user)
router.post("/", authenticateJWT, upload.single("image"), async (req, res) => {
  try {
    // Check if user already has a profile
    const existing = await Developer.findOne({ user: req.user.id });
    if (existing) {
      return res.status(400).json({ error: "You already created a profile" });
    }

    const dev = new Developer({
      name: req.body.name,
      title: req.body.title,
      bio: req.body.bio,
      hourlyRate: req.body.hourlyRate,
      jobsDone: req.body.jobsDone || 0,
      rating: req.body.rating || 0,
      skills: req.body.skills
        ? req.body.skills.split(",").map((s) => s.trim())
        : [],
      image: req.file ? `/uploads/${req.file.filename}` : null,
      user: req.user.id, // ✅ link to logged-in user
    });

    await dev.save();
    res.json(dev);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Get all developers
router.get("/", async (req, res) => {
  try {
    const devs = await Developer.find();
    res.json(devs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update developer (only owner can update)
router.put("/:id", authenticateJWT, upload.single("image"), async (req, res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: "Developer not found" });

    // Check ownership
    if (dev.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    dev.name = req.body.name || dev.name;
    dev.title = req.body.title || dev.title;
    dev.bio = req.body.bio || dev.bio;
    dev.hourlyRate = req.body.hourlyRate || dev.hourlyRate;
    dev.jobsDone = req.body.jobsDone || dev.jobsDone;
    dev.rating = req.body.rating || dev.rating;
    dev.skills = req.body.skills
      ? req.body.skills.split(",").map((s) => s.trim())
      : dev.skills;

    if (req.file) dev.image = `/uploads/${req.file.filename}`;

    await dev.save();
    res.json(dev);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Delete developer (only owner can delete)
router.delete("/:id", authenticateJWT, async (req, res) => {
  try {
    const dev = await Developer.findById(req.params.id);
    if (!dev) return res.status(404).json({ error: "Developer not found" });

    // Check ownership
    if (dev.user.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not allowed" });
    }

    await dev.deleteOne();
    res.json({ message: "Developer deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
