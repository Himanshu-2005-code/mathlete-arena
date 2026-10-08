"use client";

import { type Socket, io } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@matik/shared";
import { API_URL, getToken } from "./api";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

/** One shared, authenticated connection to the game server. */
export function getSocket(): GameSocket | null {
  const token = getToken();
  if (!token) return null;
  if (!socket) {
    socket = io(API_URL, { auth: { token }, transports: ["websocket"] });
  }
  return socket;
}

export function closeSocket() {
  socket?.close();
  socket = null;
}
