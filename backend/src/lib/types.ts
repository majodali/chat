// Shared entity + message types for Liddle Chat.

export interface User {
  userId: string;
  username: string;
  usernameLower: string; // for case-insensitive login lookup (GSI)
  displayName: string;
  passwordHash: string;
  role: "admin" | "member";
  createdAt: number;
}

// Public shape of a user — never leaks the password hash.
export interface PublicUser {
  userId: string;
  username: string;
  displayName: string;
  role: "admin" | "member";
  createdAt: number;
}

export type RoomType = "group" | "dm";

export interface Room {
  roomId: string;
  type: RoomType;
  name: string; // group name, or "" for DMs (derived from members client-side)
  createdBy: string;
  createdAt: number;
  // For DMs we store a deterministic key of the two userIds so we never
  // create duplicate DM rooms for the same pair.
  dmKey?: string;
}

export interface RoomMember {
  roomId: string;
  userId: string;
  joinedAt: number;
}

export interface Message {
  roomId: string;
  sk: string; // `${createdAt}#${messageId}` — sorts by time within a room
  messageId: string;
  senderId: string;
  senderName: string;
  kind: "text" | "image";
  text?: string;
  imageKey?: string; // S3 object key for image messages
  createdAt: number;
}

export interface Connection {
  connectionId: string;
  userId: string;
  username: string;
  connectedAt: number;
}

export function toPublicUser(u: User): PublicUser {
  return {
    userId: u.userId,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
  };
}

// ---- WebSocket wire protocol ----

// Client -> server (the `action` field selects the API Gateway route).
export type ClientAction =
  | { action: "sendMessage"; roomId: string; kind: "text" | "image"; text?: string; imageKey?: string; clientId?: string }
  | { action: "typing"; roomId: string; isTyping: boolean };

// Server -> client push payloads.
export type ServerEvent =
  | { type: "message"; message: PublicMessage }
  | { type: "presence"; userId: string; username: string; online: boolean }
  | { type: "presenceSnapshot"; online: string[] }
  | { type: "typing"; roomId: string; userId: string; username: string; isTyping: boolean }
  | { type: "error"; message: string };

export interface PublicMessage {
  roomId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  kind: "text" | "image";
  text?: string;
  imageUrl?: string; // presigned GET url for image messages
  imageKey?: string;
  createdAt: number;
  clientId?: string; // echoed back so the sender can de-dupe its optimistic copy
}
