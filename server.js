"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { pipeline } = require("node:stream/promises");
const { WebSocket, WebSocketServer } = require("ws");
const {
  getGameSettings,
  saveGameSettings,
  getGameGiftCatalog,
  saveGameGiftCatalog
} = require("./shared/game-settings-store");
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
const LISTENER_SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LISTENER_SESSION_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ANIMATION_VIDEO_BYTES = 100 * 1024 * 1024;
const ANIMATION_VIDEO_EXTENSIONS = new Set([".mp4", ".webm"]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const listenerSessions = new Map();

const httpServer = http.createServer(handleRequest);
const websocketServer = new WebSocketServer({ noServer: true });

websocketServer.on("connection", (client) => {
  const heartbeat = setInterval(() => {
    if (client.readyState === WebSocket.OPEN) client.ping();
  }, 30000);
  client.on("pong", () => {
    const session = listenerSessions.get(client.listenerSessionId);
    if (session) session.lastSeenAt = Date.now();
  });
  client.on("close", () => clearInterval(heartbeat));
});

const listenerSessionCleanup = setInterval(() => {
  const expiredBefore = Date.now() - LISTENER_SESSION_IDLE_TTL_MS;
  for (const [sessionId, session] of listenerSessions) {
    if (session.lastSeenAt >= expiredBefore) continue;
    if (session.connection) void session.connection.disconnect().catch(() => {});
    for (const client of websocketServer.clients) {
      if (client.listenerSessionId === sessionId) client.close(1001, "Listener session expired");
    }
    listenerSessions.delete(sessionId);
  }
}, 10 * 60 * 1000);
listenerSessionCleanup.unref();

function createDisconnectedStatus() {
  return {
    status: "disconnected",
    username: "",
    message: "Masukkan username TikTok yang sedang LIVE.",
    error: "",
    roomId: "",
    giftCatalogStatus: "unavailable",
    giftCatalogCount: 0,
    updatedAt: Date.now()
  };
}

function getListenerSession(sessionId) {
  const normalizedId = String(sessionId || "");
  if (!LISTENER_SESSION_ID_PATTERN.test(normalizedId)) throw new Error("ID sesi listener tidak valid.");
  let session = listenerSessions.get(normalizedId);
  if (!session) {
    session = {
      id: normalizedId,
      connection: null,
      giftCatalog: [],
      status: createDisconnectedStatus(),
      lastSeenAt: Date.now()
    };
    listenerSessions.set(normalizedId, session);
  }
  session.lastSeenAt = Date.now();
  return session;
}

function getListenerSessionFromUrl(requestUrl) {
  return getListenerSession(requestUrl.searchParams.get("sessionId"));
}

function requireListenerSession(requestUrl, response) {
  try { return getListenerSessionFromUrl(requestUrl); }
  catch (error) {
    sendJson(response, 400, { error: error.message });
    return null;
  }
}

function setSessionStatus(session, nextStatus, message, error = "") {
  session.status = {
    ...session.status,
    status: nextStatus,
    message,
    error,
    updatedAt: Date.now()
  };
  session.lastSeenAt = Date.now();
  return session.status;
}

function clearGiftCatalog(session) {
  session.giftCatalog = [];
  session.status = { ...session.status, giftCatalogStatus: "unavailable", giftCatalogCount: 0 };
}

httpServer.on("upgrade", (request, socket, head) => {
  let pathname;
  let session;
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    pathname = requestUrl.pathname;
    if (pathname !== "/tiktok") { socket.destroy(); return; }
    session = getListenerSessionFromUrl(requestUrl);
  }
  catch { socket.destroy(); return; }
  websocketServer.handleUpgrade(request, socket, head, (client) => {
    client.listenerSessionId = session.id;
    client.on("close", () => { session.lastSeenAt = Date.now(); });
    session.lastSeenAt = Date.now();
    websocketServer.emit("connection", client, request);
  });
});

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

async function handleGameSettingsRequest(request, response, gameId, listenerSession = null) {
  if (!fs.existsSync(path.join(ROOT, "games", gameId, "index.html"))) {
    return sendJson(response, 404, { error: "Game tidak ditemukan." });
  }
  if (request.method !== "GET" && request.method !== "PUT") {
    response.writeHead(405, { Allow: "GET, PUT" });
    response.end("Method Not Allowed");
    return;
  }
  let username;
  const settingsUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const hasRequestedUsername = settingsUrl.searchParams.has("username");
  const requestedUsername = settingsUrl.searchParams.get("username");
  try {
    if (hasRequestedUsername) username = cleanUsername(requestedUsername);
    else if (listenerSession?.status.status === "connected" && listenerSession.status.username) username = cleanUsername(listenerSession.status.username);
    else return sendJson(response, 400, { error: "Username TikTok diperlukan untuk membuka pengaturan saat tidak terhubung." });
  } catch { return sendJson(response, 400, { error: "Username TikTok tidak valid." }); }

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

function animationVideoDirectory() {
  return path.join(ROOT, "games", "faction-war", "data", "videos");
}

function animationVideoFilename(username, extension) {
  return `${cleanUsername(username).toLowerCase()}${extension}`;
}

async function listAnimationVideos(usernameFilter = "") {
  const directory = animationVideoDirectory();
  await fs.promises.mkdir(directory, { recursive: true });
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const videos = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    if (!ANIMATION_VIDEO_EXTENSIONS.has(extension)) continue;
    const username = path.basename(entry.name, extension);
    try { cleanUsername(username); }
    catch { continue; }
    if (usernameFilter && username.toLowerCase() !== usernameFilter.toLowerCase()) continue;
    const info = await fs.promises.stat(path.join(directory, entry.name));
    videos.push({
      username,
      filename: entry.name,
      url: `/games/faction-war/data/videos/${encodeURIComponent(entry.name)}`,
      size: info.size,
      updatedAt: info.mtime.toISOString()
    });
  }
  return videos.sort((a, b) => a.username.localeCompare(b.username));
}

async function writeAnimationUpload(request, tempPath) {
  const handle = await fs.promises.open(tempPath, "wx", 0o600);
  let size = 0;
  let tooLarge = false;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_ANIMATION_VIDEO_BYTES) {
        tooLarge = true;
        continue;
      }
      let offset = 0;
      while (offset < chunk.length) {
        const result = await handle.write(chunk, offset, chunk.length - offset, null);
        offset += result.bytesWritten;
      }
    }
    if (tooLarge) {
      const error = new Error("Ukuran video maksimal 100 MB.");
      error.statusCode = 413;
      throw error;
    }
    if (!size) {
      const error = new Error("File video kosong.");
      error.statusCode = 400;
      throw error;
    }
    await handle.sync();
    return size;
  } finally {
    await handle.close();
  }
}

async function handleAnimationVideoRequest(request, response, requestUrl) {
  if (request.method !== "GET" && request.method !== "POST" && request.method !== "DELETE") {
    response.writeHead(405, { Allow: "GET, POST, DELETE" });
    response.end("Method Not Allowed");
    return;
  }

  try {
    if (request.method === "GET") {
      let usernameFilter = "";
      if (requestUrl.searchParams.has("username")) {
        try { usernameFilter = cleanUsername(requestUrl.searchParams.get("username")); }
        catch (error) { return sendJson(response, 400, { error: error.message }); }
      }
      return sendJson(response, 200, { videos: await listAnimationVideos(usernameFilter) });
    }

    let username;
    try { username = cleanUsername(requestUrl.searchParams.get("username")); }
    catch (error) { return sendJson(response, 400, { error: error.message }); }
    const directory = animationVideoDirectory();
    await fs.promises.mkdir(directory, { recursive: true });
    const candidates = [...ANIMATION_VIDEO_EXTENSIONS].map((extension) => path.join(directory, animationVideoFilename(username, extension)));

    if (request.method === "DELETE") {
      let removed = false;
      for (const filePath of candidates) {
        try { await fs.promises.unlink(filePath); removed = true; }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      return removed
        ? sendJson(response, 200, { deleted: true, username })
        : sendJson(response, 404, { error: "Video animasi untuk username ini tidak ditemukan." });
    }

    const originalName = path.basename(String(requestUrl.searchParams.get("filename") || ""));
    const extension = path.extname(originalName).toLowerCase();
    if (!ANIMATION_VIDEO_EXTENSIONS.has(extension)) {
      return sendJson(response, 415, { error: "Format video harus MP4 atau WebM." });
    }
    const contentType = String(request.headers["content-type"] || "").split(";")[0].toLowerCase();
    const requiredType = MIME_TYPES[extension];
    if (contentType && contentType !== requiredType && contentType !== "application/octet-stream") {
      return sendJson(response, 415, { error: "Jenis file tidak cocok dengan format video." });
    }
    const declaredLength = Number(request.headers["content-length"] || 0);
    if (declaredLength > MAX_ANIMATION_VIDEO_BYTES) {
      request.resume();
      return sendJson(response, 413, { error: "Ukuran video maksimal 100 MB." });
    }

    const tempPath = path.join(directory, `.upload-${randomUUID()}.tmp`);
    let size;
    try { size = await writeAnimationUpload(request, tempPath); }
    catch (error) {
      await fs.promises.rm(tempPath, { force: true });
      return sendJson(response, error.statusCode || 400, { error: error.message || "Upload video gagal." });
    }

    const targetPath = path.join(directory, animationVideoFilename(username, extension));
    try {
      await fs.promises.rename(tempPath, targetPath);
      for (const otherPath of candidates) {
        if (otherPath === targetPath) continue;
        try { await fs.promises.unlink(otherPath); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    } catch (error) {
      await fs.promises.rm(tempPath, { force: true });
      throw error;
    }

    return sendJson(response, 201, {
      uploaded: true,
      username: username.toLowerCase(),
      filename: path.basename(targetPath),
      url: `/games/faction-war/data/videos/${encodeURIComponent(path.basename(targetPath))}`,
      size
    });
  } catch (error) {
    console.error("Gagal mengelola video animasi Faction War:", error.message);
    return sendJson(response, 500, { error: "Video animasi gagal diproses." });
  }
}

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname.startsWith("/api/")) {
    if (requestUrl.pathname === "/api/games/faction-war/animation-videos") {
      return handleAnimationVideoRequest(request, response, requestUrl);
    }
    const gameSettingsMatch = requestUrl.pathname.match(/^\/api\/games\/([a-z0-9]+(?:-[a-z0-9]+)*)\/settings$/);
    if (gameSettingsMatch) {
      let listenerSession = null;
      if (requestUrl.searchParams.has("sessionId")) {
        listenerSession = requireListenerSession(requestUrl, response);
        if (!listenerSession) return;
      }
      return handleGameSettingsRequest(request, response, gameSettingsMatch[1], listenerSession);
    }
    if (requestUrl.pathname === "/api/tiktok/status" && request.method === "GET") {
      const listenerSession = requireListenerSession(requestUrl, response);
      if (!listenerSession) return;
      return sendJson(response, 200, listenerSession.status);
    }
    if (requestUrl.pathname === "/api/tiktok/gifts" && request.method === "GET") {
      const listenerSession = requireListenerSession(requestUrl, response);
      if (!listenerSession) return;
      const gameId = requestUrl.searchParams.get("game") || "faction-war";
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(gameId) || !fs.existsSync(path.join(ROOT, "games", gameId, "index.html"))) {
        return sendJson(response, 404, { error: "Game tidak ditemukan." });
      }

      const hasRequestedUsername = requestUrl.searchParams.has("username");
      let requestedUsername = "";
      try {
        if (hasRequestedUsername) requestedUsername = cleanUsername(requestUrl.searchParams.get("username"));
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }

      let liveUsername = "";
      try {
        if (listenerSession.status.status === "connected" && listenerSession.status.username) liveUsername = cleanUsername(listenerSession.status.username);
      } catch { /* Invalid listener state cannot be used for settings lookup. */ }
      const liveCatalogReady = Boolean(liveUsername && listenerSession.status.giftCatalogStatus === "ready" && listenerSession.giftCatalog.length);
      const requestedIsLiveAccount = !hasRequestedUsername
        || requestedUsername.toLowerCase() === liveUsername.toLowerCase();

      if (liveCatalogReady && requestedIsLiveAccount) {
        try { saveGameGiftCatalog(ROOT, gameId, liveUsername, listenerSession.giftCatalog); }
        catch (error) { console.error(`Gagal menyimpan katalog gift untuk game ${gameId}:`, error.message); }
        return sendJson(response, 200, {
          status: "ready",
          source: "live",
          username: liveUsername,
          gameSessionId: listenerSession.status.gameSessionId || "",
          giftCount: listenerSession.giftCatalog.length,
          gifts: listenerSession.giftCatalog
        });
      }

      const canUseSavedCatalog = hasRequestedUsername
        && (!liveUsername || requestedUsername.toLowerCase() !== liveUsername.toLowerCase());
      if (canUseSavedCatalog) {
        try {
          const cachedCatalog = getGameGiftCatalog(ROOT, gameId, requestedUsername);
          if (cachedCatalog && Array.isArray(cachedCatalog.gifts) && cachedCatalog.gifts.length) {
            return sendJson(response, 200, {
              status: "ready",
              source: "saved",
              username: requestedUsername,
              giftCount: cachedCatalog.gifts.length,
              gifts: cachedCatalog.gifts,
              updatedAt: cachedCatalog.updatedAt
            });
          }
        } catch (error) {
          console.error(`Gagal membaca katalog gift untuk game ${gameId}:`, error.message);
          return sendJson(response, 500, { error: "Katalog gift tersimpan gagal dibaca." });
        }
      }

      return sendJson(response, 200, {
        status: listenerSession.status.status === "connected" ? listenerSession.status.giftCatalogStatus || "unavailable" : "unavailable",
        source: "none",
        username: requestedUsername || liveUsername || "",
        gameSessionId: listenerSession.status.gameSessionId || "",
        giftCount: 0,
        gifts: []
      });
    }
    if (requestUrl.pathname === "/api/tiktok/connect" && request.method === "POST") {
      const listenerSession = requireListenerSession(requestUrl, response);
      if (!listenerSession) return;
      let body;
      let username;
      try {
        body = await readJson(request);
        username = cleanUsername(body.username);
      } catch (error) {
        return sendJson(response, 400, { ...listenerSession.status, error: error.message });
      }
      if (listenerSession.status.status === "connected") {
        return sendJson(response, 409, { ...listenerSession.status, error: "Listener sudah terhubung. Putuskan akun saat ini untuk menggantinya." });
      }
      if (STATUS_IN_PROGRESS.has(listenerSession.status.status)) {
        return sendJson(response, 409, { ...listenerSession.status, error: "Proses koneksi masih berjalan." });
      }
      try { startConnection(listenerSession, username); }
      catch (error) {
        return sendJson(response, 400, {
          ...listenerSession.status,
          status: "error",
          username,
          message: "Username tidak dapat diproses.",
          error: error.message || "Masukkan username TikTok yang valid."
        });
      }
      return sendJson(response, 202, listenerSession.status);
    }
    if (requestUrl.pathname === "/api/tiktok/disconnect" && request.method === "POST") {
      const listenerSession = requireListenerSession(requestUrl, response);
      if (!listenerSession) return;
      if (STATUS_IN_PROGRESS.has(listenerSession.status.status)) {
        return sendJson(response, 409, { ...listenerSession.status, error: "Tunggu proses koneksi selesai sebelum mengganti akun." });
      }
      const current = listenerSession.connection;
      if (!current) {
        setSessionStatus(listenerSession, "disconnected", "Listener terputus.");
        clearGiftCatalog(listenerSession);
        listenerSession.status = { ...listenerSession.status, username: "", roomId: "" };
        return sendJson(response, 200, listenerSession.status);
      }
      setSessionStatus(listenerSession, "disconnecting", "Memutuskan koneksi TikTok LIVE…");
      try { await current.disconnect(); }
      catch (error) { console.warn("Gagal menutup koneksi TikTok dengan rapi:", error.message); }
      if (listenerSession.connection === current) listenerSession.connection = null;
      setSessionStatus(listenerSession, "disconnected", "Koneksi diputus. Masukkan username untuk menghubungkan akun lain.");
      clearGiftCatalog(listenerSession);
      listenerSession.status = { ...listenerSession.status, username: "", roomId: "" };
      return sendJson(response, 200, listenerSession.status);
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
    const extension = path.extname(target).toLowerCase();
    const contentType = MIME_TYPES[extension] || "application/octet-stream";
    const isVideo = extension === ".mp4" || extension === ".webm";
    const rangeHeader = request.headers.range;
    if (isVideo && rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match || (!match[1] && !match[2])) {
        response.writeHead(416, { "Content-Range": `bytes */${targetInfo.size}` });
        return response.end();
      }
      const start = match[1] ? Number(match[1]) : Math.max(0, targetInfo.size - Number(match[2]));
      const end = match[2] && match[1] ? Number(match[2]) : targetInfo.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end >= targetInfo.size) {
        response.writeHead(416, { "Content-Range": `bytes */${targetInfo.size}` });
        return response.end();
      }
      response.writeHead(206, {
        "Content-Type": contentType,
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${targetInfo.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache"
      });
      if (request.method === "HEAD") return response.end();
      await pipeline(fs.createReadStream(target, { start, end }), response);
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": targetInfo.size,
      ...(isVideo ? { "Accept-Ranges": "bytes" } : {}),
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

function startConnection(listenerSession, username) {
  const liveConnection = new SiberLiveConnection(username, {
    signApiKey: process.env.SIGN_API_KEY,
    signApiUrl: process.env.SIGN_API_URL,
    enableExtendedGiftInfo: true
  });
  const gameSessionId = randomUUID();
  listenerSession.giftCatalog = [];
  listenerSession.connection = liveConnection;
  listenerSession.status = {
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
    console.warn(`[Siber Live @${liveConnection.uniqueId}] ${info}:`, exception?.message || "Unknown error");
  });
  liveConnection.on(ControlEvent.DISCONNECTED, ({ code, reason }) => {
    if (listenerSession.connection !== liveConnection || listenerSession.status.status === "disconnecting") return;
    setSessionStatus(listenerSession, "disconnected", `Koneksi LIVE terputus${code ? ` (${code})` : ""}${reason ? `: ${String(reason)}` : ""}.`);
    clearGiftCatalog(listenerSession);
  });
  liveConnection.on(WebcastEvent.STREAM_END, () => {
    if (listenerSession.connection === liveConnection) {
      setSessionStatus(listenerSession, "disconnected", `Siaran LIVE @${liveConnection.uniqueId} telah berakhir.`);
      clearGiftCatalog(listenerSession);
    }
  });

  liveConnection.on(WebcastEvent.CHAT, (data) => {
    const user = normalizeUser(data.user);
    broadcastEvent(listenerSession, {
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
    broadcastEvent(listenerSession, {
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
    broadcastEvent(listenerSession, {
      eventType: "like",
      username: user.uniqueId || user.nickname,
      userId: user.userId || user.secUid,
      avatarUrl: user.avatarUrl,
      likeCount: data.count,
      timestamp: Date.now()
    });
  });
  liveConnection.on(WebcastEvent.FOLLOW, (data) => broadcastUserEvent(listenerSession, "follow", data));
  liveConnection.on(WebcastEvent.SHARE, (data) => broadcastUserEvent(listenerSession, "share", data));
  liveConnection.on(WebcastEvent.MEMBER, (data) => broadcastUserEvent(listenerSession, "join", data));

  void (async () => {
    try {
      const roomId = await liveConnection.fetchRoomId();
      if (listenerSession.connection !== liveConnection) return;
      if (!roomId) throw new Error("Room LIVE tidak ditemukan.");
      listenerSession.status = {
        ...listenerSession.status,
        status: "connecting",
        roomId: String(roomId),
        message: `Room ditemukan. Memuat katalog gift dan menghubungkan LIVE @${liveConnection.uniqueId}…`,
        updatedAt: Date.now()
      };
      await liveConnection.connect(roomId);
      if (listenerSession.connection !== liveConnection) return;
      listenerSession.giftCatalog = normalizeGiftCatalog(liveConnection.availableGifts);
      if (listenerSession.giftCatalog.length) {
        try { saveGameGiftCatalog(ROOT, "faction-war", liveConnection.uniqueId, listenerSession.giftCatalog); }
        catch (error) { console.error("Gagal menyimpan katalog gift Faction War:", error.message); }
      }
      listenerSession.status = {
        ...listenerSession.status,
        giftCatalogStatus: listenerSession.giftCatalog.length ? "ready" : "failed",
        giftCatalogCount: listenerSession.giftCatalog.length
      };
      const giftMessage = listenerSession.giftCatalog.length
        ? `${listenerSession.giftCatalog.length} gift tersedia di pengaturan.`
        : "Katalog gift gagal dimuat; mode gift tidak tersedia.";
      setSessionStatus(listenerSession, "connected", `Terhubung ke LIVE @${liveConnection.uniqueId}. ${giftMessage}`);
    } catch (error) {
      if (listenerSession.connection !== liveConnection) return;
      console.warn(`[Siber Live] Koneksi @${liveConnection.uniqueId} gagal:`, error.message);
      listenerSession.giftCatalog = [];
      setSessionStatus(listenerSession, "error", "Koneksi ke TikTok LIVE gagal.", error.message || "Periksa username dan status siaran LIVE.");
      listenerSession.status = { ...listenerSession.status, giftCatalogStatus: "failed", giftCatalogCount: 0 };
      listenerSession.connection = null;
    }
  })();
}

function broadcastUserEvent(listenerSession, eventType, data) {
  const user = normalizeUser(data.user);
  broadcastEvent(listenerSession, {
    eventType,
    username: user.uniqueId || user.nickname,
    userId: user.userId || user.secUid,
    avatarUrl: user.avatarUrl,
    timestamp: Date.now()
  });
}

function broadcastEvent(listenerSession, event) {
  const payload = JSON.stringify(event);
  for (const client of websocketServer.clients) {
    if (client.listenerSessionId === listenerSession.id && client.readyState === WebSocket.OPEN) client.send(payload);
  }
  listenerSession.lastSeenAt = Date.now();
}

httpServer.listen(PORT, HOST, () => {
  const browserHost = HOST === "0.0.0.0" || HOST === "::" ? "localhost" : HOST;
  const appUrl = process.env.APP_URL || `http://${browserHost}:${PORT}`;
  console.log(`Game Hub tersedia di ${appUrl}`);
  console.log("WebSocket event TikTok tersedia per listener session di /tiktok?sessionId=…");
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
  for (const listenerSession of listenerSessions.values()) {
    if (!listenerSession.connection) continue;
    try { await listenerSession.connection.disconnect(); }
    catch { /* process is exiting */ }
  }
  websocketServer.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
