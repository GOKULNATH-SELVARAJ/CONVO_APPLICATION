const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const generateToken = require("../utils/generateToken");
const {
  getAlphabetColor,
  generateAlphabetColors,
} = require("../utils/colorGeneration"); // adjust path as needed

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

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // 1. Check if username or email already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      const field = existingUser.email === email ? "Email ID" : "Username";
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Generate color and ensure uniqueness
    const initial = username?.charAt(0)?.toUpperCase() || "A";
    const alphabetColors = generateAlphabetColors();

    const colorOptionsForInitial = alphabetColors.filter(
      (color) => color.letter === initial
    );

    // Shuffle the color options to reduce collision probability
    const shuffledColors = colorOptionsForInitial.sort(
      () => 0.5 - Math.random()
    );

    let selectedColor = null;

    for (const color of shuffledColors) {
      const isTaken = await User.findOne({
        textColor: color.textColor,
        profileBackgroundColor: color.backgroundColor,
      });

      if (!isTaken) {
        selectedColor = color;
        break;
      }
    }

    // Fallback to the default color if all options are taken
    const finalColor = selectedColor || getAlphabetColor(initial);

    // 4. Create and save user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      textColor: finalColor.textColor,
      profileBackgroundColor: finalColor.backgroundColor,
      // profile: req.file?.path,
    });

    await user.save();

    res.status(200).json({
      success: true,
      message: "Account created successfully",
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        textColor: user.textColor,
        backgroundColor: user.profileBackgroundColor,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }
    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword) {
      return res.status(400).send("Invalid Password");
    }
    // const { accessToken, refreshToken } = await generateToken(user);
    // res.status(200).json(user)
    res.status(200).json({
      success: true,
      message: "Logged in successfully",
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        textColor: user.textColor,
        backgroundColor: user.profileBackgroundColor,
        createdAt: user.createdAt,
        status: user.status,
        // profile: user.profile, // Uncomment if you return profile URL
      },
    });
  } catch (error) {
    console.log(error);
  }
});

module.exports = router;
