const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const helmet = require("helmet");
const dotenv = require("dotenv");
dotenv.config();

const cors = require("cors");
const userRoutes = require("./routes/users");
const authRoutes = require("./routes/auth");
const conversationRoutes = require("./routes/conversation");
const messageRoutes = require("./routes/message");
const app = express();
const message = require("../server/models/message");
const Conversation = require("./models/Conversation");

mongoose.connect(process.env.MONGO_URL, {});

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

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log("Server in Running");
});

//Socket

const io = require("socket.io")(server, {
  cors: {
    origin: "https://convo-application-1.onrender.com",
  },
});
console.log("sockerttt",io)
io.on("connection", (socket) => {
  socket.on("setup", (userData) => {
    socket.join(userData._id);
    socket.emit("connected");
  });

  socket.on("join chat", (room) => {
    socket.join(room);
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
      const unseenCount = await message.countDocuments({
        conversationId,
        seen: false,
      });
      io.to(userId).emit("unseen count", {
        conversationId,
        count: unseenCount,
      });
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("message received", (newMessage) => {
    Conversation.updateOne(
      { _id: newMessage.conversationId },
      { $inc: { unseenMessagesCount: 1 } },
      (err, result) => {
        if (err) {
          console.error(err);
        } else {
          io.emit("conversation updated", {
            conversationId: newMessage.conversationId,
          });
        }
      }
    );

    io.to(newMessage.conversationId).emit("message received", newMessage);
  });
});
