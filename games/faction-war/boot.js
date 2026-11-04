import { requireConnectedTikTok } from "../../shared/tiktok/game-entry.js";
import { getListenerSessionId } from "../../shared/tiktok/listener-session.js";

const SETTINGS_KEY = "faction-war-ui-settings-v1";
const listenerSessionId = getListenerSessionId();
window.factionWarLoaderStartedAt = performance.now();
window.gameHubSessionId = listenerSessionId;

function settingsApiUrl(username, sessionId) {
  const url = new URL("/api/games/faction-war/settings", window.location.origin);
  if (username) url.searchParams.set("username", username);
  url.searchParams.set("sessionId", sessionId);
  return `${url.pathname}${url.search}`;
}

async function loadGameSettings(username = "", sessionId = listenerSessionId) {
  let legacySettings = null;
  try {
    const legacyValue = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null");
    if (legacyValue && typeof legacyValue === "object" && !Array.isArray(legacyValue)) legacySettings = legacyValue;
  } catch {
    try { window.localStorage.removeItem(SETTINGS_KEY); } catch { /* Storage may be unavailable. */ }
  }

  try {
    const endpoint = settingsApiUrl(username, sessionId);
    const response = await fetch(endpoint, { cache: "no-store" });
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.error || "Pengaturan game gagal dimuat.");
    window.factionWarSettingsUsername = saved.username || username;
    if (saved.found) {
      try { window.localStorage.removeItem(SETTINGS_KEY); } catch { /* Storage may be unavailable. */ }
      return saved.settings || {};
    }

    if (!legacySettings) return {};
    const migration = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: legacySettings })
    });
    const migrationResult = await migration.json();
    if (!migration.ok) throw new Error(migrationResult.error || "Pengaturan lama gagal dipindahkan ke SQLite.");
    try { window.localStorage.removeItem(SETTINGS_KEY); } catch { /* Storage may be unavailable. */ }
    return legacySettings;
  } catch (error) {
    window.factionWarSettingsUsername = username || window.factionWarSettingsUsername || "";
    window.factionWarSettingsLoadError = error.message || "Pengaturan game gagal dimuat.";
    return legacySettings || {};
  }
}

const query = new URLSearchParams(window.location.search);
const settingsOnly = query.get("settingsOnly") === "1";
const settingsUsername = String(query.get("username") || "").trim().replace(/^@+/, "");
const validSettingsUsername = /^[a-zA-Z0-9._]{1,50}$/.test(settingsUsername);

if (settingsOnly && !validSettingsUsername) {
  window.location.replace("/");
} else {
  const endpoint = settingsOnly ? "" : await requireConnectedTikTok();
  if (settingsOnly || endpoint) {
    const accountUsername = settingsOnly
      ? settingsUsername
      : String(window.tiktokConnectedUsername || "").trim().replace(/^@+/, "");
    window.factionWarSettingsOnly = settingsOnly;
    window.factionWarSettingsUsername = accountUsername;
    if (settingsOnly) document.body.classList.add("settings-only-mode");
    if (endpoint) window.tiktokListenerEndpoint = endpoint;

    const giftsUrl = new URL("/api/tiktok/gifts", window.location.origin);
    giftsUrl.searchParams.set("game", "faction-war");
    giftsUrl.searchParams.set("sessionId", listenerSessionId);
    if (accountUsername) giftsUrl.searchParams.set("username", accountUsername);
    const [catalogResponse, gameSettings] = await Promise.all([
      fetch(`${giftsUrl.pathname}${giftsUrl.search}`, { cache: "no-store" }).catch(() => null),
      loadGameSettings(accountUsername)
    ]);
    try {
      const catalog = catalogResponse?.ok ? await catalogResponse.json() : null;
      window.tiktokGiftCatalog = Array.isArray(catalog?.gifts) ? catalog.gifts : [];
      window.tiktokGiftCatalogStatus = catalog?.status === "ready" && window.tiktokGiftCatalog.length ? "ready" : "failed";
      window.tiktokGiftCatalogSource = catalog?.source || "none";
    } catch {
      window.tiktokGiftCatalog = [];
      window.tiktokGiftCatalogStatus = "failed";
      window.tiktokGiftCatalogSource = "none";
    }
    window.factionWarSettings = gameSettings;
    await import("./game.js");
  }
}
