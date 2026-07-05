import type { PublicUser, Room } from "../types";
import { roomDisplayName, otherMember } from "../utils";
import { Avatar } from "./Avatar";

export function Sidebar({
  user,
  rooms,
  activeRoomId,
  online,
  unread,
  open,
  connected,
  notifPermission,
  soundOn,
  onEnableNotifications,
  onToggleSound,
  onSelectRoom,
  onNewChat,
  onOpenAdmin,
  onLogout,
}: {
  user: PublicUser;
  rooms: Room[];
  activeRoomId: string | null;
  online: Set<string>;
  unread: Record<string, number>;
  open: boolean;
  connected: boolean;
  notifPermission: NotificationPermission;
  soundOn: boolean;
  onEnableNotifications: () => void;
  onToggleSound: () => void;
  onSelectRoom: (roomId: string) => void;
  onNewChat: () => void;
  onOpenAdmin: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className={`sidebar ${open ? "open" : "closed"}`}>
      <header className="sidebar-head">
        <div className="brand">
          💬 Liddle Chat
          <span
            className={`conn-dot ${connected ? "up" : "down"}`}
            title={connected ? "Connected" : "Reconnecting…"}
          />
        </div>
        <div className="head-actions">
          <button
            className="icon-btn"
            title={soundOn ? "Mute sound" : "Unmute sound"}
            onClick={onToggleSound}
          >
            {soundOn ? "🔔" : "🔇"}
          </button>
          <button className="icon-btn" title="New chat" onClick={onNewChat}>
            ＋
          </button>
        </div>
      </header>

      {notifPermission === "default" && (
        <button className="notif-banner" onClick={onEnableNotifications}>
          🔔 Turn on notifications
        </button>
      )}

      <div className="room-list">
        {rooms.length === 0 && (
          <p className="empty-hint">No chats yet. Tap ＋ to start one!</p>
        )}
        {rooms.map((room) => {
          const other = room.type === "dm" ? otherMember(room, user.userId) : null;
          const isOnline = other ? online.has(other.userId) : undefined;
          const count = unread[room.roomId] ?? 0;
          return (
            <button
              key={room.roomId}
              className={`room-item ${room.roomId === activeRoomId ? "active" : ""}`}
              onClick={() => onSelectRoom(room.roomId)}
            >
              <Avatar
                name={roomDisplayName(room, user.userId)}
                online={room.type === "dm" ? isOnline : undefined}
              />
              <div className="room-meta">
                <span className="room-name">
                  {roomDisplayName(room, user.userId)}
                </span>
                <span className="room-sub">
                  {room.type === "group"
                    ? `${room.members.length} members`
                    : isOnline
                      ? "online"
                      : "offline"}
                </span>
              </div>
              {count > 0 && (
                <span className="unread-badge">{count > 99 ? "99+" : count}</span>
              )}
            </button>
          );
        })}
      </div>

      <footer className="sidebar-foot">
        <Avatar name={user.displayName} size={32} />
        <span className="me-name">{user.displayName}</span>
        {user.role === "admin" && (
          <button className="text-btn" onClick={onOpenAdmin}>
            Admin
          </button>
        )}
        <button className="text-btn" onClick={onLogout}>
          Sign out
        </button>
      </footer>
    </aside>
  );
}
