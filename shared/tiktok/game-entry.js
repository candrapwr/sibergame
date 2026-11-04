import { addListenerSession, getListenerSessionId } from "./listener-session.js";

export async function requireConnectedTikTok() {
  try {
    const sessionId = getListenerSessionId();
    const response = await fetch(addListenerSession("/api/tiktok/status", sessionId), { cache: "no-store" });
    if (response.ok) {
      const state = await response.json();
      if (state.status === "connected") {
        const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
        return `${scheme}//${window.location.host}/tiktok?sessionId=${encodeURIComponent(sessionId)}`;
      }
    }
  } catch { /* Redirect to the hub so the listener can be started there. */ }

  const requestedGame = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const hub = new URL("/", window.location.origin);
  hub.searchParams.set("next", requestedGame);
  window.location.replace(hub);
  return "";
}
