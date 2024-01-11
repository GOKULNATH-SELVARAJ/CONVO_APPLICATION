const router = require("express").Router();
const Conversation = require("../models/Conversation");

//New conversation
router.post("/", async (req, res) => {
  const newConversation = new Conversation({
    members: [req.body.senderId, req.body.receiverId],
  });
  try {
    const savedConversation = await newConversation.save();
    res.status(200).json(savedConversation);
  } catch (err) {
    res.status(500).json(err);
  }
});

//Get conversation

router.get("/:userId", async (req, res) => {
  try {
    const conversation = await Conversation.find({
      members: { $in: [req.body.usedId] },
    });
    res.status(200).json(conversation);
  } catch (error) {
    res.status(500).json(err);
  }
});

module.exports = router;
