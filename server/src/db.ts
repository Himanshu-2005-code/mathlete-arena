import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DB_PATH } from "./config";

export function openDb(file = DB_PATH) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      rating        INTEGER NOT NULL DEFAULT 1000,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL CHECK (kind IN ('practice', 'puzzle')),
      mode         TEXT NOT NULL,
      duration_sec INTEGER,
      adaptive     INTEGER NOT NULL DEFAULT 0,
      score        INTEGER NOT NULL DEFAULT 0,
      correct      INTEGER NOT NULL DEFAULT 0,
      attempts     INTEGER NOT NULL DEFAULT 0,
      max_level    INTEGER,
      avg_ms       INTEGER,
      duration_ms  INTEGER NOT NULL DEFAULT 0,
      seed         INTEGER,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS duels (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      p1_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      p2_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seed          INTEGER NOT NULL,
      score1        INTEGER NOT NULL,
      score2        INTEGER NOT NULL,
      winner_id     INTEGER,
      change1       INTEGER NOT NULL,
      change2       INTEGER NOT NULL,
      rating_after1 INTEGER NOT NULL,
      rating_after2 INTEGER NOT NULL,
      reason        TEXT NOT NULL CHECK (reason IN ('time', 'forfeit')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_duels_p1 ON duels(p1_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_duels_p2 ON duels(p2_id, created_at DESC);

    -- One attempt per player per day per kind; the first one counts.
    CREATE TABLE IF NOT EXISTS daily_results (
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day        TEXT NOT NULL,
      kind       TEXT NOT NULL CHECK (kind IN ('sprint', 'puzzle')),
      score      INTEGER NOT NULL,
      correct    INTEGER NOT NULL,
      time_ms    INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day, kind)
    );
  `);
  return db;
}

export type Db = ReturnType<typeof openDb>;
