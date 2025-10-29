// models/Conversation.js
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const conversationSchema = new mongoose.Schema({
  task: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // client + developer
  messages: [messageSchema]
}, { timestamps: true });

export default mongoose.model("Conversation", conversationSchema);
