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
    if (userData?._id) {
      onlineUsers.set(userData._id, socket.id);
      socket.join(userData._id);
      console.log(`✅ User joined personal room: ${userData._id}`);
      socket.emit("connected");
    }
  });

  socket.on("join chat", (roomId) => {
    socket.join(roomId);
    console.log(`🔗 Joined room: ${roomId}`);
  });

  socket.on("send message", async (newMessage, receiverId) => {
    try {
      const clientsInRoom = io.sockets.adapter.rooms.get(
        newMessage.conversationId
      );

      const receiverSocketId = onlineUsers.get(receiverId);
      const isReceiverInRoom = clientsInRoom?.has(receiverSocketId);

      const messageWithSeenFlag = {
        ...newMessage,
        seen: isReceiverInRoom ? true : false,
      };

      if (receiverSocketId) {
        io.to(receiverSocketId).emit("message received", messageWithSeenFlag);
        io.to(receiverSocketId).emit("conversation updated", {
          conversationId: newMessage.conversationId,
        });
      }

      io.to(newMessage.sender).emit("conversation updated", {
        conversationId: newMessage.conversationId,
      });

      const conversation = await Conversation.findById(
        newMessage.conversationId
      );
      if (!conversation) return;
      console.log("newMessage.sender", newMessage.sender);

      const updatedLastMessage = conversation.members.map((memberId) => ({
        id: memberId,
        lastMessage: newMessage.text,
        unseenMessagesCount:
          memberId === newMessage.sender ? 0 : isReceiverInRoom ? 0 : 1,
        seen: isReceiverInRoom
          ? isReceiverInRoom
          : memberId !== newMessage.sender,
      }));
      console.log("updatedLastMessage", updatedLastMessage);

      await Conversation.findByIdAndUpdate(
        newMessage.conversationId,
        {
          lastMessage: updatedLastMessage,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        },
        { new: true }
      );

      console.log(`✅ Updated conversation. Seen: ${isReceiverInRoom}`);
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

      const updatedLastMessage = conversation.lastMessage.map((entry) => {
        if (entry.id === userId) {
          return {
            ...entry.toObject(),
            unseenMessagesCount: 0,
            seen: true,
          };
        } else {
          return {
            ...entry.toObject(),
            seen: false,
          };
        }
      });

      await Conversation.updateOne(
        { _id: conversationId },
        {
          $set: {
            updatedAt: new Date(),
            lastMessage: updatedLastMessage,
          },
        }
      );

      io.to(userId).emit("unseen count", {
        conversationId,
        count: 0,
      });
    } catch (error) {
      console.error("❌ Error in markAsSeen:", error);
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
