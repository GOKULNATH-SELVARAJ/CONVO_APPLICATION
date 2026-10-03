const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: String,
      required: true,
    },

    sender: {
      type: String,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    // The message this one replies to, copied at send time so the quote still
    // shows if the original can't be loaded. Absent on ordinary messages.
    replyTo: {
      type: new mongoose.Schema(
        {
          messageId: { type: String, required: true },
          sender: { type: String, required: true },
          text: { type: String, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);

// Automatically delete messages after 30 days (2592000 seconds)
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model("Message", messageSchema);
