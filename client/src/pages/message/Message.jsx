import React, { useContext, useEffect, useRef, useState } from "react";
import axios from "axios";
import config from "../../utils/apiUrl";
import "./Message.scss";
import Conversation from "../../components/conversation/conversation";
import Topbar from "../../components/topbar/topbar";
import Chat from "../../components/Chat/Chat";
import { AuthContext } from "../../context/AuthContext";
import { io } from "socket.io-client";
import { MdPersonAddAlt1 } from "react-icons/md";
import { BsFillSendFill } from "react-icons/bs";
import { FaSearch } from "react-icons/fa";
import ConversationModal from "../../components/ConvoModal/Modal";

const ENDPOINT = "http://localhost:8080";
var socket;

const Message = () => {
  const [conversation, setConversation] = useState([]);
  const [currentChat, setCurrentChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessages, setNewMessages] = useState("");
  const [input, setInput] = useState("");
  const [chatUser, setChatUser] = useState([]);
  const { user } = useContext(AuthContext);
  const [socketConnected, setSocketConnected] = useState(false);
  const scrollRef = useRef();
  const [showModal, setShowModal] = useState(false);

  const handleOpenModal = () => {
    setShowModal(true);
  };

  const handleCloseModel = () => {
    setShowModal(false);
  };
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
      return response.data;
    } catch (err) {
      console.log(err);
      return [];
    }
  };

  useEffect(() => {
    getConversation();
  }, [user._id]);

  const updateConversation = async () => {
    try {
      const updatedConversations = await getConversation();
      setConversation(updatedConversations);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    const getMessages = async () => {
      try {
        const res = await axios.get(
          `${config.apiUrl}message/` + currentChat?._id
        );
        setMessages(res.data);
        // const receiverId = currentChat.members.find((m) => m !== user._id);
        // const receiverInfo = await axios.get(
        //   `${config.apiUrl}users?userId=${receiverId}`
        // );
        // setReceiverName(receiverInfo.data.username)
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

  const getUsers = async (value) => {
    try {
      const result = (await axios.get(`${config.apiUrl}users/all`)).data.filter(
        (user) => {
          return (
            value &&
            user?.username &&
            user.username.toLowerCase().includes(value.toLowerCase())
          );
        }
      );
      setChatUser(result);
    } catch (error) {
      console.log(error);
    }
  };

  const handleSearch = (value) => {
    setInput(value);
    getUsers(value);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const message = {
      sender: user._id,
      text: newMessages,
      conversationId: currentChat._id,
    };
    const recevierId = currentChat.members.find((m) => m !== user._id);

    try {
      const res = await axios.post(`${config.apiUrl}message`, message);
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
             <div className="searchuser">
             <FaSearch className="Search-icon" />
              <input
                placeholder="Search..."
                className="chat-Search"
                value={input}
                onChange={(e) => handleSearch(e.target.value)}
              />
             </div>
              <MdPersonAddAlt1 size={35} onClick={handleOpenModal} />
            </div>
            <div className="User-list">
              {chatUser.map((uname) => (
                <div
                  key={uname._id}
                  className="User-name"
                  // onClick={() => newConversation(uname)}
                >
                  {uname.username}
                </div>
              ))}
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
                {/* <div className="usernameofrecevier">{receiverName}</div> */}
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
                    <BsFillSendFill size={25} />
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
      {showModal && (
        <ConversationModal
          onClose={handleCloseModel}
          conversation={conversation}
          setCurrentChat={setCurrentChat}
          updateConversation={updateConversation}
        />
      )}
    </>
  );
};

export default Message;
