import { requireConnectedTikTok } from "../../shared/tiktok/game-entry.js";
import { getListenerSessionId } from "../../shared/tiktok/listener-session.js";

window.gameHubSessionId = getListenerSessionId();
window.dragRaceLoaderStartedAt = performance.now();

// Mode dev (?dev=1) membuka UI game tanpa listener TikTok — untuk uji lokal.
// ?tiktokWs=ws://… = endpoint WS arbitrary TANPA gerbang hub — untuk harness/test
// (pola sama seperti fallback ?tiktokWs di faction-war).
const query = new URLSearchParams(window.location.search);
const devMode = query.get("dev") === "1";
const wsOverride = String(query.get("tiktokWs") || "").trim();
const hubEndpoint = devMode || wsOverride ? "" : await requireConnectedTikTok();
const endpoint = wsOverride || hubEndpoint;

if (devMode || endpoint) {
  window.dragRaceDevMode = devMode;
  // PENTING: endpoint dari hub WAJIB disimpan ke window sebelum game.js import —
  // game.js hanya connect kalau window.tiktokListenerEndpoint terisi.
  // (Bug lama: hasil requireConnectedTikTok tidak pernah disimpan → tidak pernah connect.)
  if (endpoint && !devMode) window.tiktokListenerEndpoint = endpoint;
  window.dragRaceSettings = {}; // placeholder — pengaturan SQLite menyusul
  await import("./game.js");
}
