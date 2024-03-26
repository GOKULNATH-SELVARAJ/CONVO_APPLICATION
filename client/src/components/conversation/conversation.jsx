import React, { useEffect, useState } from "react";
import "./conversation.scss";
import pic from "../../assets/profile.jpg";
import axios from "axios";
import { BiCheckDouble } from "react-icons/bi";
import config from "../../utils/apiUrl";
import { getTimeAndDate, getProfile } from "../../utils/function";

const Conversation = ({ conversation, currentUser, message }) => {
  const [user, setUser] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);

  const truncateMessage = (text, maxLength) => {
    const words = text.split(" ");
    const truncated = words.slice(0, maxLength).join(" ");
    return words.length > maxLength ? `${truncated} ...` : truncated;
  };

  const getUser = async () => {
    try {
      const friendId = conversation.members.find((m) => m !== currentUser._id);
      const res = await axios.get(`${config.apiUrl}users?userId=${friendId}`);
      setUser(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  const getLastMessage = async () => {
    try {
      const res = await axios.get(
        `${config.apiUrl}message/last/${conversation._id}`
      );
      setLastMessage(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  const fetchProfile = async () => {
    try {
      const image = await getProfile(user._id);
      setProfilePic(image);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  useEffect(() => {
    getUser();
    getLastMessage();
    // const intervalId = setInterval(() => {
    //   getLastMessage();
    // }, 1000);
    // return () => clearInterval(intervalId);
  }, [currentUser, conversation]);

  return (
    <div className="conversation">
      <img
        className="conversation-img"
        src={profilePic ? `http://localhost:8080/${profilePic}` : pic}
        alt=""
      />
      <div className="conversation-wrapper">
        <div className="conversation-text">
          <span className="conversation-title">{user?.username}</span>
          <p className="conversation-time">
            {lastMessage && getTimeAndDate(lastMessage.date)}
          </p>
        </div>
        <div className="lastMessage-container">
          {lastMessage && (
            <>
              {lastMessage.sender === currentUser._id ? (
                <BiCheckDouble
                  size={20}
                  color={lastMessage.seen ? "	#00008B" : "grey"}
                />
              ) : (
                ""
              )}
              <p className="lastMessage" style={{ color: lastMessage.seen ? "grey" : "red" , fontWeight:lastMessage.seen ?"":"bold"}}>
                {truncateMessage(lastMessage.text, 4)}
              </p>
              {/* <p className="messageCount">2</p> */}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Conversation;
