import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "@mathlete/shared";
import { JWT_SECRET } from "./config";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  rating: number;
  created_at: string;
  google_sub?: string | null;
}

/**
 * Stored as the password hash for Google-only accounts. It isn't a bcrypt
 * hash, so no password can ever match it.
 */
export const NO_PASSWORD = "!google-only";

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  username: u.username,
  rating: u.rating,
  createdAt: u.created_at,
  hasPassword: u.password_hash !== NO_PASSWORD,
});

/**
 * A username for a new Google player, from their name or email: letters,
 * digits and underscores, 3 to 20 long, never ending in _bot, and not taken.
 */
export function usernameFromGoogle(
  profile: { name?: string; email?: string },
  taken: (name: string) => boolean,
): string {
  const raw = (profile.name || profile.email?.split("@")[0] || "player")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  let base = (raw.length >= 3 ? raw : `player_${raw}`).slice(0, 16).replace(/_+$/, "");
  if (base.endsWith("_bot")) base = base.slice(0, -4) || "player";
  if (!taken(base)) return base;
  for (let i = 2; i < 10_000; i++) {
    const name = `${base.slice(0, 20 - String(i).length)}${i}`;
    if (!taken(name)) return name;
  }
  return `player${Date.now() % 1_000_000}`;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = async (pw: string, hash: string) => hash !== NO_PASSWORD && bcrypt.compare(pw, hash);

export function signToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: "30d" });
}

/** Returns the user id from a token, or null if it is missing or invalid. */
export function verifyToken(token: string | undefined): number | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const id = typeof payload === "object" ? Number(payload.sub) : NaN;
    return Number.isInteger(id) ? id : null;
  } catch {
    return null;
  }
}

export type AuthedRequest = Request & { userId: number };

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const userId = verifyToken(token);
  if (userId === null) {
    res.status(401).json({ error: "Not signed in" });
    return;
  }
  (req as AuthedRequest).userId = userId;
  next();
}
