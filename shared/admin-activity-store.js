"use strict";

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function createAdminActivityStore(rootDir) {
  const dataDir = path.join(rootDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const database = new Database(path.join(dataDir, "admin.sqlite"));
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS usage_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      game_id TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS usage_activity_occurred_at_idx
      ON usage_activity (occurred_at DESC);
  `);

  const insertActivity = database.prepare(`
    INSERT INTO usage_activity (occurred_at, username, action, game_id, session_id)
    VALUES (@occurredAt, @username, @action, @gameId, @sessionId)
  `);
  const selectActivities = database.prepare(`
    SELECT id, occurred_at AS occurredAt, username, action,
      game_id AS gameId, session_id AS sessionId
    FROM usage_activity
    ORDER BY id DESC
    LIMIT ?
  `);

  return {
    record(activity) {
      insertActivity.run({
        occurredAt: new Date().toISOString(),
        username: String(activity.username || "").slice(0, 50),
        action: String(activity.action || "").slice(0, 40),
        gameId: String(activity.gameId || "").slice(0, 80),
        sessionId: String(activity.sessionId || "").slice(0, 80)
      });
    },
    list(limit = 300) {
      return selectActivities.all(Math.max(1, Math.min(500, Math.floor(Number(limit) || 300))));
    },
    close() {
      database.close();
    }
  };
}

module.exports = { createAdminActivityStore };
