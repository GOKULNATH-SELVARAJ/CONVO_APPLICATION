const router = require("express").Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const { EMAIL_COLLATION } = require("../models/User");
const Conversation = require("../models/Conversation");
const bcrypt = require("bcrypt");
const auth = require("../middleware/authMiddleware");
const { sendPushNotification } = require("../notification/sendNotification");

// Fields a user may change on their own account
const UPDATABLE_FIELDS = ["username", "email", "password"];

// Never sent to other clients
const PRIVATE_FIELDS =
  "-password -updatedAt -refreshToken -fcmToken -fcmTokens";

// Push tokens kept per user (oldest dropped first)
const MAX_DEVICES = 10;

//Update user
router.put("/:id", auth, async (req, res) => {
  if (req.params.id !== req.userId) {
    return res.status(403).json("You can't change anything");
  }

  const updates = {};
  for (const field of UPDATABLE_FIELDS) {
    if (typeof req.body[field] === "string") updates[field] = req.body[field];
  }

  if (updates.password) {
    try {
      const salt = await bcrypt.genSalt(10);
      updates.password = await bcrypt.hash(updates.password, salt);
    } catch (error) {
      return res.status(500).json(error);
    }
  }

  try {
    // The unique index is case-sensitive, so catch "Bob@x.com" vs "bob@x.com" here
    if (
      updates.email &&
      (await User.exists({
        email: updates.email,
        _id: { $ne: req.userId },
      }).collation(EMAIL_COLLATION))
    ) {
      return res.status(409).json("Username or email already exists");
    }

    const user = await User.findByIdAndUpdate(req.params.id, {
      $set: updates,
    });
    if (!user) {
      return res.status(404).json("User not found");
    }
    res.status(200).json("Updated Successfully");
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json("Username or email already exists");
    }
    return res.status(500).json(error);
  }
});

//Delete user
router.delete("/:id", auth, async (req, res) => {
  if (req.params.id !== req.userId) {
    return res.status(403).json("You are not allowed to delete this account");
  }

  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json("The user is not available");
    }
    res.status(200).json("User deleted successfully");
  } catch (error) {
    return res.status(500).json(error);
  }
});

//Get user
router.get("/", auth, async (req, res) => {
  const { userId, username } = req.query;

  if (userId ? !mongoose.isValidObjectId(userId) : typeof username !== "string") {
    return res.status(400).json("A valid userId or username is required");
  }

  try {
    const user = await (userId
      ? User.findById(userId)
      : User.findOne({ username })
    )
      .select(PRIVATE_FIELDS)
      .lean();

    if (!user) {
      return res.status(404).json("User not found");
    }
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json(err);
  }
});

//Get all users
router.get("/all", auth, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } }) // $ne = not equal
      .select(PRIVATE_FIELDS);

    const formattedUsers = users.map((user) => ({
      userId: user._id,
      username: user.username,
      email: user.email,
      textColor: user.textColor,
      backgroundColor: user.profileBackgroundColor,
      createdAt: user.createdAt,
      status: user.status,
    }));

    res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      data: formattedUsers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
});

// Add FCM Token (always for the logged-in user)
router.post("/add-token", auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;

    if (typeof fcmToken !== "string" || !fcmToken) {
      return res.status(400).json({ message: "fcmToken is required" });
    }

    // A device belongs to one account at a time: if another user logged in
    // on this device before, stop sending them pushes here
    await Promise.all([
      User.updateMany(
        { _id: { $ne: req.userId }, fcmTokens: fcmToken },
        { $pull: { fcmTokens: fcmToken } },
      ),
      User.updateMany(
        { _id: { $ne: req.userId }, fcmToken },
        { fcmToken: null },
      ),
    ]);

    const user = await User.findById(req.userId).select("fcmToken fcmTokens");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Move the legacy single token into the list, newest last
    const otherTokens = [...user.fcmTokens, user.fcmToken].filter(
      (token) => token && token !== fcmToken,
    );
    user.fcmTokens = [...new Set(otherTokens), fcmToken].slice(-MAX_DEVICES);
    user.fcmToken = null;
    await user.save();

    return res.json({
      success: true,
      message: "FCM token updated successfully",
      fcmToken: fcmToken,
    });
  } catch (error) {
    console.error("Error updating token", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Only allowed towards users the caller shares a conversation with
router.post("/send-notification", auth, async (req, res) => {
  try {
    const { userId, data } = req.body;

    if (!mongoose.isValidObjectId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "A valid userId is required" });
    }

    const sharesConversation = await Conversation.exists({
      members: { $all: [req.userId, String(userId)] },
    });
    if (!sharesConversation) {
      return res.status(403).json({
        success: false,
        message: "You can only notify users you have a conversation with",
      });
    }

    const result = await sendPushNotification(userId, data || {});

    if (result.reason === "no-token") {
      return res
        .status(404)
        .json({ success: false, message: "FCM token not found" });
    }
    if (result.reason === "token-removed") {
      return res.status(200).json({
        success: true,
        message: "Invalid FCM token removed. User needs to register again.",
      });
    }

    return res.json({
      success: true,
      message: "Notification sent successfully",
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
