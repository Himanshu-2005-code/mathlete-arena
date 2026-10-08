import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyToken } from "./auth";
import { WEB_ORIGIN } from "./config";

/**
 * Real-time layer. Phase 1 only authenticates sockets and broadcasts how many
 * players are online; duels and matchmaking build on this in phase 2.
 */
export function attachSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, { cors: { origin: WEB_ORIGIN } });

  io.use((socket, next) => {
    const userId = verifyToken(socket.handshake.auth?.token);
    if (userId === null) return next(new Error("unauthorized"));
    socket.data.userId = userId;
    next();
  });

  const broadcastOnline = () => io.emit("presence", { online: io.of("/").sockets.size });

  io.on("connection", (socket) => {
    broadcastOnline();
    socket.on("disconnect", broadcastOnline);
  });

  return io;
}
