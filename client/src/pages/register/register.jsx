import React, { useRef } from "react";
import "./register.scss";
import { useNavigate, useNavigation } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import { IoPerson } from "react-icons/io5";
import { MdEmail } from "react-icons/md";
import { FaLock } from "react-icons/fa6";
import axios from "axios";
import config from "../../apiUrl";

const Register = () => {
  const username = useRef();
  const email = useRef();
  const password = useRef();
  const confirmPassword = useRef();
  const navigation = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (confirmPassword.current.value !== password.current.value) {
      alert("Passwords do not match!");
    } else {
      const user = {
        username: username.current.value,
        email: email.current.value,
        password: password.current.value,
      };
      try {
        await axios.post(`${config.apiUrl}auth/register`, user);
        navigation("/login");
      } catch (err) {
        console.log(err.response.data.message);
      }
    }
  };

  const handleLogin = () => {
    window.location.href = "/login";
  };
  return (
    <div className="container-register">
      <form className="register-content" onSubmit={handleSubmit}>
        <div className="register-header">REGISTER</div>
        <div className="input">
          <IoPerson className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Name"
            type="text"
            name="name"
            required
            ref={username}
          />
        </div>
        <div className="input">
          <MdEmail className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Email"
            type="text"
            name="email"
            required
            ref={email}
          />
        </div>
        <div className="input">
          <FaLock className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Password"
            type="Password"
            name="Password"
            required
            ref={password}
            minLength={8}
          />
        </div>
        <div className="input">
          <FaLock className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Confirm Password"
            type="Password"
            name="Password"
            required
            ref={confirmPassword}
            minLength={8}
          />
        </div>
        <button type="submit" className="button">
          Register
        </button>
        <div className="OR">OR</div>
        <button className="log-in-to-button" onClick={handleLogin}>
          Log in to Account
        </button>
      </form>
    </div>
  );
};

export default Register;
