import React, { useContext, useRef } from "react";
import "./login.scss";
import { MdEmail } from "react-icons/md";
import { FaLock } from "react-icons/fa6";
import { LoginCall } from "../../utils/apiCall";
import { AuthContext } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

const Login = () => {
  const email = useRef();
  const password = useRef();
  const {  dispatch } = useContext(AuthContext);
  const navigation = useNavigate();

  const handleRegister = () => {
    navigation("/register");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    LoginCall(
      { email: email.current.value, password: password.current.value },
      dispatch
    );
    navigation("/");
  };

  return (
    <div className="container-login">
      <form className="login-content" onSubmit={handleSubmit}>
        <div className="login-header">LOGIN</div>
        <div className="input">
          <MdEmail className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Email"
            type="email"
            name="email"
            ref={email}
            required
          />
        </div>
        <div className="input">
          <FaLock className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Password"
            type="Password"
            ref={password}
            required
            minLength={8}
          />
        </div>
        <button type="submit" className="login-button">
          LOGIN
        </button>
        <div className="OR">OR</div>
        <button className="register-button" onClick={handleRegister}>
          REGISTER
        </button>
      </form>
    </div>
  );
};

export default Login;
