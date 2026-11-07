import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db";

const PREFIX = "mathlete-";
const SUFFIX = ".db";

/** "2026-11-02T17-05-09Z": sortable, and safe in file names everywhere. */
const stamp = (d: Date) => d.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");

/**
 * Copies the live database to `dir` with SQLite's VACUUM INTO (safe while
 * the game is running), then deletes the oldest copies beyond `keep`.
 * Returns the new file's path.
 */
export async function backupDb(db: Db, dir: string, keep = 7, now = new Date()): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${PREFIX}${stamp(now)}${SUFFIX}`);
  // VACUUM INTO writes a complete, compact copy in one statement, and works
  // with both plain SQLite and libSQL (which has no backup API).
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  pruneBackups(dir, keep);
  return file;
}

export function listBackups(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(SUFFIX))
    .sort()
    .map((f) => path.join(dir, f));
}

function pruneBackups(dir: string, keep: number) {
  const all = listBackups(dir);
  for (const old of all.slice(0, Math.max(0, all.length - Math.max(1, keep)))) fs.rmSync(old, { force: true });
}

/**
 * Backs up now and then every `everyHours`. Returns a function that stops it.
 * Failures are logged, never thrown: a missed backup mustn't take the game down.
 */
export function scheduleBackups(db: Db, dir: string, everyHours: number, keep: number): () => void {
  const run = () =>
    backupDb(db, dir, keep)
      .then((f) => console.log(`[mathlete] backup written: ${f}`))
      .catch((err) => console.error("[mathlete] backup failed:", err));
  void run();
  const timer = setInterval(run, everyHours * 3_600_000);
  timer.unref();
  return () => clearInterval(timer);
}
