import React, { useContext, useState } from "react";
import "./Modal.scss";
import axios from "axios";
import { AuthContext } from "../../context/AuthContext";
import config from "../../utils/apiUrl";
import { FaSearch } from "react-icons/fa";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ConversationModal = ({
  onClose,
  conversation,
  setCurrentChat,
  updateConversation,
}) => {
  const { user } = useContext(AuthContext);
  const [input, setInput] = useState("");
  const [users, setUsers] = useState([]);

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
      setUsers(result);
    } catch (error) {
      console.log(error);
    }
  };

  const handleChange = (value) => {
    setInput(value);
    getUsers(value);
  };

  const newConversation = async (selectedUser) => {
    try {
      const existingConversation = getExistingConversation(selectedUser);
      if (existingConversation) {
        toast.error("The user already exists in your Chat!");
      } else {
        await axios.post(`${config.apiUrl}conversation`, {
          senderId: user._id,
          receiverId: selectedUser._id,
        });
        onClose();
        updateConversation();
      }
    } catch (error) {
      console.error("Error creating or fetching conversation:", error);
    }
  };

  const getExistingConversation = (selectedUser) => {
    return conversation.find(
      (c) =>
        c.members.includes(user._id) && c.members.includes(selectedUser._id)
    );
  };

  return (
    <div className="Modal-container">
      <div className="Modal">
        <h2>New Chat</h2>
        <div className="User-search">
          <FaSearch className="Search-icon" />
          <input
            placeholder="Search by name..."
            className="User-search-box"
            value={input}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>
        <div className="User-list">
          {users.map((uname) => (
            <div
              key={uname._id}
              className="User-name"
              onClick={() => newConversation(uname)}
            >
              {uname.username}
            </div>
          ))}
        </div>
        <div className="button">
          <button onClick={onClose} className="Modal-button">
            Close Modal
          </button>
        </div>
      </div>
      <ToastContainer theme="dark" closeOnClick position="bottom-right" />
    </div>
  );
};

export default ConversationModal;
