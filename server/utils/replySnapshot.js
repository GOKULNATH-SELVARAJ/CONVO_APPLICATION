const mongoose = require("mongoose");
const Message = require("../models/message");

// Builds the quote stored on a reply from the original message in the same
// conversation. Text and sender come from the database, not the client.
// Returns undefined when there is nothing valid to reply to.
exports.buildReplySnapshot = async (conversationId, replyToId) => {
  if (!mongoose.isValidObjectId(replyToId)) return undefined;

  const original = await Message.findOne({
    _id: replyToId,
    conversationId,
  }).select("sender text");
  if (!original) return undefined;

  return {
    messageId: String(original._id),
    sender: original.sender,
    text: original.text,
  };
};
