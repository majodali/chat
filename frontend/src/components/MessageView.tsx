import { useEffect, useRef } from "react";
import type { PublicUser, Room, Message } from "../types";
import {
  roomDisplayName,
  otherMember,
  formatTime,
  formatDayDivider,
} from "../utils";
import { Avatar } from "./Avatar";

export function MessageView({
  room,
  currentUser,
  messages,
  online,
  typingNames,
  onToggleSidebar,
}: {
  room: Room | null;
  currentUser: PublicUser;
  messages: Message[];
  online: Set<string>;
  typingNames: string[];
  onToggleSidebar: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingNames.length]);

  if (!room) {
    return (
      <div className="message-view empty-view">
        <button className="icon-btn menu-btn" onClick={onToggleSidebar}>
          ☰
        </button>
        <div className="empty-state">
          <div className="empty-emoji">👋</div>
          <p>Pick a chat to start messaging.</p>
          <button className="primary-btn open-chats-btn" onClick={onToggleSidebar}>
            Open chats
          </button>
        </div>
      </div>
    );
  }

  const other = room.type === "dm" ? otherMember(room, currentUser.userId) : null;
  const subtitle =
    room.type === "group"
      ? room.members.map((m) => m.displayName).join(", ")
      : other && online.has(other.userId)
        ? "online"
        : "offline";

  return (
    <div className="message-view">
      <header className="conv-head">
        <button className="icon-btn menu-btn" onClick={onToggleSidebar}>
          ☰
        </button>
        <Avatar
          name={roomDisplayName(room, currentUser.userId)}
          size={36}
          online={other ? online.has(other.userId) : undefined}
        />
        <div className="conv-title">
          <span className="conv-name">
            {roomDisplayName(room, currentUser.userId)}
          </span>
          <span className="conv-sub">{subtitle}</span>
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <p className="empty-hint center">
            No messages yet — say hi! 👋
          </p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDay =
            !prev ||
            new Date(prev.createdAt).toDateString() !==
              new Date(m.createdAt).toDateString();
          const mine = m.senderId === currentUser.userId;
          const grouped =
            prev &&
            prev.senderId === m.senderId &&
            m.createdAt - prev.createdAt < 5 * 60 * 1000 &&
            !showDay;
          return (
            <div key={m.messageId}>
              {showDay && (
                <div className="day-divider">
                  <span>{formatDayDivider(m.createdAt)}</span>
                </div>
              )}
              <div className={`msg-row ${mine ? "mine" : "theirs"}`}>
                {!mine && !grouped && room.type === "group" ? (
                  <Avatar name={m.senderName} size={30} />
                ) : (
                  !mine && <div className="avatar-spacer" />
                )}
                <div className="bubble-wrap">
                  {!mine && !grouped && room.type === "group" && (
                    <span className="sender-name">{m.senderName}</span>
                  )}
                  <div className={`bubble ${m.pending ? "pending" : ""}`}>
                    {m.kind === "image" && m.imageUrl ? (
                      <a href={m.imageUrl} target="_blank" rel="noreferrer">
                        <img className="msg-image" src={m.imageUrl} alt="shared" />
                      </a>
                    ) : (
                      <span className="msg-text">{m.text}</span>
                    )}
                    <span className="msg-time">{formatTime(m.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {typingNames.length > 0 && (
          <div className="typing-indicator">
            <span className="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"}{" "}
            typing…
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
