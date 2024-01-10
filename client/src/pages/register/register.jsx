import React from "react";
import "./register.scss";
import { IoPerson } from "react-icons/io5";
import { MdEmail } from "react-icons/md";
import { FaLock } from "react-icons/fa6";

const Register = () => {
  const handleLogin = () =>{
    window.location.href='/login'
  }
  return (
    <div className="container-register">
      <div className="register-content">
        <div className="register-header">REGISTER</div>
        <div className="input">
          <IoPerson className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Name"
            type="text"
            name="name"
           
          />
        </div>
        <div className="input">
          <MdEmail className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Email"
            type="text"
            name="email"
           
          />
        </div>
        <div className="input">
          <FaLock className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Password"
            type="Password"
            name="Password"
           
          />
        </div>
        <div className="input">
          <FaLock className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Confirm Password"
            type="Password"
            name="Password"
            
          />
        </div>
        <div type="submit" className="button">
          Register
        </div>
        <div className="OR">OR</div>
        <button className="log-in-to-button" onClick={handleLogin}>
          Log in to Account
        </button>
      </div>
    </div>
  );
};

export default Register;
