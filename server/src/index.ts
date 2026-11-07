import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { BACKUP_DIR, BACKUP_EVERY_HOURS, BACKUP_KEEP, BOT_AFTER_SECONDS, PORT, SERVE_WEB } from "./config";
import { scheduleBackups } from "./backup";
import { openDb } from "./db";
import { attachSocket } from "./socket";

const db = openDb();
const app = createApp(db);
const server = http.createServer(app);
const { io, duels } = attachSocket(server, db, { botAfterMs: BOT_AFTER_SECONDS * 1000 });

// Production: serve the built Next.js app from this same server, so the site,
// API and sockets share one origin and one port.
if (SERVE_WEB) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web");
  const mod: any = await import("next");
  const createNext = mod.default?.default ?? mod.default ?? mod;
  const web = createNext({ dev: false, dir: webDir });
  await web.prepare();
  const handle = web.getRequestHandler();
  app.all("*", (req, res) => handle(req, res));
}

const stopBackups =
  BACKUP_EVERY_HOURS > 0 ? scheduleBackups(db, BACKUP_DIR, BACKUP_EVERY_HOURS, BACKUP_KEEP) : () => {};

server.listen(PORT, () => {
  console.log(`[mathlete] ${SERVE_WEB ? "game" : "API + sockets"} on http://localhost:${PORT}`);
});

// Hosts like Render send SIGTERM before replacing the server. Stop taking new
// work, let sockets close, and close the database so nothing is half-written.
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[mathlete] ${signal}: shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  stopBackups();
  duels.close();
  io.close(() => {
    server.close(() => {
      db.close();
      clearTimeout(force);
      process.exit(0);
    });
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
