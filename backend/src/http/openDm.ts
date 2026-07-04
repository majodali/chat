// POST /dms  { userId } -> { room }   Open (or reuse) a DM with another user.
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getOrCreateDm } from "../lib/rooms";
import { getUserById, getRoomMembers, getUsersByIds } from "../lib/ddb";
import {
  getAuth,
  ok,
  badRequest,
  unauthorized,
  notFound,
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

    const { userId } = parseBody<{ userId?: string }>(event);
    if (!userId) return badRequest("userId is required");
    if (userId === auth.sub) return badRequest("You cannot DM yourself");

    const other = await getUserById(userId);
    if (!other) return notFound("That user does not exist");

    const room = await getOrCreateDm(auth.sub, userId);
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
    console.error("openDm error", err);
    return serverError();
  }
};
