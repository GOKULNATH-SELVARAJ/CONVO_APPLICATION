const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");

// When userId joined the conversation, if they were added after it started.
const joinedAtFor = (conversation, userId) => {
  const joined = conversation?.joinedAt;
  if (!joined) return undefined;
  return joined instanceof Map ? joined.get(String(userId)) : joined[String(userId)];
};

// Query for the messages userId may see: everything, or for someone added to
// a group later, only what was sent from the moment they joined.
exports.visibleMessagesFilter = (conversation, userId) => {
  const joinedAt = joinedAtFor(conversation, userId);
  return {
    conversationId: String(conversation._id),
    ...(joinedAt ? { createdAt: { $gte: joinedAt } } : {}),
  };
};

// Returns the conversation only if userId is one of its members, otherwise null.
exports.findMemberConversation = async (conversationId, userId) => {
  if (!userId || !mongoose.isValidObjectId(conversationId)) return null;

  return Conversation.findOne({
    _id: conversationId,
    members: userId.toString(),
  });
};
