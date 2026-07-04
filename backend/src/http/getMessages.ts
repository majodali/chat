// GET /rooms/{roomId}/messages?before=<sk>&limit=<n> -> { messages }
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getMessages, isMember } from "../lib/ddb";
import { toPublicMessage } from "../lib/push";
import {
  getAuth,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  serverError,
} from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
) => {
  try {
    const auth = getAuth(event);
    if (!auth) return unauthorized();

    const roomId = event.pathParameters?.roomId;
    if (!roomId) return badRequest("roomId is required");

    if (!(await isMember(roomId, auth.sub))) {
      return forbidden("You are not a member of this room");
    }

    const q = event.queryStringParameters ?? {};
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
    const before = q.before;

    const messages = await getMessages(roomId, limit, before);
    const publicMessages = await Promise.all(
      messages.map((m) => toPublicMessage(m))
    );

    return ok({
      messages: publicMessages,
      // `sk` of the oldest returned message, for "load older" pagination.
      nextBefore: messages.length ? messages[0].sk : null,
    });
  } catch (err) {
    console.error("getMessages error", err);
    return serverError();
  }
};
