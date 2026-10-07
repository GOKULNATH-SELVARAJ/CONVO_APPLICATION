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
          // The original's clientId, when it has one
          clientId: { type: String },
          sender: { type: String, required: true },
          text: { type: String, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
    // The id the sending app gave the message. Apps that store messages on
    // the device know messages by this id (by _id when it is absent: messages
    // from older apps, and from before it existed).
    clientId: {
      type: String,
    },
  },
  { timestamps: true }
);

// A message an app sends twice (a retry) is stored once
messageSchema.index(
  { sender: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: "string" } } }
);

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const isClientId = (value) =>
  typeof value === "string" && CLIENT_ID_PATTERN.test(value);

// The id apps that store messages on the device use for a message.
const messageKey = (message) => message.clientId || String(message._id);

// Automatically delete messages after 30 days (2592000 seconds)
// messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model("Message", messageSchema);
module.exports.isClientId = isClientId;
module.exports.messageKey = messageKey;
