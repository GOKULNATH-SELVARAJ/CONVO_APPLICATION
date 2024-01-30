import { createContext, useEffect, useReducer } from "react";
import AuthReducer from "./AuthReducer";

const INTIAL_STATE = {
  user: null,
  isFetching: false,
  error: null,
};

export const AuthContext = createContext(INTIAL_STATE);

export const AuthContextProvider = ({ children }) => {
  const [state, dispatch] = useReducer(AuthReducer, INTIAL_STATE, () => {
    let user = localStorage.getItem("user");
    return user ? JSON.parse(user) : [];
  });
  useEffect(() => {
    localStorage.setItem("user", JSON.stringify(state));
  }, [state]);

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        isFetching: state.isFetching,
        error: state.error,
        dispatch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
