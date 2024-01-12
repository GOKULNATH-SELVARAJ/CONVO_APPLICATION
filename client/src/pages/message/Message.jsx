import React, { useContext, useEffect, useState } from "react";
import axios from "axios";
import config from "../../apiUrl";
import "./Message.scss";
import Conversation from "../../components/conversation/conversation";
import Topbar from "../../components/topbar/topbar";
import Chat from "../../components/Chat/Chat";
import { AuthContext } from "../../context/AuthContext";

const Message = () => {
  const [conversation, setConversation] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    const getConversation = async (req, res) => {
      try {
        const response = await axios.get(
          `${config.apiUrl}conversation/` + user._id
        );
        setConversation(response.data);
      } catch (err) {
        console.log(err);
      }
    };
    getConversation();
  }, [user._id]);

  useEffect(() => {
    const getMessages = async () => {
      try {
        const res = await axios.get(
          `${config.apiUrl}message/` + currentChat?._id
        );
        setMessages(res.data);
      } catch (error) {
        console.log(error);
      }
    };
    getMessages();
  }, [currentChat]);

  return (
    <>
      <div>
        <Topbar />
      </div>
      <div className="message-Box">
        <div className="chat-Menu">
          <div className="chatMenu-Wrap">
            <input placeholder="Search" className="chat-Search" />
            {conversation.map((c) => (
              <div key={c._id} onClick={() => setCurrentChat(c)}>
                <Conversation key={c._id} conversation={c} currentUser={user} />
              </div>
            ))}
          </div>
        </div>
        <div className="chat-Box">
          <div className="chatBox-Wrap">
            {currentChat ? (
              <>
                <div className="chat-Box-top">
                  {messages.map((m) => {
                    <Chat message={m} own={m.sender === user._id} />;
                  })}
                </div>
                <div className="chat-Box-bottom">
                  <textarea
                    className="chat-Box-input"
                    placeholder="Type a message..."
                  />
                  <button className="chat-Box-btn">send</button>
                </div>
              </>
            ) : (
              <span className="noConversation">
                Open a Conversation to Start a chat...
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Message;
