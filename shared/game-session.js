const SESSION_STORAGE_KEY = "game-hub-connected-session-v1";
const GAME_RESET_EVENT_KEY = "game-hub-reset-games-v1";
const GAME_STATE_PREFIX = "game-state:";

export function getGameResetEventKey(listenerSessionId = "default") {
  return `${GAME_RESET_EVENT_KEY}:${listenerSessionId}`;
}

export function beginGameSession(sessionId, listenerSessionId = "default") {
  const nextSessionId = String(sessionId || "");
  const sessionScope = String(listenerSessionId || "default");
  if (!nextSessionId) return false;

  try {
    const connectedSessionKey = `${SESSION_STORAGE_KEY}:${sessionScope}`;
    if (window.localStorage.getItem(connectedSessionKey) === nextSessionId) return false;
    const keysToRemove = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${GAME_STATE_PREFIX}${sessionScope}:`)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.setItem(connectedSessionKey, nextSessionId);
    window.localStorage.setItem(getGameResetEventKey(sessionScope), nextSessionId);
    return true;
  } catch (error) {
    return false;
  }
}
