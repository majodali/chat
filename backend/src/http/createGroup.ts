// POST /rooms  { name, memberIds } -> { room }   Create a group room.
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { createRoom } from "../lib/rooms";
import { getRoomMembers, getUsersByIds } from "../lib/ddb";
import {
  getAuth,
  ok,
  badRequest,
  unauthorized,
  parseBody,
  serverError,
} from "../lib/http";
import { toPublicUser } from "../lib/types";

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
) => {
  try {
    const auth = getAuth(event);
    if (!auth) return unauthorized();

    const body = parseBody<{ name?: string; memberIds?: string[] }>(event);
    const name = body.name?.trim() ?? "";
    const memberIds = Array.isArray(body.memberIds) ? body.memberIds : [];

    if (name.length < 1 || name.length > 50) {
      return badRequest("Room name must be 1-50 characters");
    }

    const room = await createRoom("group", name, auth.sub, memberIds);
    const members = await getRoomMembers(room.roomId);
    const memberUsers = await getUsersByIds(members.map((m) => m.userId));

    return ok({
      room: {
        roomId: room.roomId,
        type: room.type,
        name: room.name,
        createdAt: room.createdAt,
        members: memberUsers.map(toPublicUser),
      },
    });
  } catch (err) {
    console.error("createGroup error", err);
    return serverError();
  }
};
