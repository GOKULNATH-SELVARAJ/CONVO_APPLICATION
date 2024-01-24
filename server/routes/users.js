const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");

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
    const users = await User.find();
    //Sending response back with status and data
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json(error);
  }
});

module.exports = router;
