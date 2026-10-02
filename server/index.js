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
const User = require("./models/User");
const { findMemberConversation } = require("./utils/conversationAccess");
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

const getConversationsFor = (userId) =>
  Conversation.find({ members: userId }).sort({ lastMessageAt: -1 });

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

  on("typing", (payload) => {
    const { receiverId } = payload || {};
    if (receiverId) io.to(String(receiverId)).emit("typing", userId);
  });

  on("stopTyping", (payload) => {
    const { receiverId } = payload || {};
    if (receiverId) io.to(String(receiverId)).emit("stopTyping", userId);
  });

  on("leave chat", (payload) => {
    const { roomId } = payload || {};
    if (!roomId) return;

    socket.leave(String(roomId));
    console.log(`🚪 User ${userId} left room ${roomId}`);

    // Notify others in the same room
    socket.to(String(roomId)).emit("user left chat", { userId, roomId });
  });

  // Validates and stores an incoming socket message.
  // Resolves to { error } or { savedMessage, conversation, receiverId, isReceiverInsideChat }.
  const saveSocketMessage = async (newMessage) => {
    const { conversationId, text, _id: existingMessageId } = newMessage || {};
    if (typeof text !== "string" || !text.trim()) {
      return { error: "Message text is required" };
    }

    const conversation = await findMemberConversation(conversationId, userId);
    if (!conversation) return { error: "Conversation not found" };

    const receiverId = conversation.members.find(
      (memberId) => memberId.toString() !== userId,
    );
    if (!receiverId) return { error: "Conversation has no receiver" };

    const isReceiverInsideChat = isUserInRoom(receiverId, conversationId);

    // Clients that already saved the message via POST /api/message pass the
    // saved document here; reuse it instead of storing a duplicate
    let savedMessage = mongoose.isValidObjectId(existingMessageId)
      ? await Message.findOneAndUpdate(
          { _id: existingMessageId, conversationId, sender: userId },
          { seen: isReceiverInsideChat },
          { new: true },
        )
      : null;

    if (!savedMessage) {
      savedMessage = await Message.create({
        conversationId,
        sender: userId,
        text,
        seen: isReceiverInsideChat,
        createdAt: new Date(),
      });
    }

    return { savedMessage, conversation, receiverId, isReceiverInsideChat };
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

    const { savedMessage, conversation, receiverId, isReceiverInsideChat } =
      result;
    const conversationId = String(conversation._id);

    // Acknowledge as soon as the message is stored; the fan-out below can't undo that
    reply(ack, { success: true, message: savedMessage });

    io.to(receiverId).emit("message received", savedMessage);

    // The receiver has this chat open, so the message was stored as already
    // read. Tell the sender now instead of relying on the receiver's app to
    // follow up with markAsSeen (older app builds skip it for messages in a
    // row), otherwise the sender's ticks stay grey while the DB says seen.
    if (isReceiverInsideChat) {
      io.to(userId).emit("messages seen", {
        conversationId,
        seenBy: String(receiverId),
      });
    }

    // Counted from the messages themselves so a message already counted by
    // POST /api/message isn't counted twice
    const receiverUnseenCount = await Message.countDocuments({
      conversationId,
      sender: { $ne: receiverId },
      seen: false,
    });

    const updatedLastMessage = conversation.members.map((memberId) => ({
      id: memberId,
      lastMessage: savedMessage.text,
      seen: isReceiverInsideChat,
      unseenMessagesCount:
        memberId.toString() === userId ? 0 : receiverUnseenCount,
    }));

    await Conversation.findByIdAndUpdate(conversationId, {
      lastMessage: updatedLastMessage,
      lastMessageAt: new Date(),
      updatedAt: new Date(),
      lastMessageSentBy: userId,
    });

    const [senderConversations, receiverConversations] = await Promise.all([
      getConversationsFor(userId),
      getConversationsFor(receiverId),
    ]);
    io.to(receiverId).emit("conversation updated", receiverConversations);
    io.to(userId).emit("conversation updated", senderConversations);

    if (!isReceiverInsideChat) {
      try {
        const sender = await User.findById(userId).select("username").lean();
        const title = sender?.username || "New message";

        await sendPushNotification(receiverId, {
          chatId: conversationId,
          senderId: userId,
          receiverId,
          title,
          body: savedMessage.text,
        });
      } catch (notifyErr) {
        console.log("❌ Failed to send notification:", notifyErr.message);
      }
    }
  });

  on("markAsSeen", async (payload) => {
    const { conversationId } = payload || {};

    const conversation = await findMemberConversation(conversationId, userId);
    if (!conversation) return;

    const friendId = conversation.members.find(
      (memberId) => memberId.toString() !== userId,
    );

    // Only messages sent TO this user become seen, not the ones they sent
    await Message.updateMany(
      { conversationId, sender: { $ne: userId }, seen: false },
      { $set: { seen: true } },
    );

    const lastMsgDoc = await Message.findOne({ conversationId })
      .sort({ createdAt: -1 })
      .lean();

    const updatedLastMessage = await Promise.all(
      conversation.members.map(async (memberId) => {
        // how many messages this member has not seen (sent by the OTHER user)
        const unseenCount = await Message.countDocuments({
          conversationId,
          sender: { $ne: memberId },
          seen: false,
        });

        return {
          id: memberId,
          lastMessage: lastMsgDoc ? lastMsgDoc.text : "",
          unseenMessagesCount: unseenCount,
          seen: unseenCount === 0,
        };
      }),
    );

    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          updatedAt: new Date(),
          lastMessage: updatedLastMessage,
        },
      },
    );

    // Only the conversation's members are told, not every connected client
    io.to(conversation.members.map(String)).emit("messages seen", {
      conversationId,
      seenBy: userId,
    });

    const [userConversations, friendConversations] = await Promise.all([
      getConversationsFor(userId),
      friendId ? getConversationsFor(friendId) : [],
    ]);
    io.to(userId).emit("conversation updated", userConversations);
    if (friendId) {
      io.to(friendId).emit("conversation updated", friendConversations);
    }

    console.log(`✅ ${userId} marked conversation ${conversationId} as seen`);
  });

  on("get messages", async (conversationId, callback) => {
    try {
      const conversation = await findMemberConversation(conversationId, userId);
      if (!conversation) {
        return reply(callback, { success: false, messages: [] });
      }

      const messages = await Message.find({
        conversationId: String(conversationId),
      })
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
