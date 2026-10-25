import { useCallback, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "../lib/api";
import { AuthContext } from "./useAuth";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [loginOpen, setLoginOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      setUser(await api("/api/auth/me"));
    } catch (err) {
      if (err.status === 401) clearToken();
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      ready,
      loginOpen,
      openLogin: () => setLoginOpen(true),
      closeLogin: () => setLoginOpen(false),
      // Called with the { token, user } payload the API returns.
      signIn: ({ token, user }) => {
        setToken(token);
        setUser(user);
        setReady(true);
        setLoginOpen(false);
      },
      signInWithToken: async (token) => {
        setToken(token);
        await refresh();
      },
      setUser,
      refresh,
      signOut: () => {
        clearToken();
        setUser(null);
      },
    }),
    [user, ready, loginOpen, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
