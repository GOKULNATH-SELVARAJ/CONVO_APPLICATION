const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");

// Returns the conversation only if userId is one of its members, otherwise null.
exports.findMemberConversation = async (conversationId, userId) => {
  if (!userId || !mongoose.isValidObjectId(conversationId)) return null;

  return Conversation.findOne({
    _id: conversationId,
    members: userId.toString(),
  });
};
