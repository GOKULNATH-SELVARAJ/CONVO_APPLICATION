const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const admin = require("../notification/firebase");

//Update user
router.put("/:id", async (req, res) => {
  if (req.body.userId === req.params.id || req.body.isAdmin) {
    if (req.body.password) {
      try {
        const salt = await bcrypt.genSalt(10);
        req.body.password = await bcrypt.hash(req.body.password, salt);
      } catch (error) {
        return res.status(500).json(error);
      }
    }
    try {
      const user = await User.findByIdAndUpdate(req.params.id, {
        $set: req.body,
      });
      if (!user) {
        return res.status(404).json("User not found");
      }
      res.status(200).json("Updated Successfully");
    } catch (error) {
      return res.status(500).json(error);
    }
  } else {
    return res.status(404).json("You can't change anything");
  }
});

//Delete user
router.delete("/:id", async (req, res) => {
  if (req.body.userId === req.params.id || req.body.isAdmin) {
    try {
      const user = await User.findByIdAndDelete(req.params.id);
      if (!user) {
        return res.status(404).json("The user is not available");
      }
      res.status(200).json("User deleted successfully");
    } catch (error) {
      return res.status(200).json(error);
    }
  } else {
    return res.status(403).json("You are not allowed to delete this account");
  }
});

//Get user
router.get("/", async (req, res) => {
  const userId = req.query.userId;
  const username = req.query.username;
  try {
    const user = userId
      ? await User.findById(userId)
      : await User.findOne({ username: username });
    const { password, updatedAt, ...other } = user._doc;
    res.status(200).json(other);
  } catch (err) {
    res.status(500).json(err);
  }
});

//Get all users
router.get("/all", async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.query.userId } }) // $ne = not equal
      .select("-password");
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

// Add FCM Token
router.post("/add-token", async (req, res) => {
  try {
    const { userId, fcmToken } = req.body;
    console.log("add-token");

    if (!userId || !fcmToken) {
      return res
        .status(400)
        .json({ message: "userId and fcmToken are required" });
    }

    await User.findByIdAndUpdate(userId, { fcmToken }, { new: true });

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

router.post("/send-notification", async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    const user = await User.findById(userId);
    console.log("user,user", user);

    if (!user?.fcmToken) {
      return res
        .status(404)
        .json({ success: false, message: "FCM token not found" });
    }
    console.log("user.fcmToken", user.fcmToken);
    const message = {
      token: user.fcmToken,
      // notification: { title, body },
      android: {
        priority: "high",
      },
      data: data || {}, // optional key/value pairs
    };
    console.log("message", message);

    await admin.messaging().send(message);

    return res.json({
      success: true,
      message: "Notification sent successfully",
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    if (
      error.errorInfo?.code === "messaging/registration-token-not-registered"
    ) {
      await User.findByIdAndUpdate(req.body.userId, { fcmToken: null });
      console.log("❌ Invalid token removed from DB!");
    }

    return res.status(500).json({ success: false, message: "Server error" });
    // return res.status(500).json({ success: false, message: "Server error" });
  }
});
module.exports = router;
