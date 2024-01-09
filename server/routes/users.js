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
router.get("/:id", async (req, res) => {
  if (req.body.userId === req.params.id) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json("The user is not available");
      }
      res.status(500).json(user);
    } catch (error) {
      return res.status(200).json(error);
    }
  } else {
    return res.status(401).json("Unauthorized Access");
  }
});

module.exports = router;
