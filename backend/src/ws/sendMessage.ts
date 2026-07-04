// `sendMessage` route. Persists a chat message and fans it out to every
// connection of every member of the room.
import { randomUUID } from "node:crypto";
import {
  getConnection,
  isMember,
  putMessage,
  getRoomMembers,
  getConnectionsForUser,
} from "../lib/ddb";
import { broadcast, toPublicMessage } from "../lib/push";
import {
  endpointFromEvent,
  parseWsBody,
  type WsEvent,
  type WsResult,
} from "../lib/ws";
import type { Message } from "../lib/types";

interface SendMessageBody {
  roomId?: string;
  kind?: "text" | "image";
  text?: string;
  imageKey?: string;
  clientId?: string;
}

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const connectionId = event.requestContext.connectionId;
  const endpoint = endpointFromEvent(event);

  const conn = await getConnection(connectionId);
  if (!conn) return { statusCode: 401 };

  const body = parseWsBody<SendMessageBody>(event);
  const roomId = body.roomId;
  const kind = body.kind === "image" ? "image" : "text";

  if (!roomId) return { statusCode: 400 };
  if (kind === "text" && !body.text?.trim()) return { statusCode: 400 };
  if (kind === "image" && !body.imageKey) return { statusCode: 400 };

  if (!(await isMember(roomId, conn.userId))) {
    return { statusCode: 403 };
  }

  const now = Date.now();
  const messageId = randomUUID();
  const message: Message = {
    roomId,
    sk: `${String(now).padStart(15, "0")}#${messageId}`,
    messageId,
    senderId: conn.userId,
    senderName: conn.username,
    kind,
    text: kind === "text" ? body.text!.trim().slice(0, 4000) : undefined,
    imageKey: kind === "image" ? body.imageKey : undefined,
    createdAt: now,
  };
  await putMessage(message);

  const publicMessage = await toPublicMessage(message, body.clientId);

  // Collect every connection of every room member.
  const members = await getRoomMembers(roomId);
  const connLists = await Promise.all(
    members.map((m) => getConnectionsForUser(m.userId))
  );
  const targets = connLists.flat().map((c) => c.connectionId);

  await broadcast(targets, { type: "message", message: publicMessage }, endpoint);

  return { statusCode: 200 };
};
