"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const databases = new Map();

function databaseFor(rootDir, gameId) {
  if (!GAME_ID_PATTERN.test(gameId)) throw new Error("ID game tidak valid.");
  const gamesRoot = path.resolve(rootDir, "games");
  const gameRoot = path.resolve(gamesRoot, gameId);
  if (!gameRoot.startsWith(`${gamesRoot}${path.sep}`)) throw new Error("Folder game tidak valid.");
  if (!fs.existsSync(path.join(gameRoot, "index.html"))) throw new Error("Game tidak ditemukan.");

  const databasePath = path.join(gameRoot, "data", "settings.sqlite");
  if (databases.has(databasePath)) return databases.get(databasePath);

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("busy_timeout = 5000");
  database.exec(`
    CREATE TABLE IF NOT EXISTS game_settings (
      tiktok_username TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS gift_catalogs (
      tiktok_username TEXT PRIMARY KEY,
      catalog_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  databases.set(databasePath, database);
  return database;
}

function usernameKey(username) {
  const key = String(username || "").trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,50}$/.test(key)) throw new Error("Username TikTok tidak valid.");
  return key;
}

function getGameSettings(rootDir, gameId, username) {
  const key = usernameKey(username);
  const row = databaseFor(rootDir, gameId)
    .prepare("SELECT settings_json, updated_at FROM game_settings WHERE tiktok_username = ?")
    .get(key);
  if (!row) return null;
  return { settings: JSON.parse(row.settings_json), updatedAt: row.updated_at };
}

function saveGameSettings(rootDir, gameId, username, settings) {
  const key = usernameKey(username);
  const settingsJson = JSON.stringify(settings);
  const updatedAt = new Date().toISOString();
  databaseFor(rootDir, gameId).prepare(`
    INSERT INTO game_settings (tiktok_username, settings_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(tiktok_username) DO UPDATE SET
      settings_json = excluded.settings_json,
      updated_at = excluded.updated_at
  `).run(key, settingsJson, updatedAt);
  return updatedAt;
}

function getGameGiftCatalog(rootDir, gameId, username) {
  const key = usernameKey(username);
  const row = databaseFor(rootDir, gameId)
    .prepare("SELECT catalog_json, updated_at FROM gift_catalogs WHERE tiktok_username = ?")
    .get(key);
  if (!row) return null;
  return { gifts: JSON.parse(row.catalog_json), updatedAt: row.updated_at };
}

function saveGameGiftCatalog(rootDir, gameId, username, gifts) {
  const key = usernameKey(username);
  const updatedAt = new Date().toISOString();
  databaseFor(rootDir, gameId).prepare(`
    INSERT INTO gift_catalogs (tiktok_username, catalog_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(tiktok_username) DO UPDATE SET
      catalog_json = excluded.catalog_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(gifts), updatedAt);
  return updatedAt;
}

module.exports = { getGameSettings, saveGameSettings, getGameGiftCatalog, saveGameGiftCatalog };
