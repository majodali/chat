// Client-side mirrors of the backend's public wire types.

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
  name: string;
  createdAt: number;
  members: PublicUser[];
}

export interface Message {
  roomId: string;
  messageId: string;
  senderId: string;
  senderName: string;
  kind: "text" | "image";
  text?: string;
  imageUrl?: string;
  imageKey?: string;
  createdAt: number;
  clientId?: string;
  pending?: boolean; // client-only: optimistic message not yet confirmed
}

export type ServerEvent =
  | { type: "message"; message: Message }
  | { type: "presence"; userId: string; username: string; online: boolean }
  | { type: "presenceSnapshot"; online: string[] }
  | {
      type: "typing";
      roomId: string;
      userId: string;
      username: string;
      isTyping: boolean;
    }
  | { type: "error"; message: string };
