import React from "react";
import "./Chat.scss";
import { format } from "timeago.js";
import pic from "../../assets/profile.jpg";
const Chat = ({ message, own }) => {
  return (
    <div className={own ? "chat own" : "chat"}>
      <div className="chat-top">
        <img className="chat-img" src={pic} alt="" />
        <p className="chat-text">{message.text}</p>
      </div>
      <div className="chat-bottom">{format(message.createdAt)}</div>
    </div>
  );
};

export default Chat;