const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const {
  isDeviceId,
  ownedDevice,
  registerDevice,
  fetchMail,
  acknowledge,
} = require("../utils/mailbox");

// The mailbox over REST, for when the app has no socket (e.g. handling a push
// in the background). The device is named by the X-Device-Id header.

// Register this device: { deviceId, platform }
router.post("/devices", auth, async (req, res) => {
  const { deviceId, platform } = req.body || {};
  if (!isDeviceId(deviceId)) {
    return res.status(400).json({ success: false, message: "Invalid device id" });
  }
  try {
    if (!(await registerDevice(req.userId, deviceId, platform))) {
      return res
        .status(409)
        .json({ success: false, message: "Device belongs to another account" });
    }
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("❌ Error registering device:", error);
    res.status(500).json({ success: false, message: "Could not register device" });
  }
});

// Only the signed-in user's own registered device can read or clear its mail.
const withDevice = async (req, res, next) => {
  try {
    const deviceId = await ownedDevice(req.userId, req.get("x-device-id"));
    if (!deviceId) {
      return res.status(404).json({ success: false, message: "Device not registered" });
    }
    req.deviceId = deviceId;
    next();
  } catch (error) {
    console.error("❌ Error checking device:", error);
    res.status(500).json({ success: false, message: "Could not check device" });
  }
};

// Waiting mail, oldest first: ?after=<envelope id>&limit=<n>
router.get("/", auth, withDevice, async (req, res) => {
  try {
    const envelopes = await fetchMail(req.userId, req.deviceId, {
      after: req.query.after,
      limit: req.query.limit,
    });
    res.status(200).json({ success: true, envelopes });
  } catch (error) {
    console.error("❌ Error fetching mail:", error);
    res.status(500).json({ success: false, message: "Could not fetch mail" });
  }
});

// Mail the device has stored: { messageIds }
router.post("/ack", auth, withDevice, async (req, res) => {
  try {
    const removed = await acknowledge(
      req.app.get("io"),
      req.userId,
      req.deviceId,
      req.body?.messageIds,
    );
    res.status(200).json({ success: true, removed });
  } catch (error) {
    console.error("❌ Error acknowledging mail:", error);
    res.status(500).json({ success: false, message: "Could not acknowledge mail" });
  }
});

module.exports = router;
