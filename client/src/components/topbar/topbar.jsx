import React, { useContext } from "react";
import pic from "../../assets/Avatar.png";
import { AuthContext } from "../../context/AuthContext";
import { MdLogout } from "react-icons/md";
import "./topbar.scss";

const Topbar = () => {
  const { user, dispatch } = useContext(AuthContext);

  const handleLogout = () => {
    dispatch({ type: "LOGOUT" });
    localStorage.removeItem("user");
    window.location.href = "/login";
  };
  return (
    <div className="topbar-container">
      <div className="topbar-left">
        <span className="logo">Hi {user.username}</span>
      </div>
      <div className="topbar-right">
        <img src={pic} alt="" className="topbar-img" />
        <span className="logout" onClick={handleLogout}>
          <MdLogout size={50} color="white" />
        </span>
      </div>
    </div>
  );
};

export default Topbar;
