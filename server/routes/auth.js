const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");

//Storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    // let datetimestamp = Date.now();
    const username = req.body.username;
    cb(null, username + path.extname(file.originalname));
  },
});

//Upload
const upload = multer({ storage: storage });

// Register
router.post("/register", upload.single("profile"), async (req, res) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);
    const user = await new User({
      username: req.body.username,
      email: req.body.email,
      password: hashedPassword,
      profile: req.file.path,
    });
    await user.save();
    res.status(200).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).send("User not found");
    }
    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword) {
      return res.status(400).send("Invalid Password");
    }

    res.status(200).json(user);
  } catch (error) {
    console.log(error);
  }
});

module.exports = router;
