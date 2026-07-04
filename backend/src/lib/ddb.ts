// DynamoDB document client + small typed helpers used across handlers.
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  BatchGetCommand,
} from "@aws-sdk/lib-dynamodb";
import { env, INDEXES } from "./env";
import type { User, Room, RoomMember, Message, Connection } from "./types";

const client = new DynamoDBClient({ region: env.region });
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ---- Users ----

export async function getUserById(userId: string): Promise<User | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: env.usersTable, Key: { userId } })
  );
  return res.Item as User | undefined;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.usersTable,
      IndexName: INDEXES.usersByUsername,
      KeyConditionExpression: "usernameLower = :u",
      ExpressionAttributeValues: { ":u": username.toLowerCase() },
      Limit: 1,
    })
  );
  return res.Items?.[0] as User | undefined;
}

export async function putUser(user: User): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: env.usersTable,
      Item: user,
      // usernameLower is unique-enforced at the app layer via getUserByUsername;
      // this guards against overwriting an existing userId.
      ConditionExpression: "attribute_not_exists(userId)",
    })
  );
}

export async function listUsers(): Promise<User[]> {
  // Small user base — a scan is fine and cheap here.
  const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
  const res = await ddb.send(new ScanCommand({ TableName: env.usersTable }));
  return (res.Items as User[]) ?? [];
}

export async function getUsersByIds(userIds: string[]): Promise<User[]> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return [];
  const res = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [env.usersTable]: { Keys: unique.map((userId) => ({ userId })) },
      },
    })
  );
  return (res.Responses?.[env.usersTable] as User[]) ?? [];
}

// ---- Rooms ----

export async function getRoom(roomId: string): Promise<Room | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: env.roomsTable, Key: { roomId } })
  );
  return res.Item as Room | undefined;
}

export async function putRoom(room: Room): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.roomsTable, Item: room }));
}

export async function findDmRoom(dmKey: string): Promise<Room | undefined> {
  const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
  const res = await ddb.send(
    new ScanCommand({
      TableName: env.roomsTable,
      FilterExpression: "dmKey = :k",
      ExpressionAttributeValues: { ":k": dmKey },
      Limit: 1,
    })
  );
  return res.Items?.[0] as Room | undefined;
}

// ---- Room membership ----

export async function addRoomMember(member: RoomMember): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.roomMembersTable, Item: member }));
}

export async function getRoomMembers(roomId: string): Promise<RoomMember[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.roomMembersTable,
      KeyConditionExpression: "roomId = :r",
      ExpressionAttributeValues: { ":r": roomId },
    })
  );
  return (res.Items as RoomMember[]) ?? [];
}

export async function getRoomsForUser(userId: string): Promise<RoomMember[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.roomMembersTable,
      IndexName: INDEXES.membersByUser,
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    })
  );
  return (res.Items as RoomMember[]) ?? [];
}

export async function isMember(roomId: string, userId: string): Promise<boolean> {
  const res = await ddb.send(
    new GetCommand({ TableName: env.roomMembersTable, Key: { roomId, userId } })
  );
  return !!res.Item;
}

// ---- Messages ----

export async function putMessage(message: Message): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.messagesTable, Item: message }));
}

export async function getMessages(
  roomId: string,
  limit = 50,
  before?: string
): Promise<Message[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.messagesTable,
      KeyConditionExpression: before
        ? "roomId = :r AND sk < :before"
        : "roomId = :r",
      ExpressionAttributeValues: before
        ? { ":r": roomId, ":before": before }
        : { ":r": roomId },
      ScanIndexForward: false, // newest first
      Limit: limit,
    })
  );
  // Return chronological (oldest -> newest) for easy rendering.
  return ((res.Items as Message[]) ?? []).reverse();
}

// ---- Connections (presence + fan-out) ----

export async function putConnection(conn: Connection): Promise<void> {
  await ddb.send(new PutCommand({ TableName: env.connectionsTable, Item: conn }));
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: env.connectionsTable, Key: { connectionId } })
  );
}

export async function getConnection(
  connectionId: string
): Promise<Connection | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: env.connectionsTable, Key: { connectionId } })
  );
  return res.Item as Connection | undefined;
}

export async function getConnectionsForUser(userId: string): Promise<Connection[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: env.connectionsTable,
      IndexName: INDEXES.membersByUser, // GSI partition key is userId
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
    })
  );
  return (res.Items as Connection[]) ?? [];
}

export async function getAllConnections(): Promise<Connection[]> {
  const { ScanCommand } = await import("@aws-sdk/lib-dynamodb");
  const res = await ddb.send(new ScanCommand({ TableName: env.connectionsTable }));
  return (res.Items as Connection[]) ?? [];
}
