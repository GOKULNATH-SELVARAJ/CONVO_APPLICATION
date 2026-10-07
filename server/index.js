// server.js or index.js
const dotenv = require("dotenv");

// Must run before requiring anything that reads process.env at load time
// (e.g. notification/firebase.js via routes/users.js)
dotenv.config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");

const Message = require("./models/message");
const Conversation = require("./models/Conversation");
const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");
const conversationRoutes = require("./routes/conversation");
const messageRoutes = require("./routes/message");
const syncRoutes = require("./routes/sync");
const { buildReplySnapshot } = require("./utils/replySnapshot");
const {
  otherMembers,
  markMessagesRead,
  refreshConversationSummary,
} = require("./utils/readState");
const {
  isDeviceId,
  deviceRoom,
  registerDevice,
  queueMessage,
  queueReceipts,
  fetchMail,
  acknowledge,
} = require("./utils/mailbox");
const {
  getConversationsFor,
  emitConversationLists,
} = require("./utils/conversationEvents");
const User = require("./models/User");
const {
  findMemberConversation,
  visibleMessagesFilter,
} = require("./utils/conversationAccess");
const { sendPushNotification } = require("./notification/sendNotification");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin:
      process.env.CLIENT_URL || "https://convo-application-1.onrender.com",
    credentials: true,
  },
});
// REST routes that change groups notify members live through this
app.set("io", io);

mongoose.connect(process.env.MONGO_URL);
mongoose.connection.once("open", () => {
  console.log("✅ MongoDB connected successfully");
});

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/conversation", conversationRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/sync", syncRoutes);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

// ----------------------
// 🔌 Socket.IO Events
// ----------------------

// Every socket joins a private room named after its userId, so that room
// holds all of the user's connected sockets (one per device / tab).
const getUserSocketIds = (userId) => io.sockets.adapter.rooms.get(String(userId));

const isUserInRoom = (userId, roomId) => {
  const userSocketIds = getUserSocketIds(userId);
  const clientsInRoom = io.sockets.adapter.rooms.get(String(roomId));
  if (!userSocketIds || !clientsInRoom) return false;

  for (const socketId of userSocketIds) {
    if (clientsInRoom.has(socketId)) return true;
  }
  return false;
};

const setUserStatus = async (userId, status) => {
  await User.findByIdAndUpdate(userId, { status });
  io.emit("userStatus", { userId, status });
};

// Authenticate the handshake with the same access token used for the REST API.
// Client: io(URL, { auth: { token: accessToken } })
io.use((socket, next) => {
  const rawToken =
    socket.handshake.auth?.token || socket.handshake.headers?.authorization;
  const token =
    typeof rawToken === "string" ? rawToken.replace(/^Bearer\s+/i, "") : null;

  if (!token) return next(new Error("Unauthorized"));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId.toString();
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  // Identity comes from the verified token; userIds sent in payloads are ignored
  const userId = socket.userId;

  socket.join(userId);
  console.log("🟢 User connected:", userId, socket.id);

  // Registers a handler whose errors (bad payloads, DB failures) are logged
  // instead of crashing the whole process
  const on = (event, handler) => {
    socket.on(event, async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`❌ Error in "${event}":`, error);
      }
    });
  };

  const reply = (callback, value) => {
    if (typeof callback === "function") callback(value);
  };

  setUserStatus(userId, "online").catch((error) =>
    console.error("❌ Failed to set user online:", error),
  );

  // App versions with a mailbox name their device in the handshake
  // (auth: { token, deviceId, platform }). Resolves to the device id once it
  // is registered to this user, or null (older apps, or an id another
  // account owns). Mailbox handlers wait for it.
  const deviceReady = (async () => {
    const { deviceId, platform } = socket.handshake.auth || {};
    if (!isDeviceId(deviceId)) return null;
    if (!(await registerDevice(userId, deviceId, platform))) {
      console.warn(`⚠️ Device ${deviceId} belongs to another account`);
      return null;
    }
    socket.join(deviceRoom(deviceId));
    return deviceId;
  })().catch((error) => {
    console.error("❌ Failed to register device:", error);
    return null;
  });

  // Kept for client compatibility; the user is already identified by the token
  on("setup", () => {
    socket.emit("connected");
  });

  on("check user in room", async (payload, callback) => {
    const { userId: otherUserId, roomId } = payload || {};

    const conversation = await findMemberConversation(roomId, userId);
    const isOtherUserInRoom =
      !!conversation && !!otherUserId && isUserInRoom(otherUserId, roomId);

    reply(callback, isOtherUserInRoom);
  });

  on("join chat", async (roomId) => {
    const conversation = await findMemberConversation(roomId, userId);
    if (!conversation) return;

    socket.join(String(roomId));
    console.log(`🔗 ${userId} joined room: ${roomId}`);
  });

  on("userOnline", () => setUserStatus(userId, "online"));

  on("userOffline", () => setUserStatus(userId, "offline"));

  // { conversationId } reaches every other member (groups and direct chats);
  // the older { receiverId } form still works for direct chats. Receivers get
  // (senderId, conversationId); older apps only read the first argument.
  const relayTyping = (event) => async (payload) => {
    const { conversationId, receiverId } = payload || {};
    if (conversationId) {
      const conversation = await findMemberConversation(conversationId, userId);
      if (!conversation) return;
      io.to(otherMembers(conversation, userId)).emit(
        event,
        userId,
        String(conversation._id),
      );
    } else if (receiverId) {
      io.to(String(receiverId)).emit(event, userId);
    }
  };
  on("typing", relayTyping("typing"));
  on("stopTyping", relayTyping("stopTyping"));

  on("leave chat", (payload) => {
    const { roomId } = payload || {};
    if (!roomId) return;

    socket.leave(String(roomId));
    console.log(`🚪 User ${userId} left room ${roomId}`);

    // Notify others in the same room
    socket.to(String(roomId)).emit("user left chat", { userId, roomId });
  });

  // Validates and stores an incoming socket message.
  // Resolves to { error } or { savedMessage, conversation, recipients, readers }.
  const saveSocketMessage = async (newMessage) => {
    const {
      conversationId,
      text,
      replyToId,
      _id: existingMessageId,
    } = newMessage || {};
    if (typeof text !== "string" || !text.trim()) {
      return { error: "Message text is required" };
    }

    const conversation = await findMemberConversation(conversationId, userId);
    if (!conversation) return { error: "Conversation not found" };

    const recipients = otherMembers(conversation, userId);
    if (recipients.length === 0) return { error: "Conversation has no receiver" };

    // Members with the chat open are reading it as it arrives
    const readers = recipients.filter((memberId) =>
      isUserInRoom(memberId, conversationId),
    );
    const readState = {
      seenBy: readers,
      seen: readers.length === recipients.length,
    };

    // Clients that already saved the message via POST /api/message pass the
    // saved document here; reuse it instead of storing a duplicate
    let savedMessage = mongoose.isValidObjectId(existingMessageId)
      ? await Message.findOneAndUpdate(
          { _id: existingMessageId, conversationId, sender: userId },
          readState,
          { new: true },
        )
      : null;

    if (!savedMessage) {
      savedMessage = await Message.create({
        conversationId,
        sender: userId,
        text,
        ...readState,
        replyTo: await buildReplySnapshot(conversationId, replyToId),
        createdAt: new Date(),
      });
    }

    return { savedMessage, conversation, recipients, readers };
  };

  // Optional ack as the last argument:
  // socket.emit("send message", msg, receiverId, ({ success, message, error }) => ...)
  on("send message", async (newMessage, ...rest) => {
    const ack = rest.find((arg) => typeof arg === "function");

    let result;
    try {
      result = await saveSocketMessage(newMessage);
    } catch (error) {
      reply(ack, { success: false, error: "Could not save message" });
      throw error;
    }

    if (result.error) {
      return reply(ack, { success: false, error: result.error });
    }

    const { savedMessage, conversation, recipients, readers } = result;
    const conversationId = String(conversation._id);

    // Acknowledge as soon as the message is stored; the fan-out below can't undo that
    reply(ack, { success: true, message: savedMessage });

    io.to(recipients).emit("message received", savedMessage);

    // Queue it for members' devices (none for older apps). Members with the
    // chat open have read it already, so their read receipts go out too.
    try {
      await queueMessage(io, savedMessage, conversation.members, await deviceReady);
      for (const readerId of readers) {
        await queueReceipts(io, "read", readerId, [savedMessage]);
      }
    } catch (error) {
      console.error("❌ Could not queue message for devices:", error);
    }

    // Everyone had the chat open, so it was stored as already read. Tell the
    // sender now instead of relying on the readers' apps to follow up with
    // markAsSeen, otherwise the sender's ticks stay grey while the DB says seen.
    if (savedMessage.seen) {
      io.to(userId).emit("messages seen", {
        conversationId,
        // Kept for direct chats on older app builds
        seenBy: conversation.isGroup ? undefined : readers[0],
        messageIds: [String(savedMessage._id)],
      });
    }

    await refreshConversationSummary(conversationId);
    await emitConversationLists(io, conversation.members);

    const absent = recipients.filter((memberId) => !readers.includes(memberId));
    if (absent.length > 0) {
      try {
        const sender = await User.findById(userId).select("username").lean();
        const senderName = sender?.username || "Someone";
        // Direct chat: titled by the sender. Group: by the group, with the
        // sender inside the message.
        const title = conversation.isGroup ? conversation.name : senderName;

        await Promise.all(
          absent.map((receiverId) =>
            sendPushNotification(receiverId, {
              chatId: conversationId,
              senderId: userId,
              receiverId,
              title,
              body: savedMessage.text,
              senderName,
              ...(conversation.isGroup ? { isGroup: "1" } : {}),
            }),
          ),
        );
      } catch (notifyErr) {
        console.log("❌ Failed to send notification:", notifyErr.message);
      }
    }
  });

  // Records that this user read the given messages (all unread ones when
  // messageIds is omitted) and tells everyone who needs to know.
  const markRead = async (conversationId, messageIds) => {
    const conversation = await findMemberConversation(conversationId, userId);
    if (!conversation) return false;

    const { read, fullyRead } = await markMessagesRead(
      conversation,
      userId,
      messageIds,
    );

    // Only the conversation's members are told, not every connected client.
    // messageIds lists the messages now read by everyone (blue ticks).
    io.to(conversation.members.map(String)).emit("messages seen", {
      conversationId: String(conversation._id),
      seenBy: userId,
      messageIds: fullyRead,
    });

    // Read receipts to the senders' devices
    try {
      await queueReceipts(io, "read", userId, read);
    } catch (error) {
      console.error("❌ Could not queue read receipts:", error);
    }

    await refreshConversationSummary(conversation._id);
    await emitConversationLists(io, conversation.members);
    return true;
  };

  on("markAsSeen", async (payload) => {
    const { conversationId } = payload || {};
    if (await markRead(conversationId)) {
      console.log(`✅ ${userId} marked conversation ${conversationId} as seen`);
    }
  });

  // ---- Mailbox (app versions that store messages on the device) ----

  // { conversationId, messageIds }: the messages this device has shown
  on("ack read", async (payload, callback) => {
    const { conversationId, messageIds } = payload || {};
    if (!Array.isArray(messageIds)) {
      return reply(callback, { success: false, error: "messageIds required" });
    }
    const done = await markRead(conversationId, messageIds.map(String));
    reply(callback, { success: done });
  });

  // { after, limit } -> { success, envelopes }: waiting mail, oldest first.
  // Pass the last envelope's id as `after` to page through it.
  on("sync", async (payload, callback) => {
    const deviceId = await deviceReady;
    if (!deviceId) {
      return reply(callback, { success: false, error: "Device not registered" });
    }
    try {
      const envelopes = await fetchMail(userId, deviceId, payload || {});
      reply(callback, { success: true, envelopes });
    } catch (error) {
      reply(callback, { success: false, error: "Could not fetch mail" });
      throw error;
    }
  });

  // { messageIds }: mail this device has stored, so the server can delete it
  on("ack delivered", async (payload, callback) => {
    const deviceId = await deviceReady;
    if (!deviceId) {
      return reply(callback, { success: false, error: "Device not registered" });
    }
    try {
      const removed = await acknowledge(io, userId, deviceId, payload?.messageIds);
      reply(callback, { success: true, removed });
    } catch (error) {
      reply(callback, { success: false, error: "Could not acknowledge mail" });
      throw error;
    }
  });

  on("get messages", async (conversationId, callback) => {
    try {
      const conversation = await findMemberConversation(conversationId, userId);
      if (!conversation) {
        return reply(callback, { success: false, messages: [] });
      }

      const messages = await Message.find(
        visibleMessagesFilter(conversation, userId),
      )
        .sort({ createdAt: 1 })
        .lean();
      reply(callback, { success: true, messages });
    } catch (error) {
      console.error("❌ Error fetching messages:", error);
      reply(callback, { success: false, messages: [] });
    }
  });

  on("disconnect", async () => {
    console.log("🔴 Disconnected socket:", userId, socket.id);

    // The socket has already left its rooms here, so an empty personal room
    // means this was the user's last open connection
    if (!getUserSocketIds(userId)) {
      await setUserStatus(userId, "offline");
    }
  });
});
