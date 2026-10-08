import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const PORT = Number(process.env.PORT ?? 4000);
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
export const DB_PATH = process.env.DB_PATH ?? path.resolve(here, "../data/matik.db");

const DEV_SECRET = "dev-only-secret-change-me";
export const JWT_SECRET = process.env.JWT_SECRET ?? DEV_SECRET;

if (JWT_SECRET === DEV_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Set JWT_SECRET in production.");
  }
  console.warn("[matik] JWT_SECRET not set; using an insecure development secret.");
}
