// Shared room-creation logic used by the createGroup / openDm handlers.
import { randomUUID } from "node:crypto";
import { putRoom, addRoomMember, findDmRoom, getRoom } from "./ddb";
import type { Room, RoomMember } from "./types";

export function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join("#");
}

export async function createRoom(
  type: Room["type"],
  name: string,
  createdBy: string,
  memberIds: string[],
  dmKey?: string
): Promise<Room> {
  const room: Room = {
    roomId: randomUUID(),
    type,
    name,
    createdBy,
    createdAt: Date.now(),
    dmKey,
  };
  await putRoom(room);
  const uniqueMembers = [...new Set([createdBy, ...memberIds])];
  const now = Date.now();
  await Promise.all(
    uniqueMembers.map((userId) => {
      const member: RoomMember = { roomId: room.roomId, userId, joinedAt: now };
      return addRoomMember(member);
    })
  );
  return room;
}

/** Return the existing DM room for two users, or create one. */
export async function getOrCreateDm(
  userA: string,
  userB: string
): Promise<Room> {
  const key = dmKeyFor(userA, userB);
  const existing = await findDmRoom(key);
  if (existing) return existing;
  return createRoom("dm", "", userA, [userB], key);
}

export { getRoom };
