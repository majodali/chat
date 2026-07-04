// Push server events to connected WebSocket clients via the API Gateway
// Management API, and image presigning used by message fan-out.
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from "@aws-sdk/client-apigatewaymanagementapi";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";
import { deleteConnection } from "./ddb";
import type { ServerEvent, Message, PublicMessage } from "./types";

const s3 = new S3Client({ region: env.region });

function managementClient(endpoint: string): ApiGatewayManagementApiClient {
  return new ApiGatewayManagementApiClient({ region: env.region, endpoint });
}

/**
 * Send an event to a single connection. If the connection is stale (410 Gone)
 * we clean it up. Any other error is swallowed so one dead client can't break
 * a broadcast.
 */
export async function sendToConnection(
  connectionId: string,
  event: ServerEvent,
  endpoint = env.wsEndpoint
): Promise<void> {
  if (!endpoint) throw new Error("WS_ENDPOINT is not configured");
  const client = managementClient(endpoint);
  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(event)),
      })
    );
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    if (status === 410) {
      await deleteConnection(connectionId).catch(() => {});
    } else {
      console.error("sendToConnection failed", connectionId, err);
    }
  }
}

export async function broadcast(
  connectionIds: string[],
  event: ServerEvent,
  endpoint = env.wsEndpoint
): Promise<void> {
  await Promise.all(
    connectionIds.map((id) => sendToConnection(id, event, endpoint))
  );
}

/** Presigned GET url so browsers can display an image message. */
export async function presignImageGet(key: string): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: env.imageBucket, Key: key }),
    { expiresIn: 60 * 60 * 24 } // 24h
  );
}

/** Convert a stored Message into the wire shape, presigning images. */
export async function toPublicMessage(
  m: Message,
  clientId?: string
): Promise<PublicMessage> {
  const base: PublicMessage = {
    roomId: m.roomId,
    messageId: m.messageId,
    senderId: m.senderId,
    senderName: m.senderName,
    kind: m.kind,
    text: m.text,
    imageKey: m.imageKey,
    createdAt: m.createdAt,
    clientId,
  };
  if (m.kind === "image" && m.imageKey) {
    base.imageUrl = await presignImageGet(m.imageKey);
  }
  return base;
}
