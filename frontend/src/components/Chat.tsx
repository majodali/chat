import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, uploadImage } from "../api";
import { ChatSocket } from "../ws";
import type { PublicUser, Room, Message, ServerEvent } from "../types";
import { Sidebar } from "./Sidebar";
import { MessageView } from "./MessageView";
import { Composer } from "./Composer";
import { NewChatModal } from "./NewChatModal";
import { AdminModal } from "./AdminModal";
import { Diagnostics } from "./Diagnostics";
import { ChangePasswordModal } from "./ChangePasswordModal";
import { roomDisplayName } from "../utils";
import {
  setUnreadTitle,
  playPing,
  showNotification,
  getNotifyPermission,
  requestNotifyPermission,
  isSoundEnabled,
  setSoundEnabled,
} from "../notifications";

let clientCounter = 0;
const nextClientId = () => `c${Date.now()}-${clientCounter++}`;

/** Insert/replace a message in a room's list, de-duping by clientId/messageId. */
function mergeMessage(list: Message[], incoming: Message): Message[] {
  // Replace an optimistic message we sent (matched by clientId).
  if (incoming.clientId) {
    const idx = list.findIndex((m) => m.clientId === incoming.clientId);
    if (idx >= 0) {
      const copy = list.slice();
      copy[idx] = { ...incoming, pending: false };
      return copy;
    }
  }
  if (list.some((m) => m.messageId === incoming.messageId)) return list;
  return [...list, incoming].sort((a, b) => a.createdAt - b.createdAt);
}

export function Chat({
  user,
  onLogout,
}: {
  user: PublicUser;
  onLogout: () => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, Message[]>>(
    {}
  );
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [typingByRoom, setTypingByRoom] = useState<Record<string, Record<string, string>>>(
    {}
  );
  const [connected, setConnected] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [notifPerm, setNotifPerm] = useState(getNotifyPermission());
  const [soundOn, setSoundOn] = useState(isSoundEnabled());

  const socketRef = useRef<ChatSocket | null>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const loadedRooms = useRef<Set<string>>(new Set());
  // Refs so the once-subscribed socket handler always sees current values.
  const activeRoomIdRef = useRef<string | null>(activeRoomId);
  const roomsRef = useRef<Room[]>(rooms);
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const refreshRooms = useCallback(async () => {
    const { rooms } = await api.listRooms();
    setRooms(rooms.sort((a, b) => b.createdAt - a.createdAt));
    return rooms;
  }, []);

  // Initial load + socket wiring.
  useEffect(() => {
    let active = true;
    (async () => {
      const [{ rooms }, { users }] = await Promise.all([
        api.listRooms(),
        api.listUsers(),
      ]);
      if (!active) return;
      setRooms(rooms.sort((a, b) => b.createdAt - a.createdAt));
      setUsers(users);
      if (rooms.length && !activeRoomId) setActiveRoomId(rooms[0].roomId);
    })();

    const socket = new ChatSocket();
    socketRef.current = socket;
    const offStatus = socket.onStatus(setConnected);
    const offEvent = socket.onEvent(handleEvent);
    socket.connect();

    return () => {
      active = false;
      offStatus();
      offEvent();
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEvent = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case "message": {
          const m = event.message;
          setMessagesByRoom((prev) => ({
            ...prev,
            [m.roomId]: mergeMessage(prev[m.roomId] ?? [], m),
          }));
          // A message in a room we don't know about yet → refresh room list.
          setRooms((prev) => {
            if (!prev.some((r) => r.roomId === m.roomId)) {
              refreshRooms();
            }
            return prev;
          });
          // Notifications (never for our own messages).
          if (m.senderId !== user.userId) {
            const foreground =
              document.visibilityState === "visible" && document.hasFocus();
            const isActive = m.roomId === activeRoomIdRef.current;
            if (!(foreground && isActive)) {
              setUnreadByRoom((prev) => ({
                ...prev,
                [m.roomId]: (prev[m.roomId] ?? 0) + 1,
              }));
              playPing();
              if (!foreground) {
                const room = roomsRef.current.find((r) => r.roomId === m.roomId);
                const where =
                  room && room.type === "group"
                    ? `${m.senderName} · ${roomDisplayName(room, user.userId)}`
                    : m.senderName;
                showNotification(where, {
                  body: m.kind === "image" ? "📷 Photo" : m.text ?? "",
                  tag: m.roomId,
                  onClick: () => setActiveRoomId(m.roomId),
                });
              }
            }
          }
          break;
        }
        case "presenceSnapshot":
          setOnline(new Set(event.online));
          break;
        case "presence":
          setOnline((prev) => {
            const next = new Set(prev);
            if (event.online) next.add(event.userId);
            else next.delete(event.userId);
            return next;
          });
          break;
        case "typing": {
          const key = `${event.roomId}:${event.userId}`;
          setTypingByRoom((prev) => {
            const room = { ...(prev[event.roomId] ?? {}) };
            if (event.isTyping) room[event.userId] = event.username;
            else delete room[event.userId];
            return { ...prev, [event.roomId]: room };
          });
          clearTimeout(typingTimers.current[key]);
          if (event.isTyping) {
            typingTimers.current[key] = setTimeout(() => {
              setTypingByRoom((prev) => {
                const room = { ...(prev[event.roomId] ?? {}) };
                delete room[event.userId];
                return { ...prev, [event.roomId]: room };
              });
            }, 5000);
          }
          break;
        }
        case "error":
          console.error("Server error:", event.message);
          break;
      }
    },
    [refreshRooms, user.userId]
  );

  // Keep the tab title's unread count in sync.
  useEffect(() => {
    const total = Object.values(unreadByRoom).reduce((a, b) => a + b, 0);
    setUnreadTitle(total);
  }, [unreadByRoom]);

  // Clear the active room's unread when the tab regains focus/visibility.
  useEffect(() => {
    const clearActive = () => {
      if (document.visibilityState !== "visible") return;
      const id = activeRoomIdRef.current;
      if (id) {
        setUnreadByRoom((prev) => (prev[id] ? { ...prev, [id]: 0 } : prev));
      }
    };
    window.addEventListener("focus", clearActive);
    document.addEventListener("visibilitychange", clearActive);
    return () => {
      window.removeEventListener("focus", clearActive);
      document.removeEventListener("visibilitychange", clearActive);
    };
  }, []);

  // Load history when a room becomes active for the first time.
  useEffect(() => {
    if (!activeRoomId || loadedRooms.current.has(activeRoomId)) return;
    loadedRooms.current.add(activeRoomId);
    (async () => {
      try {
        const { messages } = await api.getMessages(activeRoomId);
        setMessagesByRoom((prev) => ({
          ...prev,
          [activeRoomId]: mergeHistory(prev[activeRoomId] ?? [], messages),
        }));
      } catch (err) {
        console.error("Failed to load messages", err);
      }
    })();
  }, [activeRoomId]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.roomId === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );

  function selectRoom(roomId: string) {
    setActiveRoomId(roomId);
    setUnreadByRoom((prev) => (prev[roomId] ? { ...prev, [roomId]: 0 } : prev));
    if (window.innerWidth < 720) setSidebarOpen(false);
  }

  async function enableNotifications() {
    setNotifPerm(await requestNotifyPermission());
  }
  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  }

  async function sendText(text: string) {
    if (!activeRoomId) return;
    const clientId = nextClientId();
    const optimistic: Message = {
      roomId: activeRoomId,
      messageId: clientId,
      senderId: user.userId,
      senderName: user.displayName,
      kind: "text",
      text,
      createdAt: Date.now(),
      clientId,
      pending: true,
    };
    setMessagesByRoom((prev) => ({
      ...prev,
      [activeRoomId]: mergeMessage(prev[activeRoomId] ?? [], optimistic),
    }));
    socketRef.current?.sendMessage({
      roomId: activeRoomId,
      kind: "text",
      text,
      clientId,
    });
  }

  async function sendImage(file: File) {
    if (!activeRoomId) return;
    const clientId = nextClientId();
    const previewUrl = URL.createObjectURL(file);
    const optimistic: Message = {
      roomId: activeRoomId,
      messageId: clientId,
      senderId: user.userId,
      senderName: user.displayName,
      kind: "image",
      imageUrl: previewUrl,
      createdAt: Date.now(),
      clientId,
      pending: true,
    };
    setMessagesByRoom((prev) => ({
      ...prev,
      [activeRoomId]: mergeMessage(prev[activeRoomId] ?? [], optimistic),
    }));
    try {
      const key = await uploadImage(file);
      socketRef.current?.sendMessage({
        roomId: activeRoomId,
        kind: "image",
        imageKey: key,
        clientId,
      });
    } catch {
      // Mark the optimistic image as failed by dropping it.
      setMessagesByRoom((prev) => ({
        ...prev,
        [activeRoomId]: (prev[activeRoomId] ?? []).filter(
          (m) => m.clientId !== clientId
        ),
      }));
    }
  }

  function sendTyping(isTyping: boolean) {
    if (activeRoomId) socketRef.current?.sendTyping(activeRoomId, isTyping);
  }

  async function startDm(other: PublicUser) {
    const { room } = await api.openDm(other.userId);
    setRooms((prev) =>
      prev.some((r) => r.roomId === room.roomId) ? prev : [room, ...prev]
    );
    setShowNewChat(false);
    selectRoom(room.roomId);
  }

  async function createGroup(name: string, memberIds: string[]) {
    const { room } = await api.createGroup(name, memberIds);
    setRooms((prev) => [room, ...prev]);
    setShowNewChat(false);
    selectRoom(room.roomId);
  }

  const typingNames = activeRoomId
    ? Object.entries(typingByRoom[activeRoomId] ?? {})
        .filter(([uid]) => uid !== user.userId)
        .map(([, name]) => name)
    : [];

  return (
    <div className="chat-layout">
      <Sidebar
        user={user}
        rooms={rooms}
        activeRoomId={activeRoomId}
        online={online}
        unread={unreadByRoom}
        open={sidebarOpen}
        connected={connected}
        notifPermission={notifPerm}
        soundOn={soundOn}
        onEnableNotifications={enableNotifications}
        onToggleSound={toggleSound}
        onSelectRoom={selectRoom}
        onNewChat={() => setShowNewChat(true)}
        onOpenAdmin={() => setShowAdmin(true)}
        onOpenPassword={() => setShowPassword(true)}
        onLogout={onLogout}
      />

      <main className="chat-main">
        <MessageView
          room={activeRoom}
          currentUser={user}
          messages={activeRoomId ? messagesByRoom[activeRoomId] ?? [] : []}
          online={online}
          typingNames={typingNames}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />
        {activeRoom && (
          <Composer
            onSendText={sendText}
            onSendImage={sendImage}
            onTyping={sendTyping}
          />
        )}
      </main>

      {showNewChat && (
        <NewChatModal
          users={users.filter((u) => u.userId !== user.userId)}
          onClose={() => setShowNewChat(false)}
          onStartDm={startDm}
          onCreateGroup={createGroup}
        />
      )}
      {showAdmin && user.role === "admin" && (
        <AdminModal
          currentUserId={user.userId}
          onClose={() => setShowAdmin(false)}
          onOpenDiagnostics={() => {
            setShowAdmin(false);
            setShowDiagnostics(true);
          }}
        />
      )}
      {showDiagnostics && user.role === "admin" && (
        <Diagnostics user={user} onClose={() => setShowDiagnostics(false)} />
      )}
      {showPassword && (
        <ChangePasswordModal onClose={() => setShowPassword(false)} />
      )}
    </div>
  );
}

/** Merge fetched history with any already-present (e.g. live) messages. */
function mergeHistory(existing: Message[], history: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of history) byId.set(m.messageId, m);
  for (const m of existing) byId.set(m.messageId, m);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}
