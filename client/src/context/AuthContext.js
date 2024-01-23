import { createContext, useEffect, useReducer } from "react";
import AuthReducer from "./AuthReducer";

const INTIAL_STATE = {
  user: null,
  // user:
  //  {
  //   "_id": {
  //     "$oid": "659d09c4846ed3597f348566"
  //   },
  //   "username": "gokul",
  //   "email": "gokul@gmail.com",
  //   "password": "$2b$10$ffjTUcD.OXZpElM9NZxgTus4oWrarXClhmIzdsKQuUJ7pmc4P5Wa.",
  //   "isAdmin": false,
  //   "createdAt": {
  //     "$date": "2024-01-09T08:54:28.099Z"
  //   },
  //   "updatedAt": {
  //     "$date": "2024-01-09T08:54:28.099Z"
  //   },
  //   "__v": 0
  // },
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
