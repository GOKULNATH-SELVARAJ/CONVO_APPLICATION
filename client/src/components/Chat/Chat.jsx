import React, { useContext, useEffect, useState } from "react";
import "./Chat.scss";
import pic from "../../assets/profile.jpg";
import moment from "moment";
import { BiCheckDouble } from "react-icons/bi";
import { AuthContext } from "../../context/AuthContext";
import { getProfile } from "../../utils/function";
import axios from "axios";
import config from "../../utils/apiUrl";

const Chat = ({ message, own, currentChat }) => {
  console.log("messages",message)
  console.log("currentChat",currentChat)

  const { user } = useContext(AuthContext);
  const [profilePic, setProfilePic] = useState(null);
  const [userProfilePic, setUserProfilePic] = useState(null);
  const [lastMessage, setLastMessage] = useState(message);
console.log("lasttttttt",lastMessage)
  const picture = own
    ? userProfilePic
      ? `http://localhost:8080/${userProfilePic}`
      : pic
    : profilePic
    ? `http://localhost:8080/${profilePic}`
    : pic;
  const fetchProfile = async () => {
    try {
      const friendId = currentChat.members.find((m) => m !== user?.user?._id);
      const loggedUserId = currentChat.members.find((m) => m === user?.user?._id);
      const image = await getProfile(friendId);
      setProfilePic(image);
      const userImage = await getProfile(loggedUserId);
      setUserProfilePic(userImage);
    } catch (error) {
      console.log(error);
    }
  };
  useEffect(() => {
    fetchProfile();
  }, []);

  // const getLastMessage = async () => {
  //   try {
  //     const res = await axios.get(
  //       `${config.apiUrl}message/last/${conversation._id}`
  //     );
  //     setLastMessage(res.data);
  //   } catch (error) {
  //     console.log(error);
  //   }
  // };

  // useEffect(() => {
  //   getLastMessage();
  //   const intervalId = setInterval(() => {
  //     getLastMessage();
  //   }, 2000);
  //   return () => clearInterval(intervalId);
  // }, [currentUser, conversation]);

  

  return (
    <div className={own ? "chat own" : "chat"}>
      <div className="chat-top">
        <img className="chat-img" src={picture} alt="" />
        <div className="text">
          <div className={own ? "chat-text-own" : "chat-text"}>
            <p>{message.text} </p>
            <p className="chat-time">
              {moment(message.createdAt).format("hh:mm A")}
              {own ? (
                <BiCheckDouble
                  size={20}
                  color={message.seen ? "#00008B" : "grey"}
                />
              ) : (
                ""
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
