import { useEffect, useState } from "react";
import { api, getToken, clearToken } from "./api";
import type { PublicUser } from "./types";
import { Login } from "./components/Login";
import { Chat } from "./components/Chat";

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await api.me();
        if (active) setUser(user);
      } catch {
        clearToken();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function handleLogout() {
    clearToken();
    setUser(null);
  }

  if (loading) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={setUser} />;
  }

  return <Chat user={user} onLogout={handleLogout} />;
}
