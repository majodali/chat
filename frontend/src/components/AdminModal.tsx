import { useEffect, useState } from "react";
import { api } from "../api";
import type { PublicUser } from "../types";
import { Avatar } from "./Avatar";

function AdminUserRow({ u, isSelf }: { u: PublicUser; isSelf: boolean }) {
  const [resetting, setResetting] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api.adminResetPassword(u.userId, pw);
      setMsg({ ok: true, text: `New password set for ${u.displayName}` });
      setPw("");
      setResetting(false);
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Could not reset password",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="user-row-wrap">
      <div className="user-row">
        <Avatar name={u.displayName} size={32} />
        <span>{u.displayName}</span>
        {u.role === "admin" && <span className="badge">admin</span>}
        {!isSelf && !resetting && (
          <button
            className="text-btn row-action"
            onClick={() => {
              setResetting(true);
              setMsg(null);
            }}
          >
            Reset password
          </button>
        )}
      </div>
      {resetting && (
        <div className="reset-row">
          <input
            type="text"
            placeholder="New password (min 6)"
            value={pw}
            autoFocus
            onChange={(e) => setPw(e.target.value)}
          />
          <button
            className="primary-btn sm"
            disabled={busy || pw.length < 6}
            onClick={save}
          >
            {busy ? "…" : "Save"}
          </button>
          <button
            className="secondary-btn sm"
            onClick={() => {
              setResetting(false);
              setPw("");
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {msg && (
        <div className={msg.ok ? "notice-banner" : "error-banner"}>{msg.text}</div>
      )}
    </div>
  );
}

export function AdminModal({
  currentUserId,
  onClose,
  onOpenDiagnostics,
}: {
  currentUserId: string;
  onClose: () => void;
  onOpenDiagnostics: () => void;
}) {
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { users } = await api.listUsers();
    setUsers(users);
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { user } = await api.createUser({
        username: username.trim(),
        password,
        displayName: displayName.trim() || undefined,
        role,
      });
      setNotice(`Created account for ${user.displayName}`);
      setUsername("");
      setPassword("");
      setDisplayName("");
      setRole("member");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Admin · Accounts</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <button className="secondary-btn full-width" onClick={onOpenDiagnostics}>
          🔧 Open diagnostics
        </button>

        <form className="group-form" onSubmit={submit}>
          <p className="field-label">Create a new account</p>
          <input
            placeholder="Username (letters/numbers)"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            placeholder="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="role-row">
            <input
              type="checkbox"
              checked={role === "admin"}
              onChange={(e) => setRole(e.target.checked ? "admin" : "member")}
            />
            Make this person an admin
          </label>

          {error && <div className="error-banner">{error}</div>}
          {notice && <div className="notice-banner">{notice}</div>}

          <button
            type="submit"
            className="primary-btn"
            disabled={busy || !username.trim() || password.length < 6}
          >
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="field-label">Everyone ({users.length})</p>
        <div className="user-list">
          {users.map((u) => (
            <AdminUserRow
              key={u.userId}
              u={u}
              isSelf={u.userId === currentUserId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
