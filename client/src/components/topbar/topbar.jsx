import React, { useContext, useEffect, useState } from "react";
import pic from "../../assets/Avatar.png";
import { AuthContext } from "../../context/AuthContext";
import { MdLogout } from "react-icons/md";
import "./topbar.scss";
import { getProfile } from "../../utils/function";
import { Navigate, useNavigate, useNavigation } from "react-router-dom";

const Topbar = () => {
  const { user, dispatch } = useContext(AuthContext);
  const [profilePic, setProfilePic] = useState("");
  const navigation = useNavigate();
  const fetchProfile = async () => {
    try {
      const res = await getProfile(user.user._id);
      setProfilePic(res);
    } catch (error) {
      console.log(error);
    }
  };
  const handleLogout = () => {
    dispatch({ type: "LOGOUT" });
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  useEffect(() => {
    fetchProfile();
  }, [user.user._id]);

  const handleProfile = () => {
    navigation("/profile");
  };

  return (
    <div className="topbar-container">
      <div className="topbar-left">
        <span className="logo">Hi {user.user.username}</span>
      </div>
      <div className="topbar-right">
        <img
          src={profilePic ? `http://localhost:8080/${profilePic}` : pic}
          alt=""
          className="topbar-img"
          onClick={handleProfile}
        />
        <span className="logout" onClick={handleLogout}>
          <MdLogout size={50} color="white" />
        </span>
      </div>
    </div>
  );
};

export default Topbar;
