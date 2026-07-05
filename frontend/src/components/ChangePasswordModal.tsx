import { useState } from "react";
import { api } from "../api";

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit =
    current.length > 0 && next.length >= 6 && confirm.length > 0 && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (next !== confirm) {
      setError("New passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setNotice("Password changed ✓");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Change password</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <form className="group-form" onSubmit={submit}>
          <input
            type="password"
            placeholder="Current password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            placeholder="New password (min 6 characters)"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && <div className="error-banner">{error}</div>}
          {notice && <div className="notice-banner">{notice}</div>}

          <button type="submit" className="primary-btn" disabled={!canSubmit}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
