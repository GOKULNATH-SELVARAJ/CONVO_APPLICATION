const mongoose = require("mongoose");

const userSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      min: 3,
      max: 15,
      unique: true,
    },
    // Stored lowercased; look up with EMAIL_COLLATION so accounts created
    // before this change (with mixed-case emails) still match
    email: {
      type: String,
      required: true,
      max: 50,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      min: 8,
    },
    textColor: {
      type: String,
      required: true,
    },
    profileBackgroundColor: {
      type: String,
      required: true,
    },
    // Legacy single push token; read alongside fcmTokens and migrated on the next add-token
    fcmToken: {
      type: String,
      default: null,
    },
    // One FCM token per device
    fcmTokens: {
      type: [String],
      default: [],
    },
    refreshToken: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
    },
  },
  { timestamps: true }
);

// Case-insensitive comparison for email lookups
const EMAIL_COLLATION = { locale: "en", strength: 2 };

module.exports = mongoose.model("User", userSchema);
module.exports.EMAIL_COLLATION = EMAIL_COLLATION;
