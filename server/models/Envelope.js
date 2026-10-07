const mongoose = require("mongoose");

// Mail no device collects within this time is dropped.
const ENVELOPE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// A message (or receipt) waiting for one device. It is deleted as soon as the
// device confirms it has stored it, so the server holds mail, not history.
//
// The server only reads the routing fields. `payload` is opaque: JSON today,
// ciphertext once messages are end-to-end encrypted.
const envelopeSchema = new mongoose.Schema({
  // The message's id, the same in every copy; receipts get their own
  messageId: {
    type: String,
    required: true,
  },
  // message: a chat or system line; receipt: delivered / read ticks
  kind: {
    type: String,
    enum: ["message", "receipt"],
    required: true,
  },
  conversationId: {
    type: String,
    required: true,
  },
  senderUserId: {
    type: String,
    required: true,
  },
  // Null when the server wrote it (group changes, receipts)
  senderDeviceId: {
    type: String,
    default: null,
  },
  recipientUserId: {
    type: String,
    required: true,
  },
  recipientDeviceId: {
    type: String,
    required: true,
  },
  payload: {
    type: String,
    required: true,
  },
  // Sets the order of messages in a chat
  serverTs: {
    type: Date,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

// A device reads its mail oldest first
envelopeSchema.index({ recipientDeviceId: 1, _id: 1 });
// A message is queued once per device, however many times it is sent
envelopeSchema.index(
  { recipientDeviceId: 1, kind: 1, messageId: 1 },
  { unique: true },
);
envelopeSchema.index({ conversationId: 1, recipientUserId: 1 });
envelopeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Envelope", envelopeSchema);
module.exports.ENVELOPE_TTL_MS = ENVELOPE_TTL_MS;
