const Conversation = require("../models/Conversation");
const Message = require("../models/message");
const User = require("../models/User");
const { refreshConversationSummary, settleFullyRead } = require("./readState");
const { sendPushNotification } = require("../notification/sendNotification");
const { queueMessage } = require("./mailbox");

const getConversationsFor = (userId) =>
  Conversation.find({ members: String(userId) }).sort({ lastMessageAt: -1 });

// Sends each user their own, freshly sorted conversation list.
const emitConversationLists = async (io, userIds) => {
  const unique = [...new Set(userIds.map(String))];
  await Promise.all(
    unique.map(async (userId) => {
      io.to(userId).emit("conversation updated", await getConversationsFor(userId));
    }),
  );
};

const usernamesById = async (ids) => {
  const users = await User.find({ _id: { $in: ids } })
    .select("username")
    .lean();
  return new Map(users.map((u) => [String(u._id), u.username]));
};

const listNames = (names) =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

// Readable fallback text for a group change; the app words it itself from
// `event` (so it can say "You").
const describeEvent = (actorName, event, names) => {
  const targets = listNames((event.targets || []).map((id) => names.get(id) || "someone"));
  switch (event.action) {
    case "created":
      return `${actorName} created group "${event.name}"`;
    case "added":
      return `${actorName} added ${targets}`;
    case "removed":
      return `${actorName} removed ${targets}`;
    case "left":
      return `${actorName} left`;
    case "renamed":
      return `${actorName} changed the group name to "${event.name}"`;
    default:
      return `${actorName} updated the group`;
  }
};

/**
 * Records a group change as a system line, delivers it live, refreshes every
 * affected chat list and pushes "added you" notifications.
 * `alsoNotify` covers users no longer in the group (removed / left).
 */
const postGroupEvent = async (io, conversation, actorId, event, alsoNotify = []) => {
  const conversationId = String(conversation._id);
  const names = await usernamesById([actorId, ...(event.targets || [])]);
  const actorName = names.get(String(actorId)) || "Someone";
  const text = describeEvent(actorName, event, names);

  const message = await Message.create({
    conversationId,
    sender: String(actorId),
    text,
    type: "system",
    event,
    // System lines need no read receipts
    seen: true,
    seenBy: conversation.members.map(String).filter((id) => id !== String(actorId)),
  });

  const recipients = [...conversation.members.map(String), ...alsoNotify.map(String)];
  io.to(recipients).emit("message received", message);
  try {
    await queueMessage(io, message, recipients);
  } catch (error) {
    console.error("❌ Could not queue group event for devices:", error);
  }

  // Membership changes can complete read receipts (e.g. the only member who
  // hadn't read a message left)
  const newlySeen = await settleFullyRead(conversation);
  if (newlySeen.length > 0) {
    io.to(conversation.members.map(String)).emit("messages seen", {
      conversationId,
      messageIds: newlySeen,
    });
  }

  await refreshConversationSummary(conversationId);
  await emitConversationLists(io, recipients);

  // Tell people they were added; they aren't looking at the chat yet
  if (event.action === "created" || event.action === "added") {
    const addedIds =
      event.action === "created"
        ? conversation.members.map(String).filter((id) => id !== String(actorId))
        : event.targets || [];
    await Promise.all(
      addedIds.map((receiverId) =>
        sendPushNotification(receiverId, {
          chatId: conversationId,
          senderId: String(actorId),
          receiverId,
          title: conversation.name,
          body: `${actorName} added you`,
          senderName: actorName,
          isGroup: "1",
        }).catch((error) => console.log("❌ Group push failed:", error.message)),
      ),
    );
  }

  return message;
};

module.exports = { getConversationsFor, emitConversationLists, postGroupEvent };
