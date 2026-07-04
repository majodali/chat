// Centralised access to the environment variables the Lambdas receive from CDK.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get usersTable() {
    return required("USERS_TABLE");
  },
  get roomsTable() {
    return required("ROOMS_TABLE");
  },
  get roomMembersTable() {
    return required("ROOM_MEMBERS_TABLE");
  },
  get messagesTable() {
    return required("MESSAGES_TABLE");
  },
  get connectionsTable() {
    return required("CONNECTIONS_TABLE");
  },
  get imageBucket() {
    return required("IMAGE_BUCKET");
  },
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  // WebSocket callback endpoint (https://xxxx.execute-api.../stage) for pushing
  // messages back to connected clients.
  get wsEndpoint() {
    return process.env.WS_ENDPOINT ?? "";
  },
  get region() {
    return process.env.AWS_REGION ?? "us-east-1";
  },
};

// GSI names (kept in one place so handlers and CDK agree).
export const INDEXES = {
  usersByUsername: "UsernameIndex",
  membersByUser: "UserIndex",
} as const;
