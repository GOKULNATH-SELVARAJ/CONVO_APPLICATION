import React from "react";
import pic from "../../assets/background.jpg";
import "./topbar.scss";

const Topbar = () => {
  return (
    <div className="topbar-container">
      <div className="topbar-left">
        <span className="logo">Hi Gokul</span>
      </div>
      <div className="topbar-right">
        <span className="logo">Logout</span>
        <img src={pic} alt="" className="topbar-img" />
      </div>
    </div>
  );
};

export default Topbar;
