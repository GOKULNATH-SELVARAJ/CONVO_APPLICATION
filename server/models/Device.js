const mongoose = require("mongoose");

// A device stops getting mail once it has been away this long. Its waiting
// envelopes expire after the same time, so nothing is lost by forgetting it;
// it registers again the next time it connects.
const DEVICE_IDLE_SECONDS = 30 * 24 * 60 * 60;

// One app install signed in as one user. Each device has its own mailbox, so
// a message reaches every phone the user is signed in on.
const deviceSchema = new mongoose.Schema(
  {
    // Chosen by the app (a random id per install and account)
    deviceId: {
      type: String,
      required: true,
      unique: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

deviceSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: DEVICE_IDLE_SECONDS });

module.exports = mongoose.model("Device", deviceSchema);
module.exports.DEVICE_IDLE_SECONDS = DEVICE_IDLE_SECONDS;
