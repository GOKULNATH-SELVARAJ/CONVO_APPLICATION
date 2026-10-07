const router = require("express").Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { EMAIL_COLLATION } = require("../models/User");
const bcrypt = require("bcrypt");
const auth = require("../middleware/authMiddleware");
const {
  getAlphabetColor,
  generateAlphabetColors,
  normalizeLetter,
} = require("../utils/colorGeneration"); // adjust path as needed
const { generateAccessToken, generateRefreshToken } = require("../utils/token");
const { removeDevice } = require("../utils/mailbox");

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim() !== "";

// Register

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Strings only, so objects like { "$ne": null } can't reach the query
    if (![username, email, password].every(isNonEmptyString)) {
      return res.status(400).json({
        success: false,
        message: "Username, email and password are required",
      });
    }

    // 1. Check if username or email already exists (email ignoring case)
    const [emailTaken, usernameTaken] = await Promise.all([
      User.exists({ email }).collation(EMAIL_COLLATION),
      User.exists({ username }),
    ]);

    if (emailTaken || usernameTaken) {
      const field = emailTaken ? "Email ID" : "Username";
      return res.status(400).json({
        success: false,
        message: `${field} already exists`,
      });
    }

    // 2. Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Generate color and ensure uniqueness
    const initial = normalizeLetter(username);
    const alphabetColors = generateAlphabetColors();

    const colorOptionsForInitial = alphabetColors.filter(
      (color) => color.letter === initial,
    );

    // Shuffle the color options to reduce collision probability
    const shuffledColors = colorOptionsForInitial.sort(
      () => 0.5 - Math.random(),
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
    if (!isNonEmptyString(req.body.email) || !isNonEmptyString(req.body.password)) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: req.body.email }).collation(
      EMAIL_COLLATION,
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password,
    );

    if (!validPassword) {
      return res.status(400).json({
        success: false,
        message: "Invalid Password",
      });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Persist the refresh token so it can be revoked on logout
    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Logged in successfully",
      accessToken,
      refreshToken,
      data: {
        userId: user._id,
        username: user.username,
        email: user.email,
        textColor: user.textColor,
        backgroundColor: user.profileBackgroundColor,
        createdAt: user.createdAt,
        status: user.status,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Refresh -> issue a new access token from a valid refresh token
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Refresh token is required" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Must still be the stored token, so logout actually revokes it
    const user = await User.findById(decoded.userId).select("refreshToken");
    if (!user || user.refreshToken !== refreshToken) {
      return res
        .status(403)
        .json({ success: false, message: "Invalid or expired refresh token" });
    }

    const newAccessToken = generateAccessToken(decoded.userId);

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res
      .status(403)
      .json({ success: false, message: "Invalid or expired refresh token" });
  }
});

// Logout -> revoke the stored refresh token, and this device's push token and
// mailbox (deviceId) if sent
router.post("/logout", auth, async (req, res) => {
  try {
    const userId = req.userId;
    const { fcmToken, deviceId } = req.body || {};

    const update = { $unset: { refreshToken: 1 } };
    if (isNonEmptyString(fcmToken)) {
      update.$pull = { fcmTokens: fcmToken };
    }
    await User.findByIdAndUpdate(userId, update);

    if (isNonEmptyString(fcmToken)) {
      // Legacy single-token field
      await User.updateOne({ _id: userId, fcmToken }, { fcmToken: null });
    }

    // This device stops getting mail; what was waiting for it is dropped
    await removeDevice(userId, deviceId);

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (err) {
    res.status(500).json({ message: "Logout failed" });
  }
});

module.exports = router;
