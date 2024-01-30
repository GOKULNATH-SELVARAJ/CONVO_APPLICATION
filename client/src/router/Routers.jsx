import React, { useContext } from "react";
import { Route, Routes, Navigate } from "react-router-dom";

import Login from "../pages/login/login";
import Register from "../pages/register/register";
import Message from "../pages/message/Message";
import { AuthContext } from "../context/AuthContext";
import Profile from "../pages/Profile/Profile";

function Routers() {
  const { user } = useContext(AuthContext);
  return (
    <Routes>
      <Route
        exact
        path="/"
        element={user ? <Message /> : <Navigate to="/login" />}
      />

      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />

      <Route
        path="/register"
        element={user ? <Navigate to="/" /> : <Register />}
      />
      <Route
        path="/profile"
        element={user ? <Profile /> : <Navigate to="/login" />}
      />
    </Routes>
  );
}

export default Routers;
