import axios from "axios";
import config from "./apiUrl";

export const LoginCall = async (userCredential, dispatch) => {
  dispatch({ type: "LOGIN_START" });
  try {
    const res = await axios.post(`${config.apiUrl}auth/login`, userCredential);
    dispatch({ type: "LOGIN_SUCCESS", payload: res.data });
  } catch (error) {
    console.error("Login error:", error);
    dispatch({ type: "LOGIN_FAILURE", payload: error });
  }
};
