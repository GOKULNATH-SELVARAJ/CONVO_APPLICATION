const router = require("express").Router();
const Message = require("../models/message");
const Conversation = require("../models/Conversation");
const auth = require("../middleware/authMiddleware");
const { findMemberConversation } = require("../utils/conversationAccess");
const { buildReplySnapshot } = require("../utils/replySnapshot");


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

    // Step 3: Recompute unseen message counts per user
    const updatedLastMessage = await Promise.all(
      conversation.members.map(async (memberId) => {
        const unseenCount = await Message.countDocuments({
          conversationId,
          sender: { $ne: memberId },
          seen: false,
        });

        return {
          id: memberId,
          lastMessage: text,
          unseenMessagesCount: unseenCount,
          seen: unseenCount === 0,
        };
      })
    );

    // Step 4: Update conversation with new message metadata
    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessageAt: new Date(),
      lastMessage: updatedLastMessage,
      updatedAt: new Date(),
      lastMessageSentBy: sender,
    });

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

    // Mark the messages themselves, otherwise the next recount brings the unseen count back
    await Message.updateMany(
      { conversationId, sender: { $ne: userId }, seen: false },
      { $set: { seen: true } },
    );

    // Update unseenMessagesCount for this user to 0
    const updatedLastMessage = (conversation.lastMessage || []).map((entry) => {
      if (entry.id === userId) {
        return {
          ...entry.toObject(),
          unseenMessagesCount: 0,
          seen: true,
        };
      }
      return entry;
    });

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: updatedLastMessage,
    });

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

    const messages = await Message.find({
      conversationId: req.params.conversationId,
    }).sort({ createdAt: 1 });
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

    const lastMessage = await Message.findOne({
      conversationId: req.params.conversationId,
    })
      .sort({ createdAt: -1 })
      .limit(1);

    res.status(200).json(lastMessage);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
