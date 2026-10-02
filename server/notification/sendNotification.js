const admin = require("./firebase");
const User = require("../models/User");

// FCM errors meaning the token will never work again
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

// Sends a data-only FCM push to every device the user registered.
// Resolves to { sent: true } or { sent: false, reason: "no-token" | "token-removed" }.
const sendPushNotification = async (userId, data = {}) => {
  const user = await User.findById(userId).select("fcmToken fcmTokens");

  // fcmToken is the legacy single-token field
  const tokens = [
    ...new Set([...(user?.fcmTokens || []), user?.fcmToken].filter(Boolean)),
  ];

  if (tokens.length === 0) {
    return { sent: false, reason: "no-token" };
  }

  // FCM only accepts string values in `data`
  const stringData = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value)]),
  );

  const { responses, successCount } = await admin
    .messaging()
    .sendEachForMulticast({
      tokens,
      android: {
        priority: "high",
      },
      data: stringData,
    });

  const deadTokens = tokens.filter((_, i) =>
    DEAD_TOKEN_CODES.has(responses[i].error?.code),
  );

  if (deadTokens.length > 0) {
    await User.updateOne(
      { _id: userId },
      { $pull: { fcmTokens: { $in: deadTokens } } },
    );
    if (deadTokens.includes(user.fcmToken)) {
      await User.updateOne({ _id: userId }, { fcmToken: null });
    }
    console.log(`❌ Removed ${deadTokens.length} invalid FCM token(s)`);
  }

  if (successCount > 0) {
    return { sent: true };
  }
  if (deadTokens.length === tokens.length) {
    return { sent: false, reason: "token-removed" };
  }

  // Every send failed for some other reason (e.g. FCM outage)
  throw responses.find((response) => response.error).error;
};

module.exports = { sendPushNotification };
