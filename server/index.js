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
    // socket.in(user._id).emit("message recieved", newMessageRecieved);
    console.log("newMessage:-", newMessageRecieved.text);
    console.log(recevier);
    let userId = newMessageRecieved.sender;
    // console.log("userID:-", userId);
    socket.to(recevier).emit("message received", newMessageRecieved);
  });
});
