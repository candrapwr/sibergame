import { beginGameSession } from "../game-session.js";

const panel = document.getElementById("connection-panel");
const form = document.getElementById("connection-form");
const usernameInput = document.getElementById("tiktok-username");
const connectButton = document.getElementById("connect-button");
const library = document.getElementById("game-library");
const connectionTitle = document.getElementById("connection-title");
const connectionCopy = document.getElementById("connection-copy");
const statusTitle = document.getElementById("connection-status-title");
const statusMessage = document.getElementById("connection-status-message");
const errorMessage = document.getElementById("connection-error");
const readyPanel = document.getElementById("connection-ready");
const connectedUsername = document.getElementById("connected-username");
const changeAccountButton = document.getElementById("change-account-button");
let pollTimer = null;

const inProgressStates = new Set(["room_lookup", "connecting", "disconnecting"]);
const stepOrder = ["account", "room", "socket"];

function openGameSettings() {
  const selectedUsername = panel.dataset.connectionState === "connected"
    ? connectedUsername.dataset.username || usernameInput.value
    : usernameInput.value;
  const username = selectedUsername.trim().replace(/^@+/, "");
  if (!/^[a-zA-Z0-9._]{1,50}$/.test(username)) {
    errorMessage.textContent = "Masukkan username TikTok yang valid untuk membuka pengaturan akun tersebut.";
    errorMessage.hidden = false;
    usernameInput.focus();
    return;
  }

  errorMessage.hidden = true;
  const target = new URL("/games/faction-war/index.html", window.location.origin);
  target.searchParams.set("settingsOnly", "1");
  target.searchParams.set("username", username);
  const width = window.screen.availWidth || 1440;
  const height = window.screen.availHeight || 900;
  const features = [
    "popup=yes", "toolbar=no", "location=no", "menubar=no", "status=no", "scrollbars=no", "resizable=yes",
    `width=${width}`, `height=${height}`, "left=0", "top=0"
  ].join(",");
  const gameWindow = window.open(target.href, `game-settings-faction-war-${username.toLowerCase()}`, features);
  if (gameWindow) gameWindow.focus();
  else window.location.assign(target.href);
}

document.getElementById("configure-game-button").addEventListener("click", openGameSettings);
document.getElementById("configure-game-connected-button").addEventListener("click", openGameSettings);

function setStepProgress(state) {
  const completedThrough = state === "room_lookup" ? 0
    : state === "connecting" ? 1
      : state === "connected" ? 2
        : -1;
  const activeStep = state === "room_lookup" ? 1
    : state === "connecting" ? 2
      : -1;
  stepOrder.forEach((step, index) => {
    const element = document.querySelector(`[data-connection-step="${step}"]`);
    element.classList.toggle("complete", index <= completedThrough);
    element.classList.toggle("active", index === activeStep);
  });
}

function safeGameTarget() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return "";
  try {
    const target = new URL(next, window.location.origin);
    if (target.origin !== window.location.origin || !target.pathname.startsWith("/games/")) return "";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return ""; }
}

function render(state) {
  if (!state || typeof state !== "object") return;
  const connectionState = state.status || "disconnected";
  panel.dataset.connectionState = connectionState;
  const connected = connectionState === "connected";
  const busy = inProgressStates.has(connectionState);
  const failed = connectionState === "error";

  form.hidden = connected;
  library.hidden = !connected;
  readyPanel.hidden = !connected;
  connectionTitle.textContent = connected ? "Koneksi LIVE aktif" : "Hubungkan akun LIVE";
  connectionCopy.textContent = connected
    ? "Listener siap. Semua game di hub akan menerima event dari siaran ini."
    : failed
      ? "Koneksi belum berhasil. Periksa username dan pastikan akun sedang LIVE, atau buka pengaturan game tanpa koneksi."
      : "Masukkan username akun TikTok LIVE untuk bermain, atau buka pengaturan game meski akun sedang offline.";
  usernameInput.disabled = busy;
  connectButton.disabled = busy;
  connectButton.querySelector("span:first-child").textContent = busy ? "Menghubungkan…" : "Hubungkan";
  statusTitle.textContent = connected ? "TikTok LIVE terhubung"
    : connectionState === "room_lookup" ? "Mencari siaran LIVE"
      : connectionState === "connecting" ? "Membuka koneksi"
        : connectionState === "disconnecting" ? "Memutuskan koneksi"
          : failed ? "Koneksi gagal"
            : "Belum terhubung";
  statusMessage.textContent = state.message || "Masukkan username TikTok yang sedang LIVE.";
  errorMessage.textContent = state.error || "";
  errorMessage.hidden = !state.error;
  connectedUsername.textContent = state.username ? `@${String(state.username).replace(/^@+/, "")}` : "TikTok LIVE";
  connectedUsername.dataset.username = String(state.username || "").replace(/^@+/, "");
  if (state.username && !usernameInput.value) usernameInput.value = String(state.username).replace(/^@+/, "");
  setStepProgress(connectionState);

  if (connectionState === "connected") {
    clearTimeout(pollTimer);
    beginGameSession(state.gameSessionId);
    const target = safeGameTarget();
    if (target) window.location.replace(target);
  } else if (busy) {
    schedulePoll();
  } else {
    clearTimeout(pollTimer);
  }
}

function showServerUnavailable(error) {
  render({
    status: "error",
    message: "Server game dan listener belum aktif.",
    error: `${error?.message || "Tidak dapat menghubungi server."} Jalankan server dengan perintah npm start dari folder project.`
  });
}

async function getStatus() {
  const response = await fetch("/api/tiktok/status", { cache: "no-store" });
  if (!response.ok) throw new Error(`Server merespons ${response.status}.`);
  return response.json();
}

async function refreshStatus() {
  try { render(await getStatus()); }
  catch (error) { showServerUnavailable(error); }
}

function schedulePoll() {
  clearTimeout(pollTimer);
  pollTimer = window.setTimeout(refreshStatus, 800);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim().replace(/^@+/, "");
  if (!username) {
    usernameInput.focus();
    return;
  }
  render({ status: "room_lookup", username, message: `Mencari siaran LIVE @${username}…` });
  try {
    const response = await fetch("/api/tiktok/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username })
    });
    const state = await response.json();
    render(state);
    if (!response.ok && state.status !== "connected") {
      errorMessage.textContent = state.error || "Server menolak permintaan koneksi.";
      errorMessage.hidden = false;
    }
  } catch (error) {
    showServerUnavailable(error);
  }
});

changeAccountButton.addEventListener("click", async () => {
  changeAccountButton.disabled = true;
  try {
    const response = await fetch("/api/tiktok/disconnect", { method: "POST" });
    const state = await response.json();
    if (!response.ok) throw new Error(state.error || "Koneksi belum dapat diputus.");
    usernameInput.value = "";
    render(state);
    usernameInput.focus();
  } catch (error) {
    errorMessage.textContent = error.message;
    errorMessage.hidden = false;
  } finally {
    changeAccountButton.disabled = false;
  }
});

refreshStatus();
