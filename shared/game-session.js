const SESSION_STORAGE_KEY = "game-hub-connected-session-v1";
export const GAME_RESET_EVENT_KEY = "game-hub-reset-games-v1";
const GAME_STATE_PREFIX = "game-state:";
const LEGACY_GAME_STATE_KEYS = ["faction-war-save-v1"];

export function beginGameSession(sessionId) {
  const nextSessionId = String(sessionId || "");
  if (!nextSessionId) return false;

  try {
    if (window.localStorage.getItem(SESSION_STORAGE_KEY) === nextSessionId) return false;
    const keysToRemove = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(GAME_STATE_PREFIX) || LEGACY_GAME_STATE_KEYS.includes(key)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(SESSION_STORAGE_KEY, nextSessionId);
    window.localStorage.setItem(GAME_RESET_EVENT_KEY, nextSessionId);
    return true;
  } catch (error) {
    return false;
  }
}
