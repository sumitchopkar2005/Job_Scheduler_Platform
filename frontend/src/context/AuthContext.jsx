import React from "react";
import api from "../lib/api";

const AuthContext = React.createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = React.useState({
    ready: false,
    authenticated: false,
  });
  React.useEffect(() => {
    let active = true;
    const invalidate = () =>
      active && setState({ ready: true, authenticated: false });
    const token = localStorage.getItem("scheduler_token");
    if (!token) invalidate();
    else
      api
        .get("/auth/me")
        .then(() => active && setState({ ready: true, authenticated: true }))
        .catch(invalidate);
    window.addEventListener("scheduler:auth-invalid", invalidate);
    return () => {
      active = false;
      window.removeEventListener("scheduler:auth-invalid", invalidate);
    };
  }, []);
  const establish = (token) => {
    localStorage.setItem("scheduler_token", token);
    setState({ ready: true, authenticated: true });
  };
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* The local token must still be removed. */
    }
    localStorage.removeItem("scheduler_token");
    setState({ ready: true, authenticated: false });
  };
  return (
    <AuthContext.Provider value={{ ...state, establish, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => React.useContext(AuthContext);
