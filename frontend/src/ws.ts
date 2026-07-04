// WebSocket client with auto-reconnect. Emits parsed ServerEvents to a listener.
import { loadRuntimeConfig } from "./config";
import { getToken } from "./api";
import type { ServerEvent } from "./types";

type Listener = (event: ServerEvent) => void;
type StatusListener = (connected: boolean) => void;

export class ChatSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private reconnectDelay = 1000;
  private closedByUser = false;

  async connect() {
    this.closedByUser = false;
    const { wsUrl } = await loadRuntimeConfig();
    const token = getToken();
    if (!wsUrl || !token) return;

    const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.emitStatus(true);
    };
    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as ServerEvent;
        this.listeners.forEach((l) => l(parsed));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.emitStatus(false);
      this.ws = null;
      if (!this.closedByUser) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
      }
    };
    ws.onerror = () => ws.close();
  }

  private send(payload: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendMessage(input: {
    roomId: string;
    kind: "text" | "image";
    text?: string;
    imageKey?: string;
    clientId?: string;
  }) {
    this.send({ action: "sendMessage", ...input });
  }

  sendTyping(roomId: string, isTyping: boolean) {
    this.send({ action: "typing", roomId, isTyping });
  }

  onEvent(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  onStatus(l: StatusListener): () => void {
    this.statusListeners.add(l);
    return () => this.statusListeners.delete(l);
  }
  private emitStatus(connected: boolean) {
    this.statusListeners.forEach((l) => l(connected));
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }
}
