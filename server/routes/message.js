const router = require("express").Router();
const Message = require("../models/message");
const Conversation = require("../models/Conversation");

//Add Message
router.post("/", async (req, res) => {
  const newMessage = new Message(req.body);

  try {
    const savedMessage = await newMessage.save();
    await Conversation.findOneAndUpdate(
      { _id: req.body.conversationId },
      { lastMessageAt: new Date() },
      { new: true }
    );
    res.status(200).json(savedMessage);
  } catch (error) {
    return res.status(400).json(error);
  }
});

//Get Message

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

router.get("/last/:conversationId", async (req, res) => {
  try {
    const lastMessage = await Message.findOne({
      conversationId: req.params.conversationId,
    })
      .sort({ createdAt: -1 }) // Sort in descending order based on createdAt
      .limit(1);

    res.status(200).json(lastMessage);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
