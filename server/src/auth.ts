import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "@matik/shared";
import { JWT_SECRET } from "./config";

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  rating: number;
  created_at: string;
}

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  username: u.username,
  rating: u.rating,
  createdAt: u.created_at,
});

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

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
