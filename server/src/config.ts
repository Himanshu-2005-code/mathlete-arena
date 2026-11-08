import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 4000);
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";

/**
 * Sites allowed to call the API and open duel sockets: a comma-separated
 * list, where an entry may start with "*." to cover subdomains, e.g.
 * "https://mathlete.vercel.app,https://*.vercel.app" for Vercel previews too.
 */
export function isAllowedOrigin(origin: string | undefined, allowed = WEB_ORIGIN): boolean {
  if (!origin) return true; // same-origin requests and non-browser clients
  return allowed
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .some((entry) => {
      if (entry === "*") return true;
      const wild = entry.match(/^(https?:\/\/)\*\.(.+)$/);
      if (!wild) return origin === entry;
      const [, scheme, base] = wild;
      return origin.startsWith(scheme) && origin.endsWith(`.${base}`) && !origin.slice(scheme.length).includes("/");
    });
}

/** The cors/socket.io origin option built from WEB_ORIGIN. */
export const corsOrigin = (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) =>
  cb(null, isAllowedOrigin(origin));
export const DB_PATH = process.env.DB_PATH ?? path.resolve(here, "../data/mathlete.db");

/** Where database backups go (`npm run backup`, and automatic ones when BACKUP_EVERY_HOURS is set). */
/**
 * Turso (hosted libSQL). When TURSO_DATABASE_URL is set, DB_PATH becomes a
 * local replica that syncs with Turso, so data survives restarts and deploys
 * even on hosts without a disk. Leave unset to use a plain local SQLite file.
 */
/**
 * Google sign-in: the OAuth client ID from Google Cloud (it's public, not a
 * secret). When unset, the "Sign in with Google" button is hidden.
 */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || "";

export const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL?.trim() || "";
export const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN?.trim() || "";
/** How often (seconds) the local replica pulls changes from Turso. */
export const TURSO_SYNC_SECONDS = Number(process.env.TURSO_SYNC_SECONDS ?? 60);

export const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(path.dirname(DB_PATH), "backups");
/** How many backups to keep; older ones are deleted. */
export const BACKUP_KEEP = Number(process.env.BACKUP_KEEP ?? 7);
/** Back up automatically this often while the server runs; 0 (default) turns it off. */
export const BACKUP_EVERY_HOURS = Number(process.env.BACKUP_EVERY_HOURS ?? 0);

/** Daily challenges roll over at midnight in this UTC offset (default IST). */
export const DAILY_UTC_OFFSET_MIN = Number(process.env.DAILY_UTC_OFFSET_MIN ?? 330);

/** Seconds in the queue before a computer opponent steps in. 0 turns bots off. */
export const BOT_AFTER_SECONDS = Number(process.env.BOT_AFTER_SECONDS ?? 10);

/** Sign-in and sign-up attempts allowed per address every 15 minutes. */
export const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 30);

/** Score submissions (sprints, puzzles, daily, arcade) allowed per address each minute. */
export const WRITE_RATE_LIMIT = Number(process.env.WRITE_RATE_LIMIT ?? 60);

/** Trust the hosting platform's proxy for client addresses (on by default in production). */
export const TRUST_PROXY = (process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? "1" : "0")) === "1";

/** Log one line per API request (on by default in production). */
export const LOG_REQUESTS = (process.env.LOG_REQUESTS ?? (process.env.NODE_ENV === "production" ? "1" : "0")) === "1";

/** In production the API server also serves the web app, on one port. */
export const SERVE_WEB = process.env.SERVE_WEB === "1";

const DEV_SECRET = "dev-only-secret-change-me";
/** Shortest sign-in secret allowed in production (Render's generated values are 44 characters). */
export const MIN_SECRET_LENGTH = 32;

/**
 * Anyone who knows the sign-in secret can forge a token for any account, so in
 * production refuse to start with a missing, placeholder or short one. Returns
 * an error to throw, a warning to log, or null when the secret is fine.
 */
export function checkJwtSecret(
  secret: string | undefined,
  production: boolean,
): { error: string } | { warning: string } | null {
  const value = secret?.trim() ?? "";
  const problem =
    value === "" || value === DEV_SECRET
      ? "JWT_SECRET is not set"
      : value.length < MIN_SECRET_LENGTH
        ? `JWT_SECRET is only ${value.length} characters; use at least ${MIN_SECRET_LENGTH}`
        : null;
  if (!problem) return null;
  if (production) return { error: `${problem}. Generate one with: openssl rand -base64 32` };
  return { warning: `${problem}; fine for development, not for production.` };
}

export const JWT_SECRET = process.env.JWT_SECRET?.trim() || DEV_SECRET;

const secretCheck = checkJwtSecret(process.env.JWT_SECRET, process.env.NODE_ENV === "production");
if (secretCheck && "error" in secretCheck) throw new Error(secretCheck.error);
if (secretCheck) console.warn(`[mathlete] ${secretCheck.warning}`);
