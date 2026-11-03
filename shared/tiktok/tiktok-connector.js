import { normalizeTikTokEvent } from "./event-contract.js";

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;

export class TikTokConnector {
  constructor() {
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.socket = null;
    this.retryTimer = null;
    this.endpoint = "";
    this.retryDelay = MIN_RETRY_MS;
    this.shouldReconnect = false;
    this.status = "disconnected";
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener harus berupa function.");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener) {
    if (typeof listener !== "function") throw new TypeError("Status listener harus berupa function.");
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  publish(input) {
    const event = normalizeTikTokEvent(input);
    if (!event) return false;
    this.listeners.forEach((listener) => {
      try { listener(event); }
      catch (error) { console.error("TikTok event listener gagal memproses event:", error); }
    });
    return event;
  }

  connect(endpoint) {
    if (typeof endpoint !== "string" || !endpoint.trim()) {
      throw new TypeError("Endpoint WebSocket listener TikTok harus diisi.");
    }
    this.disconnect();
    this.endpoint = endpoint.trim();
    this.retryDelay = MIN_RETRY_MS;
    this.shouldReconnect = true;
    this.openSocket();
  }

  openSocket() {
    if (!this.shouldReconnect || typeof WebSocket === "undefined") return;
    this.setStatus("connecting");
    try {
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.addEventListener("open", () => {
        if (this.socket !== socket) return;
        this.retryDelay = MIN_RETRY_MS;
        this.setStatus("connected");
      });
      socket.addEventListener("message", (message) => {
        if (this.socket !== socket) return;
        try { this.publish(JSON.parse(message.data)); }
        catch (error) { console.warn("Event TikTok bukan JSON yang valid.", error); }
      });
      socket.addEventListener("error", () => {
        if (this.socket === socket) this.setStatus("error");
      });
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        if (!this.shouldReconnect) return this.setStatus("disconnected");
        this.setStatus("reconnecting");
        this.retryTimer = window.setTimeout(() => this.openSocket(), this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
      });
    } catch (error) {
      this.setStatus("error");
      if (this.shouldReconnect) {
        this.retryTimer = window.setTimeout(() => this.openSocket(), this.retryDelay);
        this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
      }
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    this.setStatus("disconnected");
  }

  setStatus(status) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}

// Import this singleton from each game. Each game can subscribe and interpret
// the same normalized TikTok events according to its own rules.
export const tiktokConnector = new TikTokConnector();
