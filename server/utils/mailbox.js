const mongoose = require("mongoose");
const Device = require("../models/Device");
const Envelope = require("../models/Envelope");
const { ENVELOPE_TTL_MS } = require("../models/Envelope");

// Store-and-forward delivery: every message is queued once per device that
// should get it and deleted when that device confirms it has stored it.
//
// While the app moves over, messages are still kept in the Message
// collection too; devices that never register (older app versions) only use
// that.

const DEFAULT_BATCH = 100;
const MAX_BATCH = 500;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const isDeviceId = (value) =>
  typeof value === "string" && DEVICE_ID_PATTERN.test(value);

// Each connected device's sockets join this room.
const deviceRoom = (deviceId) => `device:${deviceId}`;

const expiry = () => new Date(Date.now() + ENVELOPE_TTL_MS);

/**
 * Registers a device for userId, or marks a known one as seen. Resolves to
 * false when the id is invalid or belongs to another account.
 */
const registerDevice = async (userId, deviceId, platform, retried = false) => {
  if (!isDeviceId(deviceId)) return false;
  try {
    const device = await Device.findOneAndUpdate(
      { deviceId },
      {
        $set: {
          lastSeenAt: new Date(),
          ...(typeof platform === "string" ? { platform: platform.slice(0, 20) } : {}),
        },
        $setOnInsert: { userId: String(userId) },
      },
      { upsert: true, new: true },
    );
    return device.userId === String(userId);
  } catch (error) {
    // Two first connections from the same device raced on the unique index;
    // the second attempt finds the device the first one created.
    if (error?.code === 11000 && !retried) {
      return registerDevice(userId, deviceId, platform, true);
    }
    throw error;
  }
};

/** Resolves to the device id when userId owns it, otherwise null. */
const ownedDevice = async (userId, deviceId) => {
  if (!isDeviceId(deviceId)) return null;
  const owned = await Device.exists({ deviceId, userId: String(userId) });
  return owned ? deviceId : null;
};

/** Forgets a device and its waiting mail (logout). */
const removeDevice = async (userId, deviceId) => {
  if (!isDeviceId(deviceId)) return;
  const { deletedCount } = await Device.deleteOne({ deviceId, userId: String(userId) });
  if (deletedCount > 0) await Envelope.deleteMany({ recipientDeviceId: deviceId });
};

const devicesOf = (userIds) =>
  Device.find({ userId: { $in: [...new Set(userIds.map(String))] } })
    .select("deviceId userId")
    .lean();

// What a device receives: routing fields and the opaque payload.
const toWire = (envelope) => ({
  id: String(envelope._id),
  messageId: envelope.messageId,
  kind: envelope.kind,
  conversationId: envelope.conversationId,
  senderUserId: envelope.senderUserId,
  senderDeviceId: envelope.senderDeviceId,
  payload: envelope.payload,
  serverTs: envelope.serverTs,
});

// Queues envelopes, skipping ones already queued for that device, and hands
// the new ones to devices that are connected. Returns the new envelopes.
const queue = async (io, envelopes) => {
  if (envelopes.length === 0) return [];

  let result;
  try {
    result = await Envelope.bulkWrite(
      envelopes.map((envelope) => ({
        updateOne: {
          filter: {
            recipientDeviceId: envelope.recipientDeviceId,
            kind: envelope.kind,
            messageId: envelope.messageId,
          },
          update: { $setOnInsert: envelope },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (error) {
    // A concurrent send queued the same envelope first; the rest went in.
    const onlyDuplicates =
      error?.writeErrors?.length > 0 &&
      error.writeErrors.every((writeError) => writeError.code === 11000);
    if (!onlyDuplicates) throw error;
    result = error.result;
  }

  const upserted = result?.upsertedIds || {};
  const queued = Object.entries(upserted).map(([index, _id]) => ({
    ...envelopes[Number(index)],
    _id,
  }));
  for (const envelope of queued) {
    io.to(deviceRoom(envelope.recipientDeviceId)).emit("envelope", toWire(envelope));
  }
  return queued;
};

const plain = (doc) => (typeof doc?.toObject === "function" ? doc.toObject() : doc);

/** The payload of a chat or system message. */
const messagePayload = (message) => {
  const { type, text, replyTo, event } = plain(message);
  return JSON.stringify({
    v: 1,
    type: type === "system" ? "system" : "text",
    text,
    ...(replyTo?.messageId
      ? {
          replyTo: {
            messageId: replyTo.messageId,
            sender: replyTo.sender,
            text: replyTo.text,
          },
        }
      : {}),
    ...(event ? { event } : {}),
  });
};

/**
 * Queues a stored message for every device of `userIds`, except the device
 * it was sent from (which already has it).
 */
const queueMessage = async (io, message, userIds, senderDeviceId = null) => {
  const devices = await devicesOf(userIds);
  const serverTs = message.createdAt || new Date();
  const payload = messagePayload(message);
  const expiresAt = expiry();

  return queue(
    io,
    devices
      .filter((device) => device.deviceId !== senderDeviceId)
      .map((device) => ({
        messageId: String(message._id),
        kind: "message",
        conversationId: String(message.conversationId),
        senderUserId: String(message.sender),
        senderDeviceId,
        recipientUserId: device.userId,
        recipientDeviceId: device.deviceId,
        payload,
        serverTs,
        expiresAt,
      })),
  );
};

/**
 * Tells senders that `byUserId` has received or read their messages.
 * `messages`: [{ _id, sender, conversationId }]. One receipt goes to each of
 * a sender's devices per conversation.
 */
const queueReceipts = async (io, status, byUserId, messages) => {
  const by = String(byUserId);
  const groups = new Map();
  for (const message of messages) {
    const sender = String(message.sender);
    if (sender === by) continue;
    const key = `${sender}|${message.conversationId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        sender,
        conversationId: String(message.conversationId),
        messageIds: [],
      });
    }
    groups.get(key).messageIds.push(String(message._id));
  }
  if (groups.size === 0) return [];

  const devices = await devicesOf([...groups.values()].map((group) => group.sender));
  const serverTs = new Date();
  const expiresAt = expiry();

  const envelopes = [];
  for (const group of groups.values()) {
    const payload = JSON.stringify({
      v: 1,
      status,
      messageIds: group.messageIds,
      by,
    });
    for (const device of devices) {
      if (device.userId !== group.sender) continue;
      envelopes.push({
        messageId: new mongoose.Types.ObjectId().toString(),
        kind: "receipt",
        conversationId: group.conversationId,
        senderUserId: by,
        senderDeviceId: null,
        recipientUserId: device.userId,
        recipientDeviceId: device.deviceId,
        payload,
        serverTs,
        expiresAt,
      });
    }
  }
  return queue(io, envelopes);
};

/** A device's waiting mail, oldest first, after the envelope id `after`. */
const fetchMail = async (userId, deviceId, { after, limit } = {}) => {
  const size = Math.min(Math.max(Number(limit) || DEFAULT_BATCH, 1), MAX_BATCH);
  const filter = { recipientDeviceId: deviceId, recipientUserId: String(userId) };
  if (typeof after === "string" && mongoose.isValidObjectId(after)) {
    filter._id = { $gt: new mongoose.Types.ObjectId(after) };
  }
  const envelopes = await Envelope.find(filter).sort({ _id: 1 }).limit(size).lean();
  return envelopes.map(toWire);
};

/**
 * Deletes mail the device has stored and tells the senders their messages
 * were delivered. Resolves to the number of envelopes removed.
 */
const acknowledge = async (io, userId, deviceId, messageIds) => {
  const ids = [
    ...new Set(
      (Array.isArray(messageIds) ? messageIds : []).filter(
        (id) => typeof id === "string" && id.length <= 64,
      ),
    ),
  ].slice(0, MAX_BATCH);
  if (ids.length === 0) return 0;

  const envelopes = await Envelope.find({
    recipientDeviceId: deviceId,
    recipientUserId: String(userId),
    messageId: { $in: ids },
  })
    .select("_id messageId kind conversationId senderUserId")
    .lean();
  if (envelopes.length === 0) return 0;

  await Envelope.deleteMany({ _id: { $in: envelopes.map((envelope) => envelope._id) } });

  const delivered = envelopes
    .filter((envelope) => envelope.kind === "message")
    .map((envelope) => ({
      _id: envelope.messageId,
      sender: envelope.senderUserId,
      conversationId: envelope.conversationId,
    }));
  await queueReceipts(io, "delivered", userId, delivered);
  return envelopes.length;
};

/**
 * Drops waiting mail for a conversation: one member's (removed or left), or
 * everyone's when userId is omitted (group deleted).
 */
const dropConversationMail = (conversationId, userId) =>
  Envelope.deleteMany({
    conversationId: String(conversationId),
    ...(userId ? { recipientUserId: String(userId) } : {}),
  });

module.exports = {
  isDeviceId,
  deviceRoom,
  registerDevice,
  ownedDevice,
  removeDevice,
  messagePayload,
  queueMessage,
  queueReceipts,
  fetchMail,
  acknowledge,
  dropConversationMail,
};
