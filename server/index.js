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
app.use(morgan("common"));
app.use(helmet());

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/conversation", conversationRoutes);
app.use("/api/message", messageRoutes);
 
app.listen(8080, () => {
  console.log("Server in Running");
});
