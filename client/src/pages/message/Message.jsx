import React, { useContext, useEffect, useRef, useState } from "react";
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
  const [newMessages, setNewMessages] = useState("");
  const { user } = useContext(AuthContext);
  const scrollRef = useRef();

  const handleSend = async (e) => {
    e.preventDefault();
    const message = {
      conversationId: currentChat._id,
      sender: user._id,
      text: newMessages,
    };
    try {
      const res = await axios.post(`${config.apiUrl}message`, message);
      setMessages([...messages, res.data]);
      setNewMessages("");
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    const getConversation = async () => {
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    scrollRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages]);

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
                  {messages.map((m) => (
                    <div ref={scrollRef}>
                      {" "}
                      <Chat message={m} own={m.sender === user._id} />
                    </div>
                  ))}
                </div>
                <div className="chat-Box-bottom">
                  <textarea
                    className="chat-Box-input"
                    placeholder="Type a message..."
                    onChange={(e) => setNewMessages(e.target.value)}
                    value={newMessages}
                  />
                  <button className="chat-Box-btn" onClick={handleSend}>
                    send
                  </button>
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
