import React from "react";
import pic from "../../assets/Avatar.jpg"
const Profile = () => {
  return (
    <div className="profile-container">
      <div className="profile-text">Profile</div>
      <div className="profile-image">
        <img src={pic} alt="" />
      </div>
    </div>
  );
};

export default Profile;
