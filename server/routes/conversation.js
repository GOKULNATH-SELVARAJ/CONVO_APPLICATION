const router = require("express").Router();
const Conversation = require("../models/Conversation");

//New conversation
router.post("/", async (req, res) => {
  const { senderId, receiverId } = req.body;

  try {
    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create a conversation with yourself.",
      });
    }

    // Check if conversation already exists
    const existingConversation = await Conversation.findOne({
      members: { $all: [senderId, receiverId], $size: 2 },
    });

    if (existingConversation) {
      return res.status(400).json({
        success: false,
        message: "A conversation between these users already exists.",
      });
    }

    // If not, create new
    const newConversation = new Conversation({
      members: [senderId, receiverId],
    });

    const savedConversation = await newConversation.save();
    res.status(200).json(savedConversation);
  } catch (err) {
    console.log("err", err);

    res.status(500).json(err);
  }
});

// const { senderId, receiverId } = req.body;

// const existingConversationSender = await Conversation.findOne({
//   members: { $all: [senderId, receiverId] },
// });

// const existingConversationReceiver = await Conversation.findOne({
//   members: { $all: [receiverId, senderId] },
// });

// if (existingConversationSender) {
//   return res.status(400).json(existingConversationSender);
// }

// if (existingConversationReceiver) {
//   return res.status(200).json(existingConversationReceiver);
// }

//Get conversation

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const conversations = await Conversation.find({
      members: userId,
    })
      .sort({ lastMessageAt: -1 }) // now that we track lastMessage time properly
      .select("members lastMessage lastMessageAt updatedAt")
      .lean();

    // Attach receiver details for UI benefit
    const formatted = conversations.map((conv) => {
      const receiverId = conv.members.find((id) => id !== userId);

      return {
        _id: conv._id,
        receiverId,
        lastMessage: conv.lastMessage ?? null,
        updatedAt: conv.updatedAt,
        lastMessageAt: conv.lastMessageAt,
        members: conv.members,
      };
    });

    return res.status(200).json(formatted);
  } catch (error) {
    console.error("❌ Error fetching conversations:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
