import React, { useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import config from "../../apiUrl";
import "./Message.scss";
import Conversation from "../../components/conversation/conversation";
import Topbar from "../../components/topbar/topbar";
import Chat from "../../components/Chat/Chat";
import { AuthContext } from "../../context/AuthContext";
import { io } from "socket.io-client";
import { MdPersonAddAlt1 } from "react-icons/md";

const ENDPOINT = "http://localhost:8080";
var socket;

const Message = () => {
  const [conversation, setConversation] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessages, setNewMessages] = useState("");
  const { user } = useContext(AuthContext);
  const [setSocketConnected] = useState(false);
  const scrollRef = useRef();

  useEffect(() => {
    socket = io(ENDPOINT);
    socket.emit("setup", user);
    socket.on("connection", () => {
      setSocketConnected(true);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const getConversation = async () => {
      try {
        const response = await axios.get(
          `${config.apiUrl}conversation/` + user._id
        );
        setConversation(response.data);
        console.log(
          "conversation:-",
          response.data.map((c) => c.members)
        );
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
        // console.log("message res", res.data);
        console.log(
          "currenct chtat:- ",
          currentChat.members,
          "user:-",
          user._id
        );
        socket.emit("join chat", currentChat?._id);
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
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    // Listen for new messages in the chat room
    socket.on("message received", (newMessage) => {
      // Update the state to include the new message
      setMessages((prevMessages) => [...prevMessages, newMessage]);
    });

    return () => {
      // Cleanup the event listener when the component unmounts
      socket.off("message received");
    };
  }, [currentChat]);

  const handleSend = async (e) => {
    e.preventDefault();
    const message = {
      sender: user._id,
      text: newMessages,
      conversationId: currentChat._id,
    };
    // console.log("first", currentChat);
    const recevierId = currentChat.members.find((m) => m !== user._id);
    console.log("recevier:-", recevierId);

    try {
      const res = await axios.post(`${config.apiUrl}message`, message);
      console.log("message:-", res.data);
      socket.emit("send message", res.data, recevierId);
      setMessages([...messages, res.data]);
      setNewMessages("");
    } catch (error) {
      console.log(error);
    }
  };

  return (
    <>
      <div>
        <Topbar />
      </div>
      <div className="message-Box">
        <div className="chat-Menu">
          <div className="chatMenu-Wrap">
            <div className="chat-search-and-add">
              <input placeholder="Search..." className="chat-Search" />
              <MdPersonAddAlt1 size={35} onClick={() => console.log(" ")} />
            </div>
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
                    <div ref={scrollRef} key={m._id}>
                      <Chat
                        key={m._id}
                        message={m}
                        own={m.sender === user._id}
                      />
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
