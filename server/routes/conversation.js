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
      return res.status(409).json({
        success: false,
        message: "A conversation between these users already exists.",
        receiverId: receiverId,
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
    const conversation = await Conversation.find({
      members: { $in: [req.params.userId] },
    })
      .sort({ lastMessageAt: -1 })
      .limit();
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
