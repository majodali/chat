// Client-side notifications: tab-title unread count, a subtle sound, and
// desktop/browser notifications. All optional and feature-detected — desktop
// notifications require a secure (https) context; the rest work anywhere.

const SOUND_KEY = "liddle.sound";
const BASE_TITLE = document.title || "Liddle Chat";

// ---- Tab title ----

export function setUnreadTitle(count: number) {
  document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
}

// ---- Sound ----

export function isSoundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) !== "off";
}
export function setSoundEnabled(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? "on" : "off");
}

let audioCtx: AudioContext | null = null;

/** Short two-tone "ding" via Web Audio, so we don't ship an audio asset. */
export function playPing() {
  if (!isSoundEnabled()) return;
  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.start(t);
    osc.stop(t + 0.32);
  } catch {
    /* ignore audio errors */
  }
}

// ---- Desktop notifications ----

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotifyPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : "denied";
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export function showNotification(
  title: string,
  opts: { body?: string; tag?: string; onClick?: () => void }
) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body: opts.body,
      tag: opts.tag, // same tag collapses repeats from one chat
    });
    n.onclick = () => {
      window.focus();
      opts.onClick?.();
      n.close();
    };
  } catch {
    /* ignore notification errors */
  }
}
