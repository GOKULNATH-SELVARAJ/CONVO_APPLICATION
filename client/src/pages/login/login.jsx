import React from "react";
import "./login.scss";
import { MdEmail } from "react-icons/md";
import { FaLock } from "react-icons/fa6";

const Login = () => {
  return (
    <div className="container">
      <div className="login-content">
        <div className="login-header">LOGIN</div>
        <div className="input">
          <MdEmail className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Email"
            type="text"
            name="email"
            //   value={formdata.name}
            //   onChange={handleChange}
          />
        </div>
        <div className="input">
          <FaLock className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Password"
            type="Password"
            name="Password"
            //   value={formdata.email}
            //   onChange={handleChange}
          />
        </div>
        <div type="submit" className="button">
          Login
        </div>
      </div>
    </div>
  );
};

export default Login;
