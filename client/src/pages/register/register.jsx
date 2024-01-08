import React from "react";
import "./register.scss";
import { IoPerson } from "react-icons/io5";
import { MdEmail } from "react-icons/md";
import { FaLock } from "react-icons/fa6";

const Register = () => {
  return (
    <div className="container">
      <div className="login-content">
        <div className="login-header">REGISTER</div>
        <div className="input">
          <IoPerson className="icon" size={25} />
          <input
            className="inputfield"
            placeholder="Name"
            type="text"
            name="name"
            //   value={formdata.name}
            //   onChange={handleChange}
          />
        </div>
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
          Register
        </div>
      </div>
    </div>
  );
};

export default Register;
