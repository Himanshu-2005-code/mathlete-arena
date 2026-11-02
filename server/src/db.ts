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
      kind       TEXT NOT NULL CHECK (kind IN ('sprint', 'puzzle', 'kenken', 'sudoku', 'maze', 'hectoc')),
      score      INTEGER NOT NULL,
      correct    INTEGER NOT NULL,
      time_ms    INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day, kind)
    );

    CREATE TABLE IF NOT EXISTS arcade_results (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game       TEXT NOT NULL CHECK (game IN ('flash', 'memory', 'truefalse', 'compare', 'sign')),
      score      INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_arcade_game ON arcade_results(game, score DESC);
  `);

  // Daily results started with only sprint and cross-math; widen the kinds as games are added.
  const daily = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'daily_results'").get() as
    | { sql: string }
    | undefined;
  if (daily && !daily.sql.includes("'hectoc'")) {
    db.transaction(() => {
      db.exec("ALTER TABLE daily_results RENAME TO daily_results_old");
      db.exec(`CREATE TABLE daily_results (
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day        TEXT NOT NULL,
        kind       TEXT NOT NULL CHECK (kind IN ('sprint', 'puzzle', 'kenken', 'sudoku', 'maze', 'hectoc')),
        score      INTEGER NOT NULL,
        correct    INTEGER NOT NULL,
        time_ms    INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, day, kind)
      )`);
      db.exec("INSERT INTO daily_results SELECT * FROM daily_results_old");
      db.exec("DROP TABLE daily_results_old");
    })();
  }

  // Arcade results started with flash and memory only; widen the games.
  const arcade = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'arcade_results'").get() as
    | { sql: string }
    | undefined;
  if (arcade && !arcade.sql.includes("'sign'")) {
    db.transaction(() => {
      db.exec("ALTER TABLE arcade_results RENAME TO arcade_results_old");
      db.exec(`CREATE TABLE arcade_results (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        game       TEXT NOT NULL CHECK (game IN ('flash', 'memory', 'truefalse', 'compare', 'sign')),
        score      INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec("INSERT INTO arcade_results SELECT * FROM arcade_results_old");
      db.exec("DROP TABLE arcade_results_old");
      db.exec("CREATE INDEX IF NOT EXISTS idx_arcade_game ON arcade_results(game, score DESC)");
    })();
  }

  // Added after the first release: flag computer opponents.
  const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "is_bot")) {
    db.exec("ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0");
  }

  // Indexes for the hot reads, created after the migrations above so they
  // survive any table rebuild:
  // - daily leaderboards (one kind, one day) and the weekly board (one kind,
  //   a range of days) both use (kind, day);
  // - profiles, player pages and arcade saves look up one player's arcade bests;
  // - practice personal bests look up one player's sprints by mode.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_daily_kind_day ON daily_results(kind, day);
    CREATE INDEX IF NOT EXISTS idx_arcade_user ON arcade_results(user_id, game, score DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_kind_mode ON sessions(user_id, kind, mode, duration_sec);
  `);
  return db;
}

export type Db = ReturnType<typeof openDb>;
