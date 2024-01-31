import React, { useContext, useEffect, useState } from "react";
import "./Chat.scss";
import pic from "../../assets/profile.jpg";
import moment from "moment";
import { AuthContext } from "../../context/AuthContext";
import { getProfile } from "../../utils/function";

const Chat = ({ message, own, currentChat }) => {
  const { user } = useContext(AuthContext);
  const [profilePic, setProfilePic] = useState(null);
  const [userProfilePic, setUserProfilePic] = useState(null);
  const picture = own
    ? userProfilePic
      ? `http://localhost:8080/${userProfilePic}`
      : pic
    : profilePic
    ? `http://localhost:8080/${profilePic}`
    : pic;
  const fetchProfile = async () => {
    try {
      const friendId = currentChat.members.find((m) => m !== user._id);
      const loggedUserId = currentChat.members.find((m) => m == user._id);
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

  return (
    <div className={own ? "chat own" : "chat"}>
      <div className="chat-top">
        <img className="chat-img" src={picture} alt="" />
        <div className="text">
          <p className={own ? "chat-text-own" : "chat-text"}>{message.text}</p>
          <p className="chat-bottom">
            {moment(message.createdAt).format("hh:mm A")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Chat;
