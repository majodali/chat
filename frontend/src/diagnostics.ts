// Functional self-tests for the admin Diagnostics page. These exercise the
// LIVE backend (HTTP API + WebSocket) exactly as a real client would, so they
// catch end-to-end breakage that unit tests and the browser console can't see.
//
// - "smoke" steps are non-mutating (safe to run on every deploy).
// - "full" steps also create a throwaway Diagnostics room + messages.
import { api, uploadImage, getToken } from "./api";
import { loadRuntimeConfig } from "./config";
import type { PublicUser, ServerEvent } from "./types";

export type StepKind = "smoke" | "full";
export type StepStatus = "pending" | "running" | "pass" | "fail" | "skip";

export interface StepResult {
  id: string;
  name: string;
  kind: StepKind;
  status: StepStatus;
  detail?: string;
  ms?: number;
}

interface Ctx {
  ws?: TestSocket;
  diagRoomId?: string;
  sentMessageId?: string;
  imageUrl?: string;
}

interface Step {
  id: string;
  name: string;
  kind: StepKind;
  run: (ctx: Ctx, user: PublicUser) => Promise<void>;
}

const DIAG_ROOM_NAME = "🔧 Diagnostics";

/** Promise-based WebSocket for tests: connect, send, and await specific frames. */
class TestSocket {
  private ws: WebSocket;
  private queue: ServerEvent[] = [];
  private waiters: {
    pred: (e: ServerEvent) => boolean;
    resolve: (e: ServerEvent) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  readonly ready: Promise<void>;

  constructor(wsUrl: string, token: string) {
    this.ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
    this.ready = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("WebSocket open timed out (10s)")), 10000);
      this.ws.onopen = () => {
        clearTimeout(t);
        resolve();
      };
      this.ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("WebSocket connection error"));
      };
    });
    this.ws.onmessage = (ev) => {
      let e: ServerEvent;
      try {
        e = JSON.parse(ev.data) as ServerEvent;
      } catch {
        return;
      }
      const idx = this.waiters.findIndex((w) => w.pred(e));
      if (idx >= 0) {
        const w = this.waiters.splice(idx, 1)[0];
        clearTimeout(w.timer);
        w.resolve(e);
      } else {
        this.queue.push(e);
      }
    };
  }

  send(obj: unknown) {
    this.ws.send(JSON.stringify(obj));
  }

  waitFor(pred: (e: ServerEvent) => boolean, what: string, timeoutMs = 10000): Promise<ServerEvent> {
    const idx = this.queue.findIndex(pred);
    if (idx >= 0) return Promise.resolve(this.queue.splice(idx, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.timer === timer);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`));
      }, timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

// 1x1 transparent PNG, used by the image round-trip test.
function tinyPng(): File {
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], "diagnostic.png", { type: "image/png" });
}

export const STEPS: Step[] = [
  {
    id: "config",
    name: "Runtime config loaded",
    kind: "smoke",
    run: async () => {
      const cfg = await loadRuntimeConfig();
      assert(cfg.apiUrl, "config.json is missing apiUrl");
      assert(cfg.wsUrl, "config.json is missing wsUrl");
    },
  },
  {
    id: "session",
    name: "Session valid (GET /me)",
    kind: "smoke",
    run: async (_ctx, user) => {
      const { user: me } = await api.me();
      assert(me.userId === user.userId, "GET /me returned a different user");
    },
  },
  {
    id: "users",
    name: "List users (GET /users)",
    kind: "smoke",
    run: async (_ctx, user) => {
      const { users } = await api.listUsers();
      assert(Array.isArray(users), "users is not an array");
      assert(users.some((u) => u.userId === user.userId), "current user missing from /users");
    },
  },
  {
    id: "rooms",
    name: "List rooms (GET /rooms)",
    kind: "smoke",
    run: async () => {
      const { rooms } = await api.listRooms();
      assert(Array.isArray(rooms), "rooms is not an array");
    },
  },
  {
    id: "presign",
    name: "Presign image upload (POST /uploads)",
    kind: "smoke",
    run: async () => {
      const { uploadUrl, key } = await api.getUploadUrl("image/png");
      assert(uploadUrl?.startsWith("http"), "no uploadUrl returned");
      assert(!!key, "no object key returned");
    },
  },
  {
    id: "ws-connect",
    name: "WebSocket connects",
    kind: "smoke",
    run: async (ctx) => {
      const { wsUrl } = await loadRuntimeConfig();
      const token = getToken();
      assert(token, "no auth token available");
      ctx.ws = new TestSocket(wsUrl, token);
      await ctx.ws.ready;
    },
  },
  {
    id: "presence",
    name: "Presence snapshot (hello → presenceSnapshot)",
    kind: "smoke",
    run: async (ctx, user) => {
      assert(ctx.ws, "WebSocket not connected (previous step failed)");
      ctx.ws.send({ action: "hello" });
      const evt = await ctx.ws.waitFor(
        (e) => e.type === "presenceSnapshot",
        "presenceSnapshot"
      );
      assert(evt.type === "presenceSnapshot", "unexpected event type");
      assert(
        evt.online.includes(user.userId),
        "own userId not present in the online snapshot"
      );
    },
  },
  {
    id: "diag-room",
    name: "Diagnostics room ready",
    kind: "full",
    run: async (ctx) => {
      const { rooms } = await api.listRooms();
      const existing = rooms.find((r) => r.type === "group" && r.name === DIAG_ROOM_NAME);
      if (existing) {
        ctx.diagRoomId = existing.roomId;
      } else {
        const { room } = await api.createGroup(DIAG_ROOM_NAME, []);
        ctx.diagRoomId = room.roomId;
      }
    },
  },
  {
    id: "send-receive",
    name: "Send + receive message over WebSocket",
    kind: "full",
    run: async (ctx) => {
      assert(ctx.ws, "WebSocket not connected");
      assert(ctx.diagRoomId, "no diagnostics room");
      const clientId = `diag-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const text = `[diagnostic] ${new Date().toISOString()}`;
      ctx.ws.send({
        action: "sendMessage",
        roomId: ctx.diagRoomId,
        kind: "text",
        text,
        clientId,
      });
      const evt = await ctx.ws.waitFor(
        (e) => e.type === "message" && e.message.clientId === clientId,
        "message echo"
      );
      assert(evt.type === "message", "unexpected event type");
      assert(evt.message.text === text, "echoed message text did not match");
      ctx.sentMessageId = evt.message.messageId;
    },
  },
  {
    id: "history",
    name: "Message persisted (GET history)",
    kind: "full",
    run: async (ctx) => {
      assert(ctx.diagRoomId, "no diagnostics room");
      assert(ctx.sentMessageId, "no message was sent to verify");
      const { messages } = await api.getMessages(ctx.diagRoomId);
      assert(
        messages.some((m) => m.messageId === ctx.sentMessageId),
        "sent message not found in history — it was not persisted"
      );
    },
  },
  {
    id: "image",
    name: "Image upload round-trip",
    kind: "full",
    run: async (ctx) => {
      assert(ctx.ws, "WebSocket not connected");
      assert(ctx.diagRoomId, "no diagnostics room");
      const key = await uploadImage(tinyPng());
      const clientId = `diag-img-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      ctx.ws.send({
        action: "sendMessage",
        roomId: ctx.diagRoomId,
        kind: "image",
        imageKey: key,
        clientId,
      });
      const evt = await ctx.ws.waitFor(
        (e) => e.type === "message" && e.message.clientId === clientId,
        "image message echo"
      );
      assert(evt.type === "message", "unexpected event type");
      assert(evt.message.imageUrl, "no presigned imageUrl on the echoed message");
      const res = await fetch(evt.message.imageUrl);
      assert(res.ok, `image URL not reachable (HTTP ${res.status})`);
      ctx.imageUrl = evt.message.imageUrl;
    },
  },
];

export function stepsFor(mode: "smoke" | "all"): Step[] {
  return mode === "all" ? STEPS : STEPS.filter((s) => s.kind === "smoke");
}

/** Run the chosen suite sequentially, reporting results as they change. */
export async function runDiagnostics(
  mode: "smoke" | "all",
  user: PublicUser,
  onUpdate: (results: StepResult[]) => void
): Promise<StepResult[]> {
  const chosen = stepsFor(mode);
  const results: StepResult[] = chosen.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    status: "pending",
  }));
  const ctx: Ctx = {};
  onUpdate([...results]);

  for (let i = 0; i < chosen.length; i++) {
    results[i] = { ...results[i], status: "running" };
    onUpdate([...results]);
    const t0 = performance.now();
    try {
      await chosen[i].run(ctx, user);
      results[i] = { ...results[i], status: "pass", ms: Math.round(performance.now() - t0) };
    } catch (err) {
      results[i] = {
        ...results[i],
        status: "fail",
        ms: Math.round(performance.now() - t0),
        detail: err instanceof Error ? err.message : String(err),
      };
    }
    onUpdate([...results]);
  }

  ctx.ws?.close();
  return results;
}
