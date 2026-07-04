import type { PublicUser, Room } from "../types";
import { roomDisplayName, otherMember } from "../utils";
import { Avatar } from "./Avatar";

export function Sidebar({
  user,
  rooms,
  activeRoomId,
  online,
  open,
  connected,
  onSelectRoom,
  onNewChat,
  onOpenAdmin,
  onLogout,
}: {
  user: PublicUser;
  rooms: Room[];
  activeRoomId: string | null;
  online: Set<string>;
  open: boolean;
  connected: boolean;
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
        <button className="icon-btn" title="New chat" onClick={onNewChat}>
          ＋
        </button>
      </header>

      <div className="room-list">
        {rooms.length === 0 && (
          <p className="empty-hint">No chats yet. Tap ＋ to start one!</p>
        )}
        {rooms.map((room) => {
          const other = room.type === "dm" ? otherMember(room, user.userId) : null;
          const isOnline = other ? online.has(other.userId) : undefined;
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
