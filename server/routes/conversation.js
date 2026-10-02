const router = require("express").Router();
const mongoose = require("mongoose");
const auth = require("../middleware/authMiddleware");
const Conversation = require("../models/Conversation");
const User = require("../models/User");

//New conversation (the logged-in user is always the sender)
router.post("/", auth, async (req, res) => {
  const senderId = req.userId;
  const receiverId = req.body.receiverId?.toString();

  try {
    if (senderId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create a conversation with yourself.",
      });
    }

    if (
      !mongoose.isValidObjectId(receiverId) ||
      !(await User.exists({ _id: receiverId }))
    ) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found.",
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

router.get("/:userId", auth, async (req, res) => {
  if (req.params.userId !== req.userId) {
    return res.status(403).json("You can only view your own conversations");
  }

  try {
    const conversation = await Conversation.find({
      members: { $in: [req.params.userId] },
    }).sort({ lastMessageAt: -1 });

    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
