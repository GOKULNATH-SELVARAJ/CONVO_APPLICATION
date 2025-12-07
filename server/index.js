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
const axios = require("axios");

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

  socket.on("setup", (user) => {
    const userId = user?.userId?.toString();
    onlineUsers.set(userId, socket.id); // STORE SOCKET ID
    socket.join(userId); // Optional: join user's private room
    socket.emit("connected");
    console.log("🟢 User connected:", userId, socket.id);
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
    await User.findByIdAndUpdate(userId, { status: "online" }, { new: true });

    io.emit("userStatus", { userId, status: "online" });
  });

  socket.on("userOffline", async (userId) => {
    await User.findByIdAndUpdate(userId, { status: "offline" }, { new: true });

    io.emit("userStatus", { userId, status: "offline" });
  });

  socket.on("typing", ({ userId, receiverId }) => {
    const receiverSocketId = onlineUsers.get(receiverId);
    console.log("receiverSocketId in typing", receiverSocketId);

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

      const receiverDetails = await User.findById(sender);
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;
      const updatedLastMessage = conversation.members.map((memberId) => {
        const prev = conversation.lastMessage?.find(
          (m) => m.id.toString() === memberId.toString()
        );

        if (memberId.toString() === sender.toString()) {
          return {
            id: memberId,
            lastMessage: text,
            unseenMessagesCount: 0,
            seen: isReceiverInsideChat,
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
          lastMessageSentBy: sender,
        },
        { new: true }
      );
      const updatedSenderConversations = await Conversation.find({
        members: sender,
      })
        .sort({ lastMessageAt: -1 })
        .limit();
      const updatedRecevierConversations = await Conversation.find({
        members: receiverId,
      })
        .sort({ lastMessageAt: -1 })
        .limit();

      io.to(receiverSocketId).emit(
        "conversation updated",
        updatedRecevierConversations
      );
      const senderSocketId = onlineUsers.get(sender);
      io.to(senderSocketId).emit(
        "conversation updated",
        updatedSenderConversations
      );
      console.log("isReceiverInsideChat", receiverId);

      if (!isReceiverInsideChat) {
        try {
          await axios.post(
            `${process.env.BASE_URL}/api/users/send-notification`,
            {
              userId: receiverId,
              title: receiverDetails.username,
              body: text,
              data: {
                chatId: conversationId,
                senderId: sender,
                receiverId: receiverId,
                title: receiverDetails.username,
                body: text,
              },
            }
          );
        } catch (notifyErr) {
          console.log("❌ Failed to send notification:", notifyErr.message);
        }
      }
    } catch (error) {
      console.error("❌ Error in send message:", error);
    }
  });

  // socket.on("markAsSeen", async ({ conversationId, userId }) => {
  //   try {
  //     console.log("👁 markAsSeen event:", { conversationId, userId });

  //     // 1️⃣ Mark all unseen messages from the other user as seen
  //     await Message.updateMany(
  //       { conversationId, sender: { $ne: userId }, seen: false },
  //       { $set: { seen: true } }
  //     );

  //     // 2️⃣ Fetch the conversation
  //     const conversation = await Conversation.findById(conversationId);
  //     if (!conversation) return;

  //     // 3️⃣ Update lastMessage for the receiver (reset unseen count)
  //     const updatedLastMessage = conversation.lastMessage.map((entry) =>{

  //     }
  //       console.log("entry");

  //       entry.id.toString() === userId.toString()
  //         ? { ...entry, unseenMessagesCount: 0, seen: true }
  //         : entry
  //     );

  //     await Conversation.updateOne(
  //       { _id: conversationId },
  //       {
  //         $set: {
  //           updatedAt: new Date(),
  //           lastMessage: updatedLastMessage,
  //         },
  //       }
  //     );

  //     // 4️⃣ Find the OTHER user and notify them
  //     const otherUserId = conversation.members.find(
  //       (id) => id.toString() !== userId.toString()
  //     );

  //     const otherSocketId = onlineUsers.get(otherUserId.toString());
  //     console.log("🔁 Other user socket ID =", otherSocketId);

  //     // 5️⃣ Send updated conversation list to OTHER user
  //     const updatedReceiverConversations = await Conversation.find({
  //       members: otherUserId,
  //     })
  //       .sort({ lastMessageAt: -1 })
  //       .lean();

  //     io.emit("messages seen", {
  //       conversationId,
  //       seenBy: userId,
  //     });
  //     if (otherSocketId) {
  //       io.to(otherSocketId).emit(
  //         "conversation updated",
  //         updatedReceiverConversations
  //       );

  //       io.emit("messages seen", {
  //         conversationId,
  //         seenBy: userId,
  //       });

  //       console.log("📩 Seen event emitted to other user");
  //     } else {
  //       console.log("❌ Other user offline → no emit");
  //     }

  //     console.log(`✅ Seen updated for conversation ${conversationId}`);
  //   } catch (err) {
  //     console.error("❌ Error in markAsSeen:", err);
  //   }
  // });

  socket.on("markAsSeen", async ({ conversationId, userId, friendId }) => {
    console.log(
      "conversationId, userId, friendId",
      conversationId,
      userId,
      friendId
    );

    if (!userId || !conversationId) return;

    try {
      await Message.updateMany(
        { conversationId, seen: false },
        { $set: { seen: true } }
      );

      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      const updatedLastMessage = await Promise.all(
        conversation.members.map(async (memberId) => {
          // how many messages this member has not seen (sent by the OTHER user)
          const unseenCount = await Message.countDocuments({
            conversationId,
            sender: { $ne: memberId }, // messages from the other person
            seen: false,
          });

          // last message text in this conversation (latest by createdAt)
          const lastMsgDoc = await Message.findOne({ conversationId })
            .sort({ createdAt: -1 })
            .lean();

          return {
            id: memberId,
            lastMessage: lastMsgDoc ? lastMsgDoc.text : "",
            unseenMessagesCount: unseenCount,
            seen: unseenCount === 0,
          };
        })
      );

      console.log(
        "✅ updatedLastMessage in markAsSeen:",
        JSON.stringify(updatedLastMessage)
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

      const senderSocketId = onlineUsers.get(userId);
      const receiverSocketId = onlineUsers.get(friendId);
      console.log("onlineUsers", onlineUsers);
      console.log("receiverSocketId", receiverSocketId, senderSocketId);

      io.to(receiverSocketId).emit("messages seen", {
        conversationId,
        seenBy: userId,
      });

      const updatedSenderConversations = await Conversation.find({
        members: userId,
      })
        .sort({ lastMessageAt: -1 })
        .limit();

      io.to(senderSocketId).emit(
        "conversation updated",
        updatedSenderConversations
      );
      const updatedRecevierConversations = await Conversation.find({
        members: friendId,
      })
        .sort({ lastMessageAt: -1 })
        .limit();

      io.to(receiverSocketId).emit(
        "conversation updated",
        updatedRecevierConversations
      );
      // Notify sender that receiver has read the messages 👇
      conversation.members.forEach((memberId) => {
        if (memberId.toString() !== userId.toString()) {
          const senderSocketId = onlineUsers.get(memberId.toString());
          if (senderSocketId) {
            io.emit("messages seen", {
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
