const SESSION_STORAGE_KEY = "game-hub-listener-session-v1";
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let fallbackSessionId = "";

export function createListenerSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

export function getListenerSessionId() {
  const querySessionId = new URLSearchParams(window.location.search).get("sessionId") || "";
  if (SESSION_ID_PATTERN.test(querySessionId)) {
    fallbackSessionId = querySessionId;
    try { window.sessionStorage.setItem(SESSION_STORAGE_KEY, querySessionId); } catch { /* Use the URL value for this page. */ }
    return querySessionId;
  }

  try {
    const storedSessionId = window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
    if (SESSION_ID_PATTERN.test(storedSessionId)) {
      fallbackSessionId = storedSessionId;
      return storedSessionId;
    }
  } catch { /* Storage can be disabled by the browser. */ }

  if (!fallbackSessionId) fallbackSessionId = createListenerSessionId();
  try { window.sessionStorage.setItem(SESSION_STORAGE_KEY, fallbackSessionId); } catch { /* Keep the in-memory session for this page. */ }
  return fallbackSessionId;
}

export function addListenerSession(target, sessionId = getListenerSessionId()) {
  const url = new URL(target, window.location.origin);
  url.searchParams.set("sessionId", sessionId);
  return url;
}
