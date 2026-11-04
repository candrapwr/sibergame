"use strict";

const loginView = document.querySelector("#login-view");
const disabledView = document.querySelector("#disabled-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const dashboardMessage = document.querySelector("#dashboard-message");
const passwordInput = document.querySelector("#admin-password");
const submitButton = loginForm.querySelector('button[type="submit"]');
const activityRows = document.querySelector("#activity-rows");

function showView(view) {
  loginView.hidden = view !== "login";
  disabledView.hidden = view !== "disabled";
  dashboardView.hidden = view !== "dashboard";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Permintaan gagal (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatAction(action) {
  if (action === "connected") return ["Akun LIVE terhubung", "connected"];
  if (action === "disconnected") return ["Akun LIVE terputus", "disconnected"];
  if (action === "game_opened") return ["Game dibuka", "game-opened"];
  return [action || "Aktivitas", ""];
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(date);
}

function appendCell(row, text, className = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  cell.textContent = text;
  row.append(cell);
  return cell;
}

function renderActivities(activities) {
  activityRows.replaceChildren();
  const accounts = new Set();
  for (const item of activities) {
    if (item.username) accounts.add(item.username.toLowerCase());
    const row = document.createElement("tr");
    appendCell(row, formatTimestamp(item.occurredAt), "time-cell");
    appendCell(row, `@${item.username || "—"}`, "username-cell");
    const actionCell = document.createElement("td");
    const badge = document.createElement("span");
    const [label, stateClass] = formatAction(item.action);
    badge.className = `activity-badge ${stateClass}`.trim();
    badge.textContent = label;
    actionCell.append(badge);
    row.append(actionCell);
    appendCell(row, item.gameId || "—");
    appendCell(row, item.sessionId ? item.sessionId.slice(0, 8) : "—", "session-id");
    activityRows.append(row);
  }
  document.querySelector("#activity-count").textContent = String(activities.length);
  document.querySelector("#account-count").textContent = String(accounts.size);
  document.querySelector("#empty-state").hidden = activities.length > 0;
  document.querySelector("#updated-label").textContent = `Diperbarui ${formatTimestamp(new Date().toISOString())} · maksimal 300 aktivitas terbaru`;
}

async function loadActivities() {
  dashboardMessage.textContent = "";
  document.querySelector("#updated-label").textContent = "Memuat aktivitas…";
  try {
    const data = await requestJson("/api/admin/usage");
    renderActivities(Array.isArray(data.activities) ? data.activities : []);
  } catch (error) {
    if (error.status === 401) {
      showView("login");
      loginMessage.textContent = "Sesi admin berakhir. Silakan masuk kembali.";
      return;
    }
    document.querySelector("#updated-label").textContent = "Log belum dapat dimuat.";
    dashboardMessage.textContent = error.message;
  }
}

async function initialize() {
  try {
    const status = await requestJson("/api/admin/session");
    if (!status.enabled) return showView("disabled");
    if (!status.authenticated) return showView("login");
    showView("dashboard");
    await loadActivities();
  } catch (error) {
    showView("login");
    loginMessage.textContent = error.message;
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "";
  submitButton.disabled = true;
  submitButton.firstElementChild.textContent = "Memverifikasi…";
  try {
    await requestJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: passwordInput.value })
    });
    passwordInput.value = "";
    showView("dashboard");
    await loadActivities();
  } catch (error) {
    loginMessage.textContent = error.message;
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
    submitButton.firstElementChild.textContent = "Masuk ke dashboard";
  }
});

document.querySelector("#toggle-password").addEventListener("click", (event) => {
  const isVisible = passwordInput.type === "text";
  passwordInput.type = isVisible ? "password" : "text";
  event.currentTarget.textContent = isVisible ? "Lihat" : "Tutup";
  event.currentTarget.setAttribute("aria-label", isVisible ? "Tampilkan password" : "Sembunyikan password");
});

document.querySelector("#refresh-button").addEventListener("click", loadActivities);
document.querySelector("#logout-button").addEventListener("click", async () => {
  try { await requestJson("/api/admin/logout", { method: "POST", body: "{}" }); }
  finally { showView("login"); }
});

void initialize();
