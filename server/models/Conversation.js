const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    members: {
      type: [String],
      required: true,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessage: [
      {
        id: String,
        lastMessage: String,
        unseenMessagesCount: Number,
        seen: Boolean,
      },
    ],
  },
  { timestamps: true }
);


module.exports = mongoose.model("Conversation", conversationSchema);
