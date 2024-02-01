const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    members: {
      type: Array,
    },
    lastMessageAt: {
      type: Date,
      seen: {
        type: Boolean,
        default: false,
      },
    },
    unseenMessagesCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
