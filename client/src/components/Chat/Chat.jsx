import React from "react";
import "./Chat.scss";
import pic from "../../assets/profile.jpg";
const Chat = ({ own }) => {
  return (
    <div className={own ? "chat own" :"chat"}>
      <div className="chat-top">
        <img className="chat-img" src={pic} alt="" />
        <p className="chat-text">
          This is a basic example, and you may need to modify it based on your
          specific requirements.
        </p>
      </div>
      <div className="chat-bottom">1 hour ago</div>
    </div>
  );
};

export default Chat;
