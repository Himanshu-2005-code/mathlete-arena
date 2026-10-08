import http from "node:http";
import { createApp } from "./app";
import { PORT } from "./config";
import { openDb } from "./db";
import { attachSocket } from "./socket";

const db = openDb();
const app = createApp(db);
const server = http.createServer(app);
attachSocket(server, db);

server.listen(PORT, () => {
  console.log(`[matik] API + sockets on http://localhost:${PORT}`);
});
