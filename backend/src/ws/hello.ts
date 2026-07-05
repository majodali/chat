// `hello` route. The client sends this right after the socket opens, so by now
// the connection IS established and we can safely push to it. We reply with a
// snapshot of everyone currently online. (This can't be done in $connect — see
// the note there.)
import { getConnection, getAllConnections } from "../lib/ddb";
import { sendToConnection } from "../lib/push";
import { endpointFromEvent, type WsEvent, type WsResult } from "../lib/ws";

export const handler = async (event: WsEvent): Promise<WsResult> => {
  const connectionId = event.requestContext.connectionId;
  const endpoint = endpointFromEvent(event);

  const conn = await getConnection(connectionId);
  if (!conn) return { statusCode: 401 };

  const all = await getAllConnections();
  const online = [...new Set(all.map((c) => c.userId))];
  await sendToConnection(
    connectionId,
    { type: "presenceSnapshot", online },
    endpoint
  );

  return { statusCode: 200 };
};
