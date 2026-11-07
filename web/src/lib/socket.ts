"use client";

import { type Socket, io } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@mathlete/shared";
import { API_URL, getToken } from "./api";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** One shared, authenticated connection to the game server. */
export function getSocket(): GameSocket | null {
  const token = getToken();
  if (!token) return null;
  if (!socket) {
    const opts = { auth: { token }, transports: ["websocket"] };
    // An empty API_URL means the game is served from the same origin.
    socket = API_URL ? io(API_URL, opts) : io(opts);
  }
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}
