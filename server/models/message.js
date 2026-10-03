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
    // True once every other member has read the message. In a direct chat
    // that is the one friend; older messages only have this flag.
    seen: {
      type: Boolean,
      default: false,
    },
    // Members (never the sender) who have read the message
    seenBy: {
      type: [String],
      default: [],
    },
    // "system" lines record group changes ("Gokul added Priya"); `text` holds
    // a readable fallback and `event` the details for the app to word itself
    type: {
      type: String,
      enum: ["text", "system"],
      default: "text",
    },
    event: {
      type: new mongoose.Schema(
        {
          // created | added | removed | left | renamed
          action: { type: String, required: true },
          targets: { type: [String], default: undefined },
          name: { type: String },
        },
        { _id: false }
      ),
      default: undefined,
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
