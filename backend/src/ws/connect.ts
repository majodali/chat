// $connect route. Authenticates via ?token=<jwt>, records the connection,
// and broadcasts presence if this is the user's first live connection.
import { verifyToken } from "../lib/auth";
import {
  putConnection,
  getConnectionsForUser,
  getAllConnections,
} from "../lib/ddb";
import { sendToConnection, broadcast } from "../lib/push";
import { endpointFromEvent, type WsEvent, type WsResult } from "../lib/ws";
import type { Connection } from "../lib/types";

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const token = event.queryStringParameters?.token;
  if (!token) return { statusCode: 401, body: "Missing token" };

  const auth = verifyToken(token);
  if (!auth) return { statusCode: 401, body: "Invalid token" };

  const connectionId = event.requestContext.connectionId;
  const endpoint = endpointFromEvent(event);

  // Was the user already online (any other connection)?
  const existing = await getConnectionsForUser(auth.sub);
  const wasOnline = existing.length > 0;

  const conn: Connection = {
    connectionId,
    userId: auth.sub,
    username: auth.username,
    connectedAt: Date.now(),
  };
  await putConnection(conn);

  // Send the newcomer a snapshot of who is currently online.
  const all = await getAllConnections();
  const onlineUserIds = [...new Set(all.map((c) => c.userId))];
  await sendToConnection(
    connectionId,
    { type: "presenceSnapshot", online: onlineUserIds },
    endpoint
  );

  // If they just came online, tell everyone else.
  if (!wasOnline) {
    const others = all
      .filter((c) => c.userId !== auth.sub)
      .map((c) => c.connectionId);
    await broadcast(
      others,
      { type: "presence", userId: auth.sub, username: auth.username, online: true },
      endpoint
    );
  }

  return { statusCode: 200 };
};
