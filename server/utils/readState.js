const mongoose = require("mongoose");
const Message = require("../models/message");
const Conversation = require("../models/Conversation");

// Read state works the same for direct chats and groups:
// - `seenBy` lists the members (never the sender) who have read a message
// - `seen` is true once every other member has read it
// Messages from before `seenBy` existed only have `seen`, which in a direct
// chat means the one friend read it, so they still count correctly.

// Messages `memberId` hasn't read yet. System lines ("Gokul added Priya")
// never count as unread.
const unreadFilter = (conversationId, memberId) => ({
  conversationId: String(conversationId),
  sender: { $ne: memberId },
  type: { $ne: "system" },
  seen: false,
  seenBy: { $ne: memberId },
});

const otherMembers = (conversation, userId) =>
  conversation.members.map(String).filter((id) => id !== String(userId));

// Sets `seen` on messages every other member has now read (for example after
// a read, or after the last member who hadn't read them left). Returns the ids
// that changed, so senders can turn their ticks blue.
const settleFullyRead = async (conversation) => {
  const conversationId = String(conversation._id);
  const newlySeen = [];

  for (const senderId of conversation.members.map(String)) {
    const ids = await Message.find({
      conversationId,
      sender: senderId,
      seen: false,
      seenBy: { $all: otherMembers(conversation, senderId) },
    }).distinct("_id");

    if (ids.length > 0) {
      await Message.updateMany({ _id: { $in: ids } }, { $set: { seen: true } });
      newlySeen.push(...ids.map(String));
    }
  }
  return newlySeen;
};

// Records that `userId` has read these messages, or every unread one in the
// conversation when `messageIds` is omitted. Returns the messages this user
// has newly read (for read receipts) and the ids now read by everyone.
const markMessagesRead = async (conversation, userId, messageIds) => {
  const filter = {
    conversationId: String(conversation._id),
    sender: { $ne: String(userId) },
    seen: false,
    seenBy: { $ne: String(userId) },
  };
  if (Array.isArray(messageIds)) {
    filter._id = { $in: messageIds.filter((id) => mongoose.isValidObjectId(id)) };
  }

  const read = await Message.find(filter)
    .select("_id sender conversationId")
    .lean();
  if (read.length > 0) {
    await Message.updateMany(
      { _id: { $in: read.map((message) => message._id) } },
      { $addToSet: { seenBy: String(userId) } },
    );
  }
  const fullyRead = await settleFullyRead(conversation);
  return { read, fullyRead };
};

// Recomputes the chat-list summary (last message, per-member unread counts and
// ticks) from the messages themselves, so every code path agrees.
const refreshConversationSummary = async (conversationId) => {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) return null;

  const last = await Message.findOne({ conversationId: String(conversationId) })
    .sort({ createdAt: -1 })
    .lean();

  const lastMessage = await Promise.all(
    conversation.members.map(async (memberId) => {
      const unseenMessagesCount = await Message.countDocuments(
        unreadFilter(conversationId, memberId),
      );
      const isSender = !!last && last.sender === String(memberId);
      return {
        id: memberId,
        lastMessage: last ? last.text : "",
        unseenMessagesCount,
        // The sender's entry drives their ticks: read by everyone?
        seen: isSender ? !!last.seen : unseenMessagesCount === 0,
      };
    }),
  );

  // A plain $set rather than conversation.save(): messages sent at the same
  // moment refresh the summary concurrently, and save()'s version check
  // rejected the second one (VersionError), failing that message's request.
  const update = { lastMessage };
  if (last) {
    update.lastMessageAt = last.createdAt;
    update.lastMessageSentBy = last.sender;
    update.lastMessageType = last.type || "text";
  }
  return Conversation.findByIdAndUpdate(conversationId, { $set: update }, { new: true });
};

module.exports = {
  otherMembers,
  settleFullyRead,
  markMessagesRead,
  refreshConversationSummary,
};
