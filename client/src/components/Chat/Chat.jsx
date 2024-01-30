import React from "react";
import "./Chat.scss";
import pic from "../../assets/profile.jpg";
import moment from "moment";

const Chat = ({ message, own }) => {
  return (
    <div className={own ? "chat own" : "chat"}>
      <div className="chat-top">
        <img className="chat-img" src={pic} alt="" />
        <div className="text">
          <p className="chat-text">{message.text}</p>
          <p className="chat-bottom">
            {moment(message.createdAt).format("hh:mm A")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Chat;
