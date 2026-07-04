import { useState } from "react";
import type { PublicUser } from "../types";
import { Avatar } from "./Avatar";

export function NewChatModal({
  users,
  onClose,
  onStartDm,
  onCreateGroup,
}: {
  users: PublicUser[];
  onClose: () => void;
  onStartDm: (user: PublicUser) => void;
  onCreateGroup: (name: string, memberIds: string[]) => void;
}) {
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [groupName, setGroupName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submitGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupName.trim() || selected.size === 0) return;
    setBusy(true);
    try {
      await onCreateGroup(groupName.trim(), [...selected]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>New chat</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </header>

        <div className="tabs">
          <button
            className={tab === "dm" ? "tab active" : "tab"}
            onClick={() => setTab("dm")}
          >
            Direct
          </button>
          <button
            className={tab === "group" ? "tab active" : "tab"}
            onClick={() => setTab("group")}
          >
            Group
          </button>
        </div>

        {tab === "dm" ? (
          <div className="user-list">
            {users.length === 0 && (
              <p className="empty-hint">No one else here yet.</p>
            )}
            {users.map((u) => (
              <button
                key={u.userId}
                className="user-row"
                onClick={() => onStartDm(u)}
              >
                <Avatar name={u.displayName} size={36} />
                <span>{u.displayName}</span>
              </button>
            ))}
          </div>
        ) : (
          <form className="group-form" onSubmit={submitGroup}>
            <input
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              autoFocus
            />
            <p className="field-label">Add members</p>
            <div className="user-list">
              {users.map((u) => (
                <label key={u.userId} className="user-row check">
                  <input
                    type="checkbox"
                    checked={selected.has(u.userId)}
                    onChange={() => toggle(u.userId)}
                  />
                  <Avatar name={u.displayName} size={32} />
                  <span>{u.displayName}</span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              className="primary-btn"
              disabled={busy || !groupName.trim() || selected.size === 0}
            >
              {busy ? "Creating…" : "Create group"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
