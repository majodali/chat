// POST /admin/users/{userId}/password  { newPassword } -> { ok: true }
// Admin-only: reset another user's password (e.g. a kid who forgot theirs).
// No current-password check — that's the point of an admin reset.
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getUserById, updateUserPassword } from "../lib/ddb";
import { hashPassword } from "../lib/auth";
import {
  getAuth,
  ok,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  parseBody,
  serverError,
} from "../lib/http";

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
) => {
  try {
    const auth = getAuth(event);
    if (!auth) return unauthorized();
    if (auth.role !== "admin") return forbidden("Admins only");

    const userId = event.pathParameters?.userId;
    if (!userId) return badRequest("userId is required");

    const { newPassword } = parseBody<{ newPassword?: string }>(event);
    if (!newPassword || newPassword.length < 6) {
      return badRequest("New password must be at least 6 characters");
    }

    const target = await getUserById(userId);
    if (!target) return notFound("User not found");

    await updateUserPassword(userId, await hashPassword(newPassword));
    return ok({ ok: true });
  } catch (err) {
    console.error("adminResetPassword error", err);
    return serverError();
  }
};
