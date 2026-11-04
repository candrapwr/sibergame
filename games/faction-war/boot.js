import { requireConnectedTikTok } from "../../shared/tiktok/game-entry.js";

const SETTINGS_KEY = "faction-war-ui-settings-v1";

async function loadGameSettings() {
  let legacySettings = null;
  try {
    const legacyValue = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null");
    if (legacyValue && typeof legacyValue === "object" && !Array.isArray(legacyValue)) legacySettings = legacyValue;
  } catch {
    try { window.localStorage.removeItem(SETTINGS_KEY); } catch { /* Storage may be unavailable. */ }
  }

  try {
    const response = await fetch("/api/games/faction-war/settings", { cache: "no-store" });
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.error || "Pengaturan game gagal dimuat.");
    window.factionWarSettingsUsername = saved.username || "";
    if (saved.found) {
      try { window.localStorage.removeItem(SETTINGS_KEY); } catch { /* Storage may be unavailable. */ }
      return saved.settings || {};
    }

    if (!legacySettings) return {};
    const migration = await fetch("/api/games/faction-war/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: legacySettings })
    });
    const migrationResult = await migration.json();
    if (!migration.ok) throw new Error(migrationResult.error || "Pengaturan lama gagal dipindahkan ke SQLite.");
    try { window.localStorage.removeItem(SETTINGS_KEY); } catch { /* Storage may be unavailable. */ }
    return legacySettings;
  } catch (error) {
    window.factionWarSettingsLoadError = error.message || "Pengaturan game gagal dimuat.";
    return legacySettings || {};
  }
}

const endpoint = await requireConnectedTikTok();
if (endpoint) {
  window.tiktokListenerEndpoint = endpoint;
  const [catalogResponse, gameSettings] = await Promise.all([
    fetch("/api/tiktok/gifts", { cache: "no-store" }).catch(() => null),
    loadGameSettings()
  ]);
  try {
    const catalog = catalogResponse?.ok ? await catalogResponse.json() : null;
    window.tiktokGiftCatalog = Array.isArray(catalog?.gifts) ? catalog.gifts : [];
    window.tiktokGiftCatalogStatus = catalog?.status === "ready" && window.tiktokGiftCatalog.length ? "ready" : "failed";
  } catch {
    window.tiktokGiftCatalog = [];
    window.tiktokGiftCatalogStatus = "failed";
  }
  window.factionWarSettings = gameSettings;
  await import("./game.js");
}
