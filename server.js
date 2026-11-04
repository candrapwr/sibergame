"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { WebSocket, WebSocketServer } = require("ws");
const { getGameSettings, saveGameSettings } = require("./shared/game-settings-store");
const {
  SiberLiveConnection,
  WebcastEvent,
  ControlEvent,
  normalizeUser
} = require("./shared/tiktok/siber-live");

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 8050;
const STATUS_IN_PROGRESS = new Set(["room_lookup", "connecting", "disconnecting"]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

let connection = null;
let giftCatalog = [];
let status = {
  status: "disconnected",
  username: "",
  message: "Masukkan username TikTok yang sedang LIVE.",
  error: "",
  roomId: "",
  giftCatalogStatus: "unavailable",
  giftCatalogCount: 0,
  updatedAt: Date.now()
};

const httpServer = http.createServer(handleRequest);
const websocketServer = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (request, socket, head) => {
  let pathname;
  try { pathname = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname; }
  catch { socket.destroy(); return; }
  if (pathname !== "/tiktok") { socket.destroy(); return; }
  websocketServer.handleUpgrade(request, socket, head, (client) => {
    websocketServer.emit("connection", client, request);
  });
});

function setStatus(nextStatus, message, error = "") {
  status = {
    ...status,
    status: nextStatus,
    message,
    error,
    updatedAt: Date.now()
  };
  return status;
}

function clearGiftCatalog() {
  giftCatalog = [];
  status = { ...status, giftCatalogStatus: "unavailable", giftCatalogCount: 0 };
}

function sendJson(response, code, body) {
  const payload = JSON.stringify(body);
  response.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload)
  });
  response.end(payload);
}

async function readJson(request, maxLength = 4096) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxLength) throw new Error("Permintaan terlalu besar.");
  }
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new Error("Format permintaan tidak valid."); }
}

function cleanUsername(value) {
  const username = String(value || "").trim().replace(/^@+/, "");
  if (!/^[a-zA-Z0-9._]{1,50}$/.test(username)) {
    throw new Error("Masukkan username TikTok yang valid, tanpa URL atau spasi.");
  }
  return username;
}

function normalizeGiftCatalog(gifts) {
  if (!Array.isArray(gifts)) return [];
  return gifts.map((gift) => {
    const iconCandidates = [gift?.icon?.url_list, gift?.image?.url_list].flatMap((urls) => Array.isArray(urls) ? urls : []);
    let iconUrl = "";
    for (const candidate of iconCandidates) {
      try {
        const parsed = new URL(String(candidate));
        if (parsed.protocol === "https:" && parsed.hostname.endsWith(".tiktokcdn.com")) {
          iconUrl = parsed.href;
          break;
        }
      } catch { /* Skip invalid image URLs. */ }
    }
    const rawDiamondCount = Number(gift?.diamondCount ?? gift?.diamond_count ?? 0);
    return {
      id: String(gift?.id ?? gift?.giftId ?? "").trim(),
      name: String(gift?.name ?? gift?.giftName ?? "").trim(),
      diamondCount: Number.isFinite(rawDiamondCount) ? Math.max(0, Math.floor(rawDiamondCount)) : 0,
      iconUrl
    };
  }).filter((gift) => gift.id && gift.name);
}

async function handleGameSettingsRequest(request, response, gameId) {
  if (!fs.existsSync(path.join(ROOT, "games", gameId, "index.html"))) {
    return sendJson(response, 404, { error: "Game tidak ditemukan." });
  }
  if (request.method !== "GET" && request.method !== "PUT") {
    response.writeHead(405, { Allow: "GET, PUT" });
    response.end("Method Not Allowed");
    return;
  }
  if (status.status !== "connected" || !status.username) {
    return sendJson(response, 409, { error: "Hubungkan akun TikTok LIVE sebelum memuat atau menyimpan pengaturan." });
  }

  let username;
  try { username = cleanUsername(status.username); }
  catch { return sendJson(response, 409, { error: "Username akun LIVE yang tersambung tidak valid." }); }

  try {
    if (request.method === "GET") {
      const record = getGameSettings(ROOT, gameId, username);
      return sendJson(response, 200, {
        username,
        found: Boolean(record),
        settings: record?.settings || null,
        updatedAt: record?.updatedAt || null
      });
    }

    let body;
    try { body = await readJson(request, 65536); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
    if (!body || typeof body !== "object" || !body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) {
      return sendJson(response, 400, { error: "Format pengaturan game tidak valid." });
    }
    const serializedSettings = JSON.stringify(body.settings);
    if (Buffer.byteLength(serializedSettings) > 65536) {
      return sendJson(response, 413, { error: "Data pengaturan game terlalu besar." });
    }
    const updatedAt = saveGameSettings(ROOT, gameId, username, body.settings);
    return sendJson(response, 200, { saved: true, username, updatedAt });
  } catch (error) {
    console.error(`Gagal mengakses pengaturan SQLite untuk game ${gameId}:`, error.message);
    return sendJson(response, 500, { error: "Pengaturan game gagal dibaca atau disimpan." });
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname.startsWith("/api/")) {
    const gameSettingsMatch = requestUrl.pathname.match(/^\/api\/games\/([a-z0-9]+(?:-[a-z0-9]+)*)\/settings$/);
    if (gameSettingsMatch) return handleGameSettingsRequest(request, response, gameSettingsMatch[1]);
    if (requestUrl.pathname === "/api/tiktok/status" && request.method === "GET") {
      return sendJson(response, 200, status);
    }
    if (requestUrl.pathname === "/api/tiktok/gifts" && request.method === "GET") {
      const ready = status.status === "connected" && status.giftCatalogStatus === "ready";
      return sendJson(response, 200, {
        status: status.giftCatalogStatus || "unavailable",
        username: status.username || "",
        gameSessionId: status.gameSessionId || "",
        giftCount: status.giftCatalogCount || 0,
        gifts: ready ? giftCatalog : []
      });
    }
    if (requestUrl.pathname === "/api/tiktok/connect" && request.method === "POST") {
      let body;
      let username;
      try {
        body = await readJson(request);
        username = cleanUsername(body.username);
      } catch (error) {
        return sendJson(response, 400, { ...status, error: error.message });
      }
      if (status.status === "connected") {
        return sendJson(response, 409, { ...status, error: "Listener sudah terhubung. Putuskan akun saat ini untuk menggantinya." });
      }
      if (STATUS_IN_PROGRESS.has(status.status)) {
        return sendJson(response, 409, { ...status, error: "Proses koneksi masih berjalan." });
      }
      try { startConnection(username); }
      catch (error) {
        return sendJson(response, 400, {
          ...status,
          status: "error",
          username,
          message: "Username tidak dapat diproses.",
          error: error.message || "Masukkan username TikTok yang valid."
        });
      }
      return sendJson(response, 202, status);
    }
    if (requestUrl.pathname === "/api/tiktok/disconnect" && request.method === "POST") {
      if (STATUS_IN_PROGRESS.has(status.status)) {
        return sendJson(response, 409, { ...status, error: "Tunggu proses koneksi selesai sebelum mengganti akun." });
      }
      const current = connection;
      if (!current) {
        setStatus("disconnected", "Listener terputus.");
        clearGiftCatalog();
        status = { ...status, username: "", roomId: "" };
        return sendJson(response, 200, status);
      }
      setStatus("disconnecting", "Memutuskan koneksi TikTok LIVE…");
      try { await current.disconnect(); }
      catch (error) { console.warn("Gagal menutup koneksi TikTok dengan rapi:", error.message); }
      if (connection === current) connection = null;
      setStatus("disconnected", "Koneksi diputus. Masukkan username untuk menghubungkan akun lain.");
      clearGiftCatalog();
      status = { ...status, username: "", roomId: "" };
      return sendJson(response, 200, status);
    }
    return sendJson(response, 404, { error: "Endpoint tidak ditemukan." });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method Not Allowed");
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(requestUrl.pathname); }
  catch {
    response.writeHead(400);
    response.end("Bad Request");
    return;
  }
  const filePath = path.resolve(ROOT, `.${pathname === "/" ? "/index.html" : pathname}`);
  const relativePath = path.relative(ROOT, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  const pathParts = relativePath.split(path.sep);
  const privatePath = pathParts.some((part) => part.startsWith(".") || part === "node_modules")
    || ["server.js", "package.json", "package-lock.json", "README.md"].includes(path.basename(filePath));
  if (privatePath) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }
  if (!MIME_TYPES[path.extname(filePath).toLowerCase()]) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }

  try {
    const info = await fs.promises.stat(filePath);
    const target = info.isDirectory() ? path.join(filePath, "index.html") : filePath;
    const targetInfo = await fs.promises.stat(target);
    if (!targetInfo.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": targetInfo.size,
      "Cache-Control": "no-cache"
    });
    if (request.method === "HEAD") return response.end();
    await pipeline(fs.createReadStream(target), response);
  } catch {
    if (!response.headersSent) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
    } else {
      response.destroy();
    }
  }
}

function startConnection(username) {
  const liveConnection = new SiberLiveConnection(username, {
    signApiKey: process.env.SIGN_API_KEY,
    signApiUrl: process.env.SIGN_API_URL,
    enableExtendedGiftInfo: true
  });
  const gameSessionId = randomUUID();
  giftCatalog = [];
  connection = liveConnection;
  status = {
    status: "room_lookup",
    gameSessionId,
    giftCatalogStatus: "loading",
    giftCatalogCount: 0,
    username: liveConnection.uniqueId,
    message: `Mencari siaran LIVE @${liveConnection.uniqueId}…`,
    error: "",
    roomId: "",
    updatedAt: Date.now()
  };

  liveConnection.on(ControlEvent.ERROR, ({ info, exception }) => {
    console.warn(`[Siber Live] ${info}:`, exception?.message || "Unknown error");
  });
  liveConnection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
    if (connection !== liveConnection || status.status === "disconnecting") return;
    setStatus("disconnected", `Koneksi LIVE terputus${code ? ` (${code})` : ""}${reason ? `: ${String(reason)}` : ""}.`);
    clearGiftCatalog();
  });
  liveConnection.on(WebcastEvent.STREAM_END, () => {
    if (connection === liveConnection) {
      setStatus("disconnected", `Siaran LIVE @${liveConnection.uniqueId} telah berakhir.`);
      clearGiftCatalog();
    }
  });

  liveConnection.on(WebcastEvent.CHAT, (data) => {
    const user = normalizeUser(data.user);
    broadcastEvent({
      eventType: "comment",
      username: user.uniqueId || user.nickname,
      userId: user.userId || user.secUid,
      avatarUrl: user.avatarUrl,
      comment: data.content,
      timestamp: Date.now()
    });
  });
  liveConnection.on(WebcastEvent.GIFT, (data) => {
    if (Number(data.gift?.type) === 1 && !data.repeatEnd) return;
    const user = normalizeUser(data.user);
    broadcastEvent({
      eventType: "gift",
      username: user.uniqueId || user.nickname,
      userId: user.userId || user.secUid,
      avatarUrl: user.avatarUrl,
      giftName: data.gift?.name || data.extendedGiftInfo?.name,
      giftId: data.giftId || data.gift?.id,
      giftCount: data.repeatCount || 1,
      coinValue: data.extendedGiftInfo?.diamondCount ?? data.gift?.diamondCount ?? 0,
      timestamp: Date.now()
    });
  });
  liveConnection.on(WebcastEvent.LIKE, (data) => {
    const user = normalizeUser(data.user);
    broadcastEvent({
      eventType: "like",
      username: user.uniqueId || user.nickname,
      userId: user.userId || user.secUid,
      avatarUrl: user.avatarUrl,
      likeCount: data.count,
      timestamp: Date.now()
    });
  });
  liveConnection.on(WebcastEvent.FOLLOW, (data) => broadcastUserEvent("follow", data));
  liveConnection.on(WebcastEvent.SHARE, (data) => broadcastUserEvent("share", data));
  liveConnection.on(WebcastEvent.MEMBER, (data) => broadcastUserEvent("join", data));

  void (async () => {
    try {
      const roomId = await liveConnection.fetchRoomId();
      if (connection !== liveConnection) return;
      if (!roomId) throw new Error("Room LIVE tidak ditemukan.");
      status = {
        ...status,
        status: "connecting",
        roomId: String(roomId),
        message: `Room ditemukan. Memuat katalog gift dan menghubungkan LIVE @${liveConnection.uniqueId}…`,
        updatedAt: Date.now()
      };
      await liveConnection.connect(roomId);
      if (connection !== liveConnection) return;
      giftCatalog = normalizeGiftCatalog(liveConnection.availableGifts);
      status = {
        ...status,
        giftCatalogStatus: giftCatalog.length ? "ready" : "failed",
        giftCatalogCount: giftCatalog.length
      };
      const giftMessage = giftCatalog.length
        ? `${giftCatalog.length} gift tersedia di pengaturan.`
        : "Katalog gift gagal dimuat; mode gift tidak tersedia.";
      setStatus("connected", `Terhubung ke LIVE @${liveConnection.uniqueId}. ${giftMessage}`);
    } catch (error) {
      if (connection !== liveConnection) return;
      console.warn(`[Siber Live] Koneksi @${liveConnection.uniqueId} gagal:`, error.message);
      giftCatalog = [];
      setStatus("error", "Koneksi ke TikTok LIVE gagal.", error.message || "Periksa username dan status siaran LIVE.");
      status = { ...status, giftCatalogStatus: "failed", giftCatalogCount: 0 };
      connection = null;
    }
  })();
}

function broadcastUserEvent(eventType, data) {
  const user = normalizeUser(data.user);
  broadcastEvent({
    eventType,
    username: user.uniqueId || user.nickname,
    userId: user.userId || user.secUid,
    avatarUrl: user.avatarUrl,
    timestamp: Date.now()
  });
}

function broadcastEvent(event) {
  const payload = JSON.stringify(event);
  for (const client of websocketServer.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

httpServer.listen(PORT, HOST, () => {
  const browserHost = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
  const appUrl = process.env.APP_URL || `http://${browserHost}:${PORT}`;
  console.log(`Game Hub tersedia di ${appUrl}`);
  console.log("WebSocket event TikTok tersedia di /tiktok setelah koneksi LIVE berhasil.");
  if (process.env.OPEN_BROWSER === "true") openAppInBrowser(appUrl);
});

function openAppInBrowser(url) {
  let command;
  let args;
  if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const browser = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  browser.on("error", () => {
    console.log(`Buka ${url} di browser untuk mulai menggunakan Game Hub.`);
  });
  browser.unref();
}

async function shutdown() {
  if (connection) {
    try { await connection.disconnect(); }
    catch { /* process is exiting */ }
  }
  websocketServer.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
