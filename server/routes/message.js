const router = require("express").Router();
const Message = require("../models/message");
const Conversation = require("../models/Conversation");

// Add Message
router.post("/", async (req, res) => {
  const { conversationId, sender, text } = req.body;
  console.log("✅ /message API called with:", { conversationId, sender, text });

  if (!conversationId || !sender || !text) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Step 1: Save message with seen = false
    const savedMessage = await new Message({
      conversationId,
      sender,
      text,
      seen: false,
    }).save();

    // Step 2: Fetch the conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

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
    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        lastMessageAt: new Date(),
        lastMessage: updatedLastMessage,
        updatedAt: new Date(),
        lastMessageSentBy: sender,
      },
      { new: true }
    );

    console.log("✅ Updated conversation.lastMessage:", updatedConversation);
    res.status(200).json(savedMessage);
  } catch (error) {
    console.error("❌ Error in message post:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark messages as seen (per user)
router.post("/seen", async (req, res) => {
  const { conversationId, userId } = req.body;

  try {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Update unseenMessagesCount for this user to 0
    const updatedLastMessage = (conversation.lastMessage || []).map((entry) => {
      if (entry.id === userId) {
        return {
          ...entry,
          unseenMessagesCount: 0,
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
router.get("/:conversationId", async (req, res) => {
  try {
    const messages = await Message.find({
      conversationId: req.params.conversationId,
    });
    res.status(200).json(messages);
  } catch (error) {
    res.status(500).json(error);
  }
});

// Get last message in a conversation
router.get("/last/:conversationId", async (req, res) => {
  try {
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
