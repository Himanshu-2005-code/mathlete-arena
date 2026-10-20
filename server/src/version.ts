import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The version in server/package.json. */
export const APP_VERSION: string = (() => {
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json");
    return JSON.parse(readFileSync(file, "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
})();
