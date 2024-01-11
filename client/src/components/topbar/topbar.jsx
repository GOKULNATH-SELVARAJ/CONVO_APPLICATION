import React, { useContext } from "react";
import pic from "../../assets/Avatar.png";
import { AuthContext } from "../../context/AuthContext";
import "./topbar.scss";

const Topbar = () => {
  const { user } = useContext(AuthContext);
  return (
    <div className="topbar-container">
      <div className="topbar-left">
        <span className="logo">Hi {user.username}</span>
      </div>
      <div className="topbar-right">
        <span className="logo">Logout</span>
        <img src={pic} alt="" className="topbar-img" />
      </div>
    </div>
  );
};

export default Topbar;
