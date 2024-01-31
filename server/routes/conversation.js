const router = require("express").Router();
const Conversation = require("../models/Conversation");

//New conversation
router.post("/", async (req, res) => {
  const { senderId, receiverId } = req.body;

  const existingConversationSender = await Conversation.findOne({
    members: { $all: [senderId, receiverId] },
  });

  const existingConversationReceiver = await Conversation.findOne({
    members: { $all: [receiverId, senderId] },
  });

  if (existingConversationSender) {
    return res.status(400).json(existingConversationSender);
  }

  if (existingConversationReceiver) {
    return res.status(200).json(existingConversationReceiver);
  }
  const newConversation = new Conversation({
    members: [req.body.senderId, req.body.receiverId],
  });
  try {
    const savedConversation = await newConversation.save().sort();
    res.status(200).json(savedConversation);
  } catch (err) {
    res.status(500).json(err);
  }
});

//Get conversation

router.get("/:userId", async (req, res) => {
  try {
    const conversation = await Conversation.find({
      members: { $in: [req.params.userId] },
    }).sort({ lastMessageAt: -1 }).limit();
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json(err);
  }
});

module.exports = router;
