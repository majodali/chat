// Runtime configuration. In production the deployed site serves /config.json
// (written by CDK with the real API + WebSocket URLs). For local dev we fall
// back to Vite env vars so the build never hardcodes environment URLs.

export interface RuntimeConfig {
  apiUrl: string;
  wsUrl: string;
}

let cached: RuntimeConfig | null = null;

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;
  try {
    // Relative to the app's base path (/chat/), so it resolves to
    // /chat/config.json rather than the site root.
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as Partial<RuntimeConfig>;
      if (data.apiUrl && data.wsUrl) {
        cached = { apiUrl: data.apiUrl, wsUrl: data.wsUrl };
        return cached;
      }
    }
  } catch {
    // fall through to env fallback
  }
  cached = {
    apiUrl: import.meta.env.VITE_API_URL ?? "",
    wsUrl: import.meta.env.VITE_WS_URL ?? "",
  };
  return cached;
}
