import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "libsql";
import { afterEach, describe, expect, it } from "vitest";
import { backupDb, listBackups } from "./backup";
import { openDb } from "./db";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "mathlete-backup-"));
  dirs.push(d);
  return d;
};

describe("database backups", () => {
  it("writes a readable copy and keeps only the newest ones", async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, "live.db"));
    db.prepare("INSERT INTO users (username, password_hash) VALUES ('saved', 'x')").run();
    const out = path.join(dir, "backups");

    const first = await backupDb(db, out, 2, new Date("2026-11-01T10:00:00Z"));
    expect(path.basename(first)).toBe("mathlete-2026-11-01T10-00-00Z.db");
    const copy = new Database(first, { readonly: true });
    expect(copy.prepare("SELECT username FROM users").all()).toEqual([{ username: "saved" }]);
    copy.close();

    await backupDb(db, out, 2, new Date("2026-11-02T10:00:00Z"));
    await backupDb(db, out, 2, new Date("2026-11-03T10:00:00Z"));
    expect(listBackups(out).map((f) => path.basename(f))).toEqual([
      "mathlete-2026-11-02T10-00-00Z.db",
      "mathlete-2026-11-03T10-00-00Z.db",
    ]);
    db.close();
  });
});
