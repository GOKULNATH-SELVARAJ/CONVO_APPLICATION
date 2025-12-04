// server.js or index.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const socketIO = require("socket.io");

const Message = require("./models/message");
const Conversation = require("./models/Conversation");
const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");
const conversationRoutes = require("./routes/conversation");
const messageRoutes = require("./routes/message");
const User = require("./models/User");

dotenv.config();

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
const onlineUsers = new Map(); // userId -> socketId

io.on("connection", (socket) => {
  console.log("🟢 New socket connected:", socket.id);

  socket.on("setup", (userData) => {
    if (userData?.userId) {
      onlineUsers.set(userData.userId, socket.id);
      socket.join(userData.userId);
      console.log(`✅ User joined personal room: ${userData.userId}`);
      socket.emit("connected");
    }
    socket.emit("online users", Array.from(onlineUsers.keys()));
  });

  socket.on("check user in room", ({ userId, roomId }, callback) => {
    const clientsInRoom = io.sockets.adapter.rooms.get(roomId);
    const userSocketId = onlineUsers.get(userId.toString());
    console.log("check user in room");

    const isUserInRoom = !!(
      clientsInRoom &&
      userSocketId &&
      clientsInRoom.has(userSocketId)
    );
    console.log("isUserInRoom", isUserInRoom);

    callback(isUserInRoom);
  });

  socket.on("join chat", (roomId) => {
    socket.join(roomId);
    console.log(`🔗 Joined room: ${roomId}`);
    console.log("JOIN REQUEST RECEIVED:", roomId, typeof roomId);
    // socket.join(roomId);
    console.log("ROOMS FOR THIS SOCKET:", socket.rooms);
  });

  socket.on("userOnline", async (userId) => {
    const logggg = await User.findByIdAndUpdate(
      userId,
      { status: "online" },
      { new: true }
    );
    console.log("logggg", logggg);

    io.emit("userStatus", { userId, status: "online" });
  });

  socket.on("userOffline", async (userId) => {
    const logggg222 = await User.findByIdAndUpdate(
      userId,
      { status: "offline" },
      { new: true }
    );
    console.log("logggg", logggg222);
    io.emit("userStatus", { userId, status: "offline" });
  });

  socket.on("typing", ({ userId, receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    io.to(receiverSocketId).emit("typing", userId);
  });

  socket.on("stopTyping", ({ userId, receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    io.to(receiverSocketId).emit("stopTyping", userId);
  });

  socket.on("leave chat", ({ roomId, userId }) => {
    socket.leave(roomId);
    console.log(`🚪 User ${userId} left room ${roomId}`);

    // Notify others in the same room
    socket.to(roomId).emit("user left chat", { userId, roomId });
  });

  socket.on("send message", async (newMessage, receiverId) => {
    try {
      const { conversationId, sender, text } = newMessage;

      // 1️⃣ Find receiver's socket
      const receiverSocketId = onlineUsers.get(receiverId);

      // 2️⃣ Check if receiver is inside the chat room
      const clientsInRoom = io.sockets.adapter.rooms.get(conversationId);
      const isReceiverInsideChat =
        receiverSocketId &&
        clientsInRoom &&
        clientsInRoom.has(receiverSocketId);

      // 3️⃣ Add seen flag based on presence **inside room**
      const messageWithSeenFlag = {
        ...newMessage,
        seen: isReceiverInsideChat,
      };

      const savedMessage = await Message.create({
        conversationId,
        sender,
        text,
        seen: isReceiverInsideChat,
        createdAt: new Date(),
      });

      // 4️⃣ Send message to receiver if online
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("message received", savedMessage); // ⬅️ use savedMessage
      }

      // 5️⃣ Fetch conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      // 6️⃣ Update lastMessage entry (WhatsApp logic)
      const updatedLastMessage = conversation.members.map((memberId) => {
        const prev = conversation.lastMessage?.find(
          (m) => m.id.toString() === memberId.toString()
        );

        if (memberId.toString() === sender.toString()) {
          return {
            id: memberId,
            lastMessage: text,
            unseenMessagesCount: 0,
            seen: true,
          };
        }

        return {
          id: memberId,
          lastMessage: text,
          seen: isReceiverInsideChat,
          unseenMessagesCount: isReceiverInsideChat
            ? 0
            : (prev?.unseenMessagesCount || 0) + 1,
        };
      });

      // 7️⃣ Store the updated conversation
      await Conversation.findByIdAndUpdate(
        conversationId,
        {
          lastMessage: updatedLastMessage,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        },
        { new: true }
      );
      const updatedConversations = await Conversation.find({
        members: sender,
      })
        .sort({ lastMessageAt: -1 })
        .limit();

      if (updatedConversations) {
        io.to(receiverSocketId).emit(
          "conversation updated",
          updatedConversations
        );
        io.to(sender).emit("conversation updated", updatedConversations);
      }
    } catch (error) {
      console.error("❌ Error in send message:", error);
    }
  });

  socket.on("markAsSeen", async ({ conversationId, userId }) => {
    if (!userId || !conversationId) return;

    try {
      await Message.updateMany(
        { conversationId, seen: false },
        { $set: { seen: true } }
      );

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      const updatedLastMessage = conversation.lastMessage.map((entry) =>
        entry.id.toString() === userId.toString()
          ? { ...entry, unseenMessagesCount: 0, seen: true }
          : entry
      );

      await Conversation.updateOne(
        { _id: conversationId },
        {
          $set: {
            updatedAt: new Date(),
            lastMessage: updatedLastMessage,
          },
        }
      );

      // Notify sender that receiver has read the messages 👇
      conversation.members.forEach((memberId) => {
        if (memberId.toString() !== userId.toString()) {
          const senderSocketId = onlineUsers.get(memberId.toString());
          if (senderSocketId) {
            io.to(senderSocketId).emit("messages seen", {
              conversationId,
              seenBy: userId, // receiver’s ID
            });
          }
        }
      });

      console.log(`✅ ${userId} marked conversation ${conversationId} as seen`);
    } catch (error) {
      console.error("❌ Error in markAsSeen:", error);
    }
  });

  socket.on("get messages", async (conversationId, callback) => {
    try {
      const messages = await Message.find({ conversationId })
        .sort({ createdAt: 1 })
        .lean();
      callback({ success: true, messages });
    } catch (error) {
      console.error("❌ Error fetching messages:", error);
      callback({ success: false, messages: [] });
    }
  });

  socket.on("disconnect", () => {
    for (let [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log("🔴 Disconnected user:", userId);
        break;
      }
    }
  });
});
