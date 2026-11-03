import { requireConnectedTikTok } from "../../shared/tiktok/game-entry.js";

const endpoint = await requireConnectedTikTok();
if (endpoint) {
  window.tiktokListenerEndpoint = endpoint;
  try {
    const response = await fetch("/api/tiktok/gifts", { cache: "no-store" });
    const catalog = response.ok ? await response.json() : null;
    window.tiktokGiftCatalog = Array.isArray(catalog?.gifts) ? catalog.gifts : [];
    window.tiktokGiftCatalogStatus = catalog?.status === "ready" && window.tiktokGiftCatalog.length ? "ready" : "failed";
  } catch {
    window.tiktokGiftCatalog = [];
    window.tiktokGiftCatalogStatus = "failed";
  }
  await import("./game.js");
}
