const mongoose = require("mongoose");

// Upper bound on group size, so fan-out (sockets, pushes, unread recounts)
// stays cheap.
const MAX_GROUP_MEMBERS = 50;
const MAX_GROUP_NAME_LENGTH = 50;

const conversationSchema = new mongoose.Schema(
  {
    members: {
      type: [String],
      required: true,
    },
    // Direct chats (the original kind) have no isGroup field; treat missing
    // as false.
    isGroup: {
      type: Boolean,
      default: false,
    },
    // Groups only
    name: {
      type: String,
      trim: true,
      maxlength: MAX_GROUP_NAME_LENGTH,
    },
    admins: {
      type: [String],
      default: undefined,
    },
    createdBy: {
      type: String,
    },
    // When members added to an existing group joined (userId -> date). They
    // only see messages from then on, as in WhatsApp. Members without an
    // entry (the original members, everyone in older groups) see it all.
    joinedAt: {
      type: Map,
      of: Date,
      default: undefined,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    lastMessageSentBy: {
      type: String,
      default: null,
    },
    // "text" or "system" (e.g. "Gokul added Priya"), so the chat list can skip
    // ticks and sender prefixes for system lines
    lastMessageType: {
      type: String,
      default: "text",
    },
    // One entry per member: the last message text, how many messages that
    // member hasn't read, and whether the last message is read (by that
    // member, or for the sender's own entry, by everyone).
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
module.exports.MAX_GROUP_MEMBERS = MAX_GROUP_MEMBERS;
module.exports.MAX_GROUP_NAME_LENGTH = MAX_GROUP_NAME_LENGTH;
