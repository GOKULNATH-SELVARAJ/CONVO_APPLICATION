import React, { useEffect, useState } from "react";
import "./conversation.scss";
import pic from "../../assets/profile.jpg";
import axios from "axios";
import config from "../../apiUrl";
const Conversation = ({ conversation,currentUser }) => {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const frientId = conversation.members.find((m) => m !== currentUser._id);

    const getUser = async () => {
      try {
        const res = await axios.get(`${config.apiUrl}users?userId=` + frientId);
        console.log(res)
        setUser(res.data);
        
      } catch (error) {
        console.log(error);
      }
    };
    getUser();
  }, [currentUser, conversation]);
  return (
    <div className="conversation">
      <img className="conversation-img" src={pic} alt="" />
      <span className="conversation-title">{user?.username}</span>
    </div>
  );
};

export default Conversation;
