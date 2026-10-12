import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { BOT_AFTER_SECONDS, PORT, SERVE_WEB } from "./config";
import { openDb } from "./db";
import { attachSocket } from "./socket";

const db = openDb();
const app = createApp(db);
const server = http.createServer(app);
attachSocket(server, db, { botAfterMs: BOT_AFTER_SECONDS * 1000 });

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

server.listen(PORT, () => {
  console.log(`[matik] ${SERVE_WEB ? "game" : "API + sockets"} on http://localhost:${PORT}`);
});
