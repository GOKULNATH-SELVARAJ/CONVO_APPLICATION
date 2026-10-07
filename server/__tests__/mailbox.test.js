const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Device = require("../models/Device");
const Envelope = require("../models/Envelope");
const Message = require("../models/message");
const Conversation = require("../models/Conversation");
const {
  registerDevice,
  ownedDevice,
  removeDevice,
  queueMessage,
  queueReceipts,
  fetchMail,
  acknowledge,
  dropConversationMail,
} = require("../utils/mailbox");
const { markMessagesRead } = require("../utils/readState");
const { buildReplySnapshot } = require("../utils/replySnapshot");

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // The unique index is what stops a resend queueing twice
  await Promise.all([Device.init(), Envelope.init()]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    Device.deleteMany({}),
    Envelope.deleteMany({}),
    Message.deleteMany({}),
    Conversation.deleteMany({}),
  ]);
});

// Records what would have been sent to connected devices
const fakeIo = () => {
  const emitted = [];
  return {
    emitted,
    to: (room) => ({ emit: (event, data) => emitted.push({ room, event, data }) }),
  };
};

const A = "a".repeat(24);
const B = "b".repeat(24);
const C = "c".repeat(24);

const setUpDevices = async () => {
  await registerDevice(A, "device-a-phone");
  await registerDevice(A, "device-a-tablet");
  await registerDevice(B, "device-b-phone");
};

const sendMessage = (overrides = {}) =>
  Message.create({
    conversationId: "conv1",
    sender: A,
    text: "Hello",
    ...overrides,
  });

describe("devices", () => {
  it("registers a device to one account only", async () => {
    expect(await registerDevice(A, "device-a-phone", "android")).toBe(true);
    expect(await registerDevice(A, "device-a-phone")).toBe(true);
    expect(await registerDevice(B, "device-a-phone")).toBe(false);
    expect(await registerDevice(A, "short")).toBe(false);
    expect(await registerDevice(A, { $ne: null })).toBe(false);

    expect(await ownedDevice(A, "device-a-phone")).toBe("device-a-phone");
    expect(await ownedDevice(B, "device-a-phone")).toBeNull();
  });

  it("forgets a device and its mail on logout", async () => {
    await setUpDevices();
    await queueMessage(fakeIo(), await sendMessage(), [A, B], "device-a-phone");

    await removeDevice(B, "device-a-tablet"); // not B's: nothing happens
    expect(await Envelope.countDocuments({ recipientDeviceId: "device-a-tablet" })).toBe(1);

    await removeDevice(B, "device-b-phone");
    expect(await ownedDevice(B, "device-b-phone")).toBeNull();
    expect(await Envelope.countDocuments({ recipientDeviceId: "device-b-phone" })).toBe(0);
  });
});

describe("queueing messages", () => {
  it("queues one copy per device except the sending one, and hands it to connected devices", async () => {
    await setUpDevices();
    const io = fakeIo();
    const message = await sendMessage({
      replyTo: { messageId: "m0", sender: B, text: "Earlier" },
    });

    const queued = await queueMessage(io, message, [A, B], "device-a-phone");

    expect(queued.map((e) => e.recipientDeviceId).sort()).toEqual([
      "device-a-tablet",
      "device-b-phone",
    ]);
    expect(io.emitted.map((e) => e.room).sort()).toEqual([
      "device:device-a-tablet",
      "device:device-b-phone",
    ]);

    const [envelope] = io.emitted.filter((e) => e.room === "device:device-b-phone");
    expect(envelope.event).toBe("envelope");
    expect(envelope.data).toMatchObject({
      messageId: String(message._id),
      kind: "message",
      conversationId: "conv1",
      senderUserId: A,
      senderDeviceId: "device-a-phone",
    });
    expect(JSON.parse(envelope.data.payload)).toEqual({
      v: 1,
      type: "text",
      text: "Hello",
      replyTo: { messageId: "m0", sender: B, text: "Earlier" },
    });
  });

  it("queues a message only once however often it is sent", async () => {
    await setUpDevices();
    const message = await sendMessage();
    await queueMessage(fakeIo(), message, [A, B], "device-a-phone");

    const io = fakeIo();
    // The same message again, e.g. REST save then the socket emit
    const again = await queueMessage(io, message, [A, B], null);

    expect(again.map((e) => e.recipientDeviceId)).toEqual(["device-a-phone"]);
    expect(await Envelope.countDocuments()).toBe(3);
  });

  it("carries system lines with their event", async () => {
    await setUpDevices();
    const message = await sendMessage({
      type: "system",
      text: "QaA added QaB",
      event: { action: "added", targets: [B] },
    });
    const io = fakeIo();
    await queueMessage(io, message, [A, B]);

    expect(JSON.parse(io.emitted[0].data.payload)).toEqual({
      v: 1,
      type: "system",
      text: "QaA added QaB",
      event: { action: "added", targets: [B] },
    });
  });

  it("queues nothing for users with no registered device (older apps)", async () => {
    expect(await queueMessage(fakeIo(), await sendMessage(), [A, C])).toEqual([]);
  });
});

describe("collecting mail", () => {
  it("returns a device's own mail oldest first, page by page", async () => {
    await setUpDevices();
    const first = await sendMessage({ text: "one" });
    const second = await sendMessage({ text: "two" });
    const third = await sendMessage({ text: "three" });
    for (const message of [first, second, third]) {
      await queueMessage(fakeIo(), message, [A, B], "device-a-phone");
    }

    const page = await fetchMail(B, "device-b-phone", { limit: 2 });
    expect(page.map((e) => e.messageId)).toEqual([String(first._id), String(second._id)]);

    const rest = await fetchMail(B, "device-b-phone", { after: page[1].id, limit: 2 });
    expect(rest.map((e) => e.messageId)).toEqual([String(third._id)]);

    // Someone else's device id gets nothing
    expect(await fetchMail(A, "device-b-phone")).toEqual([]);
  });

  it("deletes stored mail and tells the sender's devices it was delivered", async () => {
    await setUpDevices();
    const message = await sendMessage();
    await queueMessage(fakeIo(), message, [A, B], "device-a-phone");

    // Acking another device's mail does nothing
    expect(await acknowledge(fakeIo(), A, "device-b-phone", [String(message._id)])).toBe(0);

    const io = fakeIo();
    expect(await acknowledge(io, B, "device-b-phone", [String(message._id), "unknown"])).toBe(1);
    expect(await fetchMail(B, "device-b-phone")).toEqual([]);

    const receipts = io.emitted.filter((e) => e.data.kind === "receipt");
    expect(receipts.map((e) => e.room).sort()).toEqual([
      "device:device-a-phone",
      "device:device-a-tablet",
    ]);
    expect(JSON.parse(receipts[0].data.payload)).toEqual({
      v: 1,
      status: "delivered",
      messageIds: [String(message._id)],
      by: B,
    });

    // Receipts are mail too: acking one sends nothing further
    const receiptIo = fakeIo();
    expect(
      await acknowledge(receiptIo, A, "device-a-phone", [receipts[0].data.messageId]),
    ).toBe(1);
    expect(receiptIo.emitted).toEqual([]);
  });
});

describe("read receipts", () => {
  it("sends one receipt per sender and conversation, never to the reader", async () => {
    await setUpDevices();
    await registerDevice(C, "device-c-phone");
    const io = fakeIo();

    await queueReceipts(io, "read", B, [
      { _id: "m1", sender: A, conversationId: "conv1" },
      { _id: "m2", sender: A, conversationId: "conv1" },
      { _id: "m3", sender: C, conversationId: "conv2" },
      { _id: "m4", sender: B, conversationId: "conv1" }, // B's own
    ]);

    const byRoom = Object.fromEntries(
      io.emitted.map((e) => [e.room, JSON.parse(e.data.payload)]),
    );
    expect(Object.keys(byRoom).sort()).toEqual([
      "device:device-a-phone",
      "device:device-a-tablet",
      "device:device-c-phone",
    ]);
    expect(byRoom["device:device-a-phone"].messageIds).toEqual(["m1", "m2"]);
    expect(byRoom["device:device-c-phone"].messageIds).toEqual(["m3"]);
  });

  it("reports which messages the reader newly read", async () => {
    const conversation = await Conversation.create({ members: [A, B] });
    const conversationId = String(conversation._id);
    const first = await sendMessage({ conversationId });
    const second = await sendMessage({ conversationId });
    await sendMessage({ conversationId, sender: B }); // B's own

    const some = await markMessagesRead(conversation, B, [String(first._id), "not-an-id"]);
    expect(some.read.map((m) => String(m._id))).toEqual([String(first._id)]);
    expect(some.fullyRead).toEqual([String(first._id)]);

    const rest = await markMessagesRead(conversation, B);
    expect(rest.read.map((m) => String(m._id))).toEqual([String(second._id)]);

    expect((await markMessagesRead(conversation, B)).read).toEqual([]);
  });
});

describe("messages from apps that store them on the device", () => {
  const CLIENT_ID = "0b6e2a4c-9f1d-4c3e-8a7b-5d2f1e0c9a8b";

  it("uses the app's id for the envelope and for receipts", async () => {
    await setUpDevices();
    const message = await sendMessage({ clientId: CLIENT_ID });

    const io = fakeIo();
    await queueMessage(io, message, [A, B], "device-a-phone");
    expect(io.emitted.map((e) => e.data.messageId)).toEqual([CLIENT_ID, CLIENT_ID]);

    const receiptIo = fakeIo();
    await acknowledge(receiptIo, B, "device-b-phone", [CLIENT_ID]);
    expect(JSON.parse(receiptIo.emitted[0].data.payload).messageIds).toEqual([CLIENT_ID]);
  });

  it("stores a retried message once", async () => {
    await Message.init();
    await sendMessage({ clientId: CLIENT_ID });
    await expect(sendMessage({ clientId: CLIENT_ID })).rejects.toThrow(/duplicate key/);
    // Another sender may use the same id; ids only need to be unique per sender
    await expect(sendMessage({ clientId: CLIENT_ID, sender: B })).resolves.toBeTruthy();
  });

  it("marks messages read by their app id", async () => {
    const conversation = await Conversation.create({ members: [A, B] });
    const conversationId = String(conversation._id);
    const withId = await sendMessage({ conversationId, clientId: CLIENT_ID });
    await sendMessage({ conversationId });

    const { read } = await markMessagesRead(conversation, B, [CLIENT_ID]);
    expect(read.map((m) => String(m._id))).toEqual([String(withId._id)]);
    expect(read[0].clientId).toBe(CLIENT_ID);
  });

  it("quotes a reply to it by its app id, for both kinds of app", async () => {
    const original = await sendMessage({ clientId: CLIENT_ID, text: "Original" });

    const byClientId = await buildReplySnapshot("conv1", CLIENT_ID);
    const byMongoId = await buildReplySnapshot("conv1", String(original._id));
    const expected = {
      messageId: String(original._id), // older apps jump to the quote by _id
      clientId: CLIENT_ID,
      sender: A,
      text: "Original",
    };
    expect(byClientId).toEqual(expected);
    expect(byMongoId).toEqual(expected);
    expect(await buildReplySnapshot("conv2", CLIENT_ID)).toBeUndefined();

    // Devices get the quote by the id they know
    await setUpDevices();
    const reply = await sendMessage({ sender: B, text: "Reply", replyTo: byMongoId });
    const io = fakeIo();
    await queueMessage(io, reply, [A]);
    expect(JSON.parse(io.emitted[0].data.payload).replyTo).toEqual({
      messageId: CLIENT_ID,
      sender: A,
      text: "Original",
    });
  });
});

describe("leaving a conversation", () => {
  it("drops one member's waiting mail, or everyone's", async () => {
    await setUpDevices();
    await queueMessage(fakeIo(), await sendMessage(), [A, B], "device-a-phone");
    await queueMessage(fakeIo(), await sendMessage({ conversationId: "conv2" }), [A, B]);

    await dropConversationMail("conv1", B);
    expect(
      (await fetchMail(B, "device-b-phone")).map((e) => e.conversationId),
    ).toEqual(["conv2"]);
    expect(await fetchMail(A, "device-a-tablet")).toHaveLength(2);

    await dropConversationMail("conv1");
    expect(await Envelope.countDocuments({ conversationId: "conv1" })).toBe(0);
  });
});
