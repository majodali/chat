// Thin REST client for the HTTP API. Automatically attaches the bearer token.
import { loadRuntimeConfig } from "./config";
import type { PublicUser, Room, Message } from "./types";

const TOKEN_KEY = "liddle.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const { apiUrl } = await loadRuntimeConfig();
  const token = getToken();
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: PublicUser }>("POST", "/login", {
      username,
      password,
    }),
  me: () => request<{ user: PublicUser }>("GET", "/me"),
  listUsers: () => request<{ users: PublicUser[] }>("GET", "/users"),
  createUser: (input: {
    username: string;
    password: string;
    displayName?: string;
    role?: "admin" | "member";
  }) => request<{ user: PublicUser }>("POST", "/admin/users", input),
  listRooms: () => request<{ rooms: Room[] }>("GET", "/rooms"),
  createGroup: (name: string, memberIds: string[]) =>
    request<{ room: Room }>("POST", "/rooms", { name, memberIds }),
  openDm: (userId: string) =>
    request<{ room: Room }>("POST", "/dms", { userId }),
  getMessages: (roomId: string, before?: string) =>
    request<{ messages: Message[]; nextBefore: string | null }>(
      "GET",
      `/rooms/${roomId}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`
    ),
  getUploadUrl: (contentType: string) =>
    request<{ uploadUrl: string; key: string }>("POST", "/uploads", {
      contentType,
    }),
};

/** Upload a file to S3 via a presigned PUT url; returns the object key. */
export async function uploadImage(file: File): Promise<string> {
  const { uploadUrl, key } = await api.getUploadUrl(file.type);
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!res.ok) throw new Error("Image upload failed");
  return key;
}
