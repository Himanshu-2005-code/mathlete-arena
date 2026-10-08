import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@matik/shared";
import { verifyToken } from "./auth";
import { WEB_ORIGIN } from "./config";
import type { Db } from "./db";
import { type DuelOptions, DuelManager } from "./duels";

/** Real-time layer: authenticated sockets feeding the duel manager. */
export function attachSocket(httpServer: HttpServer, db: Db, opts: DuelOptions = {}) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { cors: { origin: WEB_ORIGIN } });
  const duels = new DuelManager(io, db, opts);

  io.use((socket, next) => {
    const userId = verifyToken(socket.handshake.auth?.token);
    if (userId === null) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    next();
  });

  io.on("connection", (socket) => duels.attach(socket));

  return { io, duels };
}
