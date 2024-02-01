const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const helmet = require("helmet");
const dotenv = require("dotenv");
const cors = require("cors");
const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");
const conversationRoutes = require("./routes/conversation");
const messageRoutes = require("./routes/message");
const app = express();
const message = require("../server/models/message");
const Conversation = require("./models/Conversation");

mongoose.connect("mongodb://localhost:27017/chat", {});

const connection = mongoose.connection;
connection.once("open", () => {
  console.log("MongoDB database connection established successfully");
});

dotenv.config();

//middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));
// app.use(morgan("common"));
// app.use(helmet());

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/conversation", conversationRoutes);
app.use("/api/message", messageRoutes);

const server = app.listen(8080, () => {
  console.log("Server in Running");
});

//Socket

const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:3000",
  },
});

io.on("connection", (socket) => {
  console.log("A user Connected:-", socket.id);

  socket.on("setup", (userData) => {
    socket.join(userData._id);
    console.log("User Data:- ", userData);
    socket.emit("connected");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
    console.log(`User joined this room ${room}`);
  });

  socket.on("send message", (newMessageRecieved, recevier) => {
    const updatedMessage = { ...newMessageRecieved, seen: false };
    socket.to(recevier).emit("message received", updatedMessage);

    // Also, emit the unseen count to the sender
    io.to(socket.id).emit("unseen count", {
      conversationId: newMessageRecieved.conversationId,
      count: 1,
    });
  });

  socket.on("markAsSeen", async ({ conversationId, userId }) => {
    try {
      await message.updateMany(
        { conversationId: conversationId, seen: false },
        { $set: { seen: true } }
      );
      await Conversation.updateOne(
        { _id: conversationId },
        { $set: { "lastMessageAt.seen": true } }
      );
      const unseenCount = await message.countDocuments({ conversationId, seen: false });
      io.to(userId).emit("unseen count", { conversationId, count: unseenCount });
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("message received", (newMessage) => {
    // Update the unseen messages count in the conversation
    Conversation.updateOne(
      { _id: newMessage.conversationId },
      { $inc: { unseenMessagesCount: 1 } },
      (err, result) => {
        if (err) {
          console.error(err);
        } else {
          // Broadcast the updated conversation to all clients
          io.emit("conversation updated", {
            conversationId: newMessage.conversationId,
          });
        }
      }
    );

    // Broadcast the new message to the conversation
    io.to(newMessage.conversationId).emit("message received", newMessage);
  });
});
