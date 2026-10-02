const admin = require("./firebase");
const User = require("../models/User");

// Sends a data-only FCM push to a user.
// Resolves to { sent: true } or { sent: false, reason: "no-token" | "token-removed" }.
const sendPushNotification = async (userId, data = {}) => {
  const user = await User.findById(userId).select("fcmToken");

  if (!user?.fcmToken) {
    return { sent: false, reason: "no-token" };
  }

  // FCM only accepts string values in `data`
  const stringData = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value)]),
  );

  try {
    await admin.messaging().send({
      token: user.fcmToken,
      android: {
        priority: "high",
      },
      data: stringData,
    });

    return { sent: true };
  } catch (error) {
    if (
      error.errorInfo?.code === "messaging/registration-token-not-registered"
    ) {
      await User.findByIdAndUpdate(userId, { fcmToken: null });
      console.log("❌ Invalid token removed from DB!");
      return { sent: false, reason: "token-removed" };
    }

    throw error;
  }
};

module.exports = { sendPushNotification };
