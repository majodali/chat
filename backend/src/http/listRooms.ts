// GET /rooms -> { rooms }  Every room the caller belongs to, with member info.
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getRoomsForUser, getRoom, getRoomMembers, getUsersByIds } from "../lib/ddb";
import { getAuth, ok, unauthorized, serverError } from "../lib/http";
import { toPublicUser, type PublicUser } from "../lib/types";

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
) => {
  try {
    const auth = getAuth(event);
    if (!auth) return unauthorized();

    const memberships = await getRoomsForUser(auth.sub);
    const rooms = await Promise.all(
      memberships.map(async (m) => {
        const room = await getRoom(m.roomId);
        if (!room) return null;
        const members = await getRoomMembers(room.roomId);
        const memberUsers = await getUsersByIds(members.map((mm) => mm.userId));
        const publicMembers: PublicUser[] = memberUsers.map(toPublicUser);
        return {
          roomId: room.roomId,
          type: room.type,
          name: room.name,
          createdAt: room.createdAt,
          members: publicMembers,
        };
      })
    );

    return ok({
      rooms: rooms.filter((r): r is NonNullable<typeof r> => r !== null),
    });
  } catch (err) {
    console.error("listRooms error", err);
    return serverError();
  }
};
