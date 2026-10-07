const mongoose = require("mongoose");
const Message = require("../models/message");
const { isClientId } = require("../models/message");

// Builds the quote stored on a reply from the original message in the same
// conversation. Text and sender come from the database, not the client.
// `replyToId` is the original's _id, or its clientId from apps that store
// messages on the device. Returns undefined when there is nothing valid to
// reply to.
exports.buildReplySnapshot = async (conversationId, replyToId) => {
  const matches = [
    ...(mongoose.isValidObjectId(replyToId) ? [{ _id: replyToId }] : []),
    ...(isClientId(replyToId) ? [{ clientId: replyToId }] : []),
  ];
  if (matches.length === 0) return undefined;

  const original = await Message.findOne({
    conversationId,
    $or: matches,
  }).select("sender text clientId");
  if (!original) return undefined;

  return {
    messageId: String(original._id),
    ...(original.clientId ? { clientId: original.clientId } : {}),
    sender: original.sender,
    text: original.text,
  };
};
