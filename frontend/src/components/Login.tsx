import { useState } from "react";
import { api, setToken } from "../api";
import type { PublicUser } from "../types";

export function Login({ onLogin }: { onLogin: (u: PublicUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { token, user } = await api.login(username.trim(), password);
      setToken(token);
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">💬</div>
        <h1>Liddle Chat</h1>
        <p className="login-sub">Sign in to start chatting</p>

        <label>
          Username
          <input
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="your password"
          />
        </label>

        {error && <div className="error-banner">{error}</div>}

        <button type="submit" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="login-hint">
          No account? Ask a grown-up to make one for you.
        </p>
      </form>
    </div>
  );
}
