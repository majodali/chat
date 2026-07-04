// `typing` route. Relays a typing indicator to the other members of a room.
import {
  getConnection,
  isMember,
  getRoomMembers,
  getConnectionsForUser,
} from "../lib/ddb";
import { broadcast } from "../lib/push";
import {
  endpointFromEvent,
  parseWsBody,
  type WsEvent,
  type WsResult,
} from "../lib/ws";

interface TypingBody {
  roomId?: string;
  isTyping?: boolean;
}

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const connectionId = event.requestContext.connectionId;
  const endpoint = endpointFromEvent(event);

  const conn = await getConnection(connectionId);
  if (!conn) return { statusCode: 401 };

  const body = parseWsBody<TypingBody>(event);
  if (!body.roomId) return { statusCode: 400 };

  if (!(await isMember(body.roomId, conn.userId))) {
    return { statusCode: 403 };
  }

  const members = await getRoomMembers(body.roomId);
  const connLists = await Promise.all(
    members
      .filter((m) => m.userId !== conn.userId) // don't echo to self
      .map((m) => getConnectionsForUser(m.userId))
  );
  const targets = connLists.flat().map((c) => c.connectionId);

  await broadcast(
    targets,
    {
      type: "typing",
      roomId: body.roomId,
      userId: conn.userId,
      username: conn.username,
      isTyping: !!body.isTyping,
    },
    endpoint
  );

  return { statusCode: 200 };
};
