// $disconnect route. Removes the connection and, if it was the user's last one,
// broadcasts that they've gone offline.
import {
  getConnection,
  deleteConnection,
  getConnectionsForUser,
  getAllConnections,
} from "../lib/ddb";
import { broadcast } from "../lib/push";
import { endpointFromEvent, type WsEvent, type WsResult } from "../lib/ws";

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const connectionId = event.requestContext.connectionId;
  const endpoint = endpointFromEvent(event);

  const conn = await getConnection(connectionId);
  await deleteConnection(connectionId);

  if (conn) {
    const remaining = await getConnectionsForUser(conn.userId);
    if (remaining.length === 0) {
      const all = await getAllConnections();
      await broadcast(
        all.map((c) => c.connectionId),
        {
          type: "presence",
          userId: conn.userId,
          username: conn.username,
          online: false,
        },
        endpoint
      );
    }
  }

  return { statusCode: 200 };
};
