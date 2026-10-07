const router = require("express").Router();
const Message = require("../models/message");
const auth = require("../middleware/authMiddleware");
const {
  findMemberConversation,
  visibleMessagesFilter,
} = require("../utils/conversationAccess");
const { buildReplySnapshot } = require("../utils/replySnapshot");
const {
  ownedDevice,
  queueMessage,
  queueReceipts,
} = require("../utils/mailbox");
const {
  markMessagesRead,
  refreshConversationSummary,
} = require("../utils/readState");


// Add Message (the logged-in user is always the sender)
router.post("/", auth, async (req, res) => {
  const { conversationId, text, replyToId } = req.body;
  const sender = req.userId;

  if (!conversationId || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Step 1: Make sure the sender belongs to the conversation
    const conversation = await findMemberConversation(conversationId, sender);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Step 2: Save message with seen = false (a reply carries a quote of
    // the original; an unknown replyToId is ignored)
    const replyTo = await buildReplySnapshot(conversationId, replyToId);
    const savedMessage = await new Message({
      conversationId,
      sender,
      text,
      seen: false,
      replyTo,
    }).save();

    // Step 3: Refresh the chat-list summary (last message, unread counts).
    // Delivery and read state are handled when the app emits "send message".
    await refreshConversationSummary(conversationId);

    // Step 4: Queue it for members' devices. The sending device (X-Device-Id)
    // already has it. Mailbox trouble must not fail a message that is saved.
    try {
      const senderDeviceId = await ownedDevice(sender, req.get("x-device-id"));
      await queueMessage(req.app.get("io"), savedMessage, conversation.members, senderDeviceId);
    } catch (error) {
      console.error("❌ Could not queue message for devices:", error);
    }

    res.status(200).json(savedMessage);
  } catch (error) {
    console.error("❌ Error in message post:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark messages as seen (for the logged-in user)
router.post("/seen", auth, async (req, res) => {
  const { conversationId } = req.body;
  const userId = req.userId;

  try {
    const conversation = await findMemberConversation(conversationId, userId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const { read } = await markMessagesRead(conversation, userId);
    await refreshConversationSummary(conversationId);
    try {
      await queueReceipts(req.app.get("io"), "read", userId, read);
    } catch (error) {
      console.error("❌ Could not queue read receipts:", error);
    }

    res.status(200).json({ message: "Unseen messages count reset." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all messages in a conversation
router.get("/:conversationId", auth, async (req, res) => {
  try {
    const conversation = await findMemberConversation(
      req.params.conversationId,
      req.userId,
    );
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Members added to a group later don't get the history before they joined
    const messages = await Message.find(
      visibleMessagesFilter(conversation, req.userId),
    ).sort({ createdAt: 1 });
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json(error);
  }
});

// Get last message in a conversation
router.get("/last/:conversationId", auth, async (req, res) => {
  try {
    const conversation = await findMemberConversation(
      req.params.conversationId,
      req.userId,
    );
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const lastMessage = await Message.findOne(
      visibleMessagesFilter(conversation, req.userId),
    )
      .sort({ createdAt: -1 })
      .limit(1);

    res.status(200).json(lastMessage);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
