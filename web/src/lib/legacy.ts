/**
 * The game used to be called Matik and saved browser settings under "matik.*".
 * Copy them to the new "mathlete.*" names once, so nobody loses their login,
 * theme, sound or practice settings after the rename.
 */
const KEYS = ["token", "theme", "sound", "practice", "puzzle"];

export function migrateLegacyStorage() {
  if (typeof window === "undefined") return;
  try {
    for (const k of KEYS) {
      const old = localStorage.getItem(`matik.${k}`);
      if (old === null) continue;
      if (localStorage.getItem(`mathlete.${k}`) === null) localStorage.setItem(`mathlete.${k}`, old);
      localStorage.removeItem(`matik.${k}`);
    }
  } catch {
    /* storage unavailable: nothing to move */
  }
}
